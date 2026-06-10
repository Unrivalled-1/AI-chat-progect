"""
pipeline.py — The Dynamic Flow Plane Orchestrator

Runs the full multi-agent reasoning pipeline for every user message:

    NEW_REQUEST / ITERATION:
        1. Classify → 2. Introspect (generate self-questions) → 3. Slice context
        → 4. Strategy Fork (Architect / Skeptic) → 5. Synthesize
        → 6. BugCheck → 7. Historian (final cross-check)

  SUCCESS:
    1. Classify → 2. Scribe (update manifesto) → 3. Thought Recorder
       (save the thought process that worked) → 4. Promote best questions

  RETRY:
    1. Classify → 2. Log failure + penalise heuristics → 3. Mark thought
       process as failed → 4. Re-plan with failure context

  CLARIFICATION:
    1. Classify → 2. Lightweight clarification response

Returns a structured result with the final reply AND all intermediate
agent traces so the UI can display the "thinking" steps.
"""

import json
import logging
import time
from dataclasses import dataclass, field
from .search import duckduckgo_search, fetch_web_excerpt
from .classifier import (
    build_classifier_messages,
    parse_classification,
    parse_classification_json,
    is_valid_classification_json,
)
from .slicer import build_context_slice, get_heuristic_ids_used
from .strategists import (
    build_architect_messages,
    build_skeptic_messages,
    build_historian_messages,
    build_architect_v2_messages,
)
from .synthesizer import (
    build_synthesizer_messages,
    build_bugcheck_messages,
    parse_bugcheck,
    parse_bugcheck_json,
    is_valid_bugcheck_json,
    build_fix_messages,
)
from .introspector import (
    build_introspector_messages,
    parse_introspector_response,
    parse_introspector_json,
    is_valid_introspector_json,
)
from .learning import (
    on_success,
    on_failure,
)
from .constitution import time_context, compose_system_prompt, CONSTITUTION
from . import memory

logger = logging.getLogger("vibe.pipeline")


# ── Model presets ───────────────────────────────────────────────────────────

MULTI_PRESET_ID = "preset-multi-qwen"
MULTI_LIGHT_MODEL = "Qwen/Qwen2.5-Coder-7B-Instruct:cheapest"
MULTI_STRONG_MODEL = "Qwen/Qwen2.5-Coder-32B-Instruct:cheapest"


def _resolve_agent_models(selected_model: str) -> dict[str, str]:
    """Return per-agent model routing for the selected model/preset."""
    if selected_model != MULTI_PRESET_ID:
        return {"default": selected_model}

    return {
        "default": MULTI_LIGHT_MODEL,
        "classifier": MULTI_LIGHT_MODEL,
        "introspector": MULTI_LIGHT_MODEL,
        "architect": MULTI_LIGHT_MODEL,
        "skeptic": MULTI_LIGHT_MODEL,
        "historian": MULTI_LIGHT_MODEL,
        "bugchecker": MULTI_LIGHT_MODEL,
        "clarifier": MULTI_LIGHT_MODEL,
        "synthesizer": MULTI_STRONG_MODEL,
        "synthesizer_fix": MULTI_STRONG_MODEL,
        "scribe_recorder": MULTI_STRONG_MODEL,
        "direct": MULTI_STRONG_MODEL,
    }


def _model_for(agent: str, model_map: dict[str, str]) -> str:
    return model_map.get(agent, model_map.get("default", MULTI_LIGHT_MODEL))


# ── Result container ─────────────────────────────────────────────────────────

@dataclass
class AgentTrace:
    """One agent's contribution."""
    agent: str
    content: str
    input_messages: list[dict] = field(default_factory=list)
    elapsed_ms: int = 0


@dataclass
class PipelineResult:
    """Everything the pipeline produces for one user turn."""
    classification: str = ""
    tags: list[str] = field(default_factory=list)
    summary: str = ""
    traces: list[AgentTrace] = field(default_factory=list)
    final_reply: str = ""
    error: str | None = None
    checkpoints: list = field(default_factory=list)
    memory_influence: list = field(default_factory=list)


# ── LLM helper ───────────────────────────────────────────────────────────────

def _is_gemini(model: str) -> bool:
    return model.startswith("gemini-")


def _llm_call(client, model: str,
              messages: list[dict], max_tokens: int = 768,
              temperature: float = 0.5, on_chunk=None) -> str:
    """Single LLM call that routes to Gemini or HuggingFace."""

    if _is_gemini(model):
        # ── Google Gemini path ────────────────────────────────────
        from google.genai import types

        # Strip prefix if it exists to avoid 404/NOT_FOUND errors in some API versions
        clean_model = model.replace("models/", "")

        # Convert chat messages to Gemini format:
        #   system messages → system_instruction
        #   user/assistant  → contents list
        system_parts = []
        contents = []
        for msg in messages:
            role = msg.get("role", "user")
            text = msg.get("content", "")
            
            # Gemini rejects empty strings
            if not text or not text.strip():
                continue

            if role == "system":
                system_parts.append(text)
            else:
                # Gemini uses "user" and "model" (not "assistant")
                gemini_role = "model" if role == "assistant" else "user"
                contents.append(
                    types.Content(
                        role=gemini_role,
                        parts=[types.Part.from_text(text=text)],
                    )
                )

        config = types.GenerateContentConfig(
            temperature=temperature,
            max_output_tokens=max_tokens,
        )
        if system_parts:
            config.system_instruction = "\n\n".join(system_parts)

        try:
            if on_chunk:
                response = client.models.generate_content_stream(
                    model=clean_model,
                    contents=contents,
                    config=config,
                )
                full_text = ""
                for chunk in response:
                    if chunk.text:
                        full_text += chunk.text
                        on_chunk(full_text)
                return full_text
            else:
                response = client.models.generate_content(
                    model=clean_model,
                    contents=contents,
                    config=config,
                )
                if response and response.text:
                    return response.text
                return "Error: Empty response from AI."
        except Exception as exc:
            detail = getattr(exc, 'message', None) or getattr(exc, 'errors', None) or str(exc)
            # Keep a clear message while avoiding dependency on google.api_core exception classes.
            if "not found" in str(detail).lower() or "404" in str(detail):
                raise RuntimeError(
                    f"Gemini model {clean_model} is unavailable for generateContent: {detail}"
                ) from exc
            raise RuntimeError(
                f"Gemini API error for {model}: {detail}"
            ) from exc
    else:
        # ── HuggingFace path (original) ──────────────────────────
        # The client is already configured in app.py with the correct base_url or provider.

        if on_chunk:
            response = client.chat_completion(
                model=model,
                messages=messages,
                max_tokens=max_tokens,
                temperature=temperature,
                stream=True,
            )
            full_text = ""
            for chunk in response:
                try:
                    delta = chunk.choices[0].delta.content or ""
                except IndexError:
                    logger.error("IndexError in stream chunk in pipeline: %s", chunk)
                    if not full_text:
                        raise RuntimeError(f"HuggingFace API returned empty choices for model {model}. Chunk: {chunk}")
                    break
                if delta:
                    full_text += delta
                    on_chunk(full_text)
            return full_text
        else:
            response = client.chat_completion(
                model=model,
                messages=messages,
                max_tokens=max_tokens,
                temperature=temperature,
            )
            try:
                return response.choices[0].message.content
            except IndexError:
                logger.error("IndexError in _llm_call! response: %s", response)
                raise RuntimeError(f"HuggingFace API returned empty choices for model {model}. Raw response: {response}")


def _call_with_json_retry(
    client,
    model: str,
    messages: list[dict],
    *,
    parse_fn,
    valid_fn,
    max_tokens: int,
    temperature: float,
    retries: int = 2,
):
    """Call model and retry when response is not valid JSON payload for parser."""
    current_messages = list(messages)
    last_raw = ""

    for attempt in range(retries + 1):
        last_raw = _llm_call(
            client,
            model,
            current_messages,
            max_tokens=max_tokens,
            temperature=temperature if attempt == 0 else 0.15,
        )

        if valid_fn(last_raw):
            parsed = parse_fn(last_raw)
            if parsed is not None:
                return last_raw, parsed, attempt

        if attempt < retries:
            current_messages = current_messages + [
                {
                    "role": "user",
                    "content": (
                        "Your previous output was invalid for the required format. "
                        "Return ONLY valid JSON in the exact requested schema. "
                        "No markdown fences, no prose."
                    ),
                }
            ]

    return last_raw, parse_fn(last_raw), retries


# ── Main pipeline ────────────────────────────────────────────────────────────

# Per-session state to track the most recent heuristic IDs and context
# so the learning loop knows what to reward/penalise.
_session: dict = {
    "last_heuristic_ids": [],
    "last_tags": [],
    "last_summary": "",
    "last_user_message": "",
    "last_final_reply": "",
    "last_generated_questions": [],
    "last_architect_plan": "",
}


def _mask_code_context(messages: list[dict]) -> list[dict]:
    """Hide large codebase snapshots in trace input_messages."""
    masked = []
    for msg in messages:
        content = msg.get("content", "")
        if "═══ CODEBASE SNAPSHOT ═══" in content:
            before, _, rest = content.partition("═══ CODEBASE SNAPSHOT ═══")
            after = ""
            if "═══ CURRENT TASK ═══" in rest:
                _, _, after = rest.partition("═══ CURRENT TASK ═══")
                after = "═══ CURRENT TASK ═══" + after
            content = (
                before
                + "═══ CODEBASE SNAPSHOT ═══\n"
                + "(full codebase sent)\n\n"
                + after
            )
        masked.append({**msg, "content": content})
    return masked


def _needs_more_info(
    user_message: str,
    tags: list[str],
    generated_questions: list[str],
) -> bool:
    """Heuristic gate to ask for clarification on complex tasks."""
    if not generated_questions:
        return False

    msg = user_message.lower()
    # Long + multi-domain request tends to be under-specified.
    if len(msg) > 280 and len(tags) >= 4 and len(generated_questions) >= 4:
        return True

    # Very short "build X" asks are often ambiguous.
    complexity_keywords = {
        "build", "design", "create", "implement", "full", "app",
        "system", "pipeline", "architecture", "database", "api",
        "frontend", "backend", "dashboard", "workflow",
    }
    if len(msg) < 60 and any(k in msg for k in complexity_keywords):
        return True

    ambiguity_markers = {"something", "whatever", "kind of", "sort of", "etc", "and stuff"}
    if any(k in msg for k in ambiguity_markers) and len(generated_questions) >= 3:
        return True

    return False


def run_pipeline(
    client,
    model: str,
    user_message: str,
    conversation_history: list[dict] | None = None,
    reasoning_mode: str = "once",  # "once" or "loop"
    run_id: str | None = None,
    branch_id: str = "main",
    resume_from_checkpoint: str | None = None,
    on_step_update = None,
) -> PipelineResult:
    """
    Execute the full reasoning pipeline for one user message.
    
    Modes:
      - "once": Linear pass. Architect -> Skeptic -> Synthesize -> BugCheck -> (Fix if needed) -> Historian.
      - "loop": Iterative refinement. Synthesize -> BugCheck -> Fix -> BugCheck -> ... until PASS or limit.
    """

    # Compatibility metadata accepted from higher-level orchestration flows.
    # The core pipeline is currently stateless regarding run/branch/checkpoint IDs,
    # but these args are intentionally accepted to keep app-level APIs stable.
    _ = (run_id, branch_id, resume_from_checkpoint)

    result = PipelineResult()
    model_map = _resolve_agent_models(model)

    def notify_update(agent_name, status, content="", elapsed_ms=0, input_messages=None):
        if on_step_update:
            try:
                on_step_update(agent_name, status, content, elapsed_ms, input_messages)
            except Exception as e:
                logger.warning(f"Error in on_step_update callback: {e}")

    try:
        # ── Dedicated Historian Reasoning Mode: Just one stage ──
        if reasoning_mode == "historian":
            notify_update("Historian", "running")
            t0 = time.perf_counter()
            
            # Prepare conversation history text for context
            history_text = ""
            if conversation_history:
                history_text = "\n".join([f"{msg.get('role', 'user').upper()}: {msg.get('content', '')}" for msg in conversation_history])
            else:
                history_text = "(No previous conversation history)"
                
            # Dedicated Historian prompt
            hist_msgs = [
                {
                    "role": "system",
                    "content": (
                        "You are the dedicated Historian. Your task is to act as the ultimate chronicler of the user session.\n"
                        "You MUST review the conversation history up to this point and record everything that has transpired in a comprehensive, structured memory log.\n"
                        "Then, you must provide a clean, high-level summary of the status, key takeaways, and decisions made so far to the user as a few short bullet points.\n\n"
                        "Format your output in TWO sections, clearly demarcated as follows:\n\n"
                        "=== DEDICATED MEMORY RECORD ===\n"
                        "[Write a detailed, comprehensive history/scribe record of the conversation, key technical design decisions, completed actions, and ongoing context to be persisted in memory. This should be deep and thorough.]\n\n"
                        "=== USER SUMMARY ===\n"
                        "[Provide a few short, high-quality, bullet points highlighting the current status, key takeaways, and next actions directly for the user.]"
                    )
                },
                {
                    "role": "user",
                    "content": (
                        f"## Conversation History:\n{history_text}\n\n"
                        f"## Latest User Message:\n{user_message}\n\n"
                        "Please record the session memory and output the user bullet point summary."
                    )
                }
            ]
            
            hist_model = _model_for("historian", model_map)
            response_text = _llm_call(client, hist_model, hist_msgs, max_tokens=1500)
            elapsed = int((time.perf_counter() - t0) * 1000)
            
            # Parse response
            memory_record = ""
            user_summary = ""
            
            if "=== DEDICATED MEMORY RECORD ===" in response_text and "=== USER SUMMARY ===" in response_text:
                parts = response_text.split("=== USER SUMMARY ===")
                user_summary = parts[1].strip()
                subparts = parts[0].split("=== DEDICATED MEMORY RECORD ===")
                memory_record = subparts[1].strip()
            elif "=== USER SUMMARY ===" in response_text:
                parts = response_text.split("=== USER SUMMARY ===")
                user_summary = parts[1].strip()
                memory_record = parts[0].replace("=== DEDICATED MEMORY RECORD ===", "").strip()
            else:
                user_summary = response_text
                memory_record = response_text
                
            # Log the memory record
            if memory_record:
                memory.log_historian_note(
                    summary=memory_record,
                    tags=["historian-mode", "summary"],
                    matched_failure=False,
                )
                memory.append_to_manifesto(f"Historian Mode Session Summary:\n{memory_record[:800]}")
                
            result.classification = "HISTORIAN"
            result.tags = ["historian", "summary"]
            result.summary = "Historian Mode Session Summary"
            result.final_reply = user_summary
            
            notify_update("Historian", "completed", content=response_text, elapsed_ms=elapsed, input_messages=_mask_code_context(hist_msgs))
            result.traces.append(AgentTrace(
                agent="Historian",
                content=response_text,
                input_messages=_mask_code_context(hist_msgs),
                elapsed_ms=elapsed,
            ))
            
            return result

        # ── Step 1 : Classify ────────────────────────────────────────
        notify_update("Classifier", "running")
        t0 = time.perf_counter()
        cls_messages = build_classifier_messages(user_message)
        cls_model = _model_for("classifier", model_map)
        cls_raw, cls_data, cls_retries = _call_with_json_retry(
            client,
            cls_model,
            cls_messages,
            parse_fn=parse_classification_json,
            valid_fn=is_valid_classification_json,
            max_tokens=200,
            temperature=0.1,
            retries=2,
        )
        if cls_data is None:
            cls_data = parse_classification(cls_raw)
        elapsed = int((time.perf_counter() - t0) * 1000)

        result.classification = cls_data["classification"]
        result.tags = cls_data["tags"]
        result.summary = cls_data["summary"]
        
        # --- Web Search Gathering ---
        if cls_data.get("needs_web_search") and reasoning_mode == "fast":
            notify_update("Classifier (Search)", "running")
            s_t0 = time.perf_counter()
            hits = duckduckgo_search(user_message, max_results=3)
            if hits:
                chunks = []
                for h in hits:
                    excerpt = fetch_web_excerpt(h["url"], max_chars=1200)
                    chunks.append(f"Title: {h['title']}\nURL: {h['url']}\nContent: {excerpt}\n")
                search_context = "[AUTO_GATHERED_WEB_CONTEXT]\n" + "\n".join(chunks) + "\n[/AUTO_GATHERED_WEB_CONTEXT]\n\n"
                
                search_content = f"Gathered live web context from {len(hits)} sources."
                search_elapsed = int((time.perf_counter() - s_t0) * 1000)
                notify_update("Classifier (Search)", "completed", content=search_content, elapsed_ms=search_elapsed, input_messages=[{"role": "system", "content": "Search query: " + user_message}])
                result.traces.append(AgentTrace(
                    agent="Classifier (Search)",
                    content=search_content,
                    input_messages=[{"role": "system", "content": "Search query: " + user_message}],
                    elapsed_ms=search_elapsed,
                ))
                user_message = search_context + user_message
            else:
                notify_update("Classifier (Search)", "completed", content="No search results found.", elapsed_ms=0, input_messages=[{"role": "system", "content": "Search query: " + user_message}])

        cls_content = (f"Type: {result.classification}\n"
                      f"Tags: {', '.join(result.tags)}\n"
                      f"Summary: {result.summary}\n"
                      f"Intent: {cls_data.get('intent_detail', '')}\n"
                      f"JSON retries: {cls_retries}")
        notify_update("Classifier", "completed", content=cls_content, elapsed_ms=elapsed, input_messages=cls_messages)
        result.traces.append(AgentTrace(
            agent="Classifier",
            content=cls_content,
            input_messages=cls_messages,
            elapsed_ms=elapsed,
        ))

        logger.info("Classified as %s  tags=%s", result.classification, result.tags)

        # ── Route by intent ──────────────────────────────────────────

        # Handle SUCCESS → trigger learning loop
        if result.classification == "SUCCESS":
            return _handle_success(client, model_map, user_message, result)

        # Handle RETRY → trigger failure learning, then re-plan
        if result.classification == "RETRY":
            _handle_failure(user_message)
            # Fall through to re-plan with failure now in memory

        # Handle CLARIFICATION → lightweight response
        if result.classification == "CLARIFICATION":
            return _handle_clarification(client, model_map, user_message, result)

        # ── NEW_REQUEST or ITERATION or RETRY (re-plan) ─────────────

        # Step 2 : Introspect — generate self-questions
        notify_update("Introspector", "running")
        t0 = time.perf_counter()
        intro_msgs = build_introspector_messages(
            user_message, result.tags, result.summary
        )
        intro_model = _model_for("introspector", model_map)
        intro_raw, intro_data, intro_retries = _call_with_json_retry(
            client,
            intro_model,
            intro_msgs,
            parse_fn=parse_introspector_json,
            valid_fn=is_valid_introspector_json,
            max_tokens=400,
            temperature=0.7,
            retries=2,
        )
        generated_questions = intro_data if intro_data is not None else parse_introspector_response(intro_raw)
        elapsed = int((time.perf_counter() - t0) * 1000)

        intro_content = "Self-generated questions:\n" + "\n".join(
            f"  • {q}" for q in generated_questions
        ) + f"\nJSON retries: {intro_retries}"
        notify_update("Introspector", "completed", content=intro_content, elapsed_ms=elapsed, input_messages=intro_msgs)
        result.traces.append(AgentTrace(
            agent="Introspector",
            content=intro_content,
            input_messages=intro_msgs,
            elapsed_ms=elapsed,
        ))
        logger.info("Introspector generated %d questions", len(generated_questions))

        # Store for later learning
        _session["last_generated_questions"] = generated_questions

        # ── Clarification gate for genuinely under-specified complex tasks
        if _needs_more_info(user_message, result.tags, generated_questions):
            top_qs = generated_questions[:3]
            questions_block = "\n".join(f"- {q}" for q in top_qs)
            reply = (
                "I can do this, but I need a bit more detail before I proceed:\n\n"
                f"{questions_block}\n\n"
                "Reply with those details and I’ll continue immediately."
            )
            notify_update("Clarifier", "completed", content=reply, elapsed_ms=0, input_messages=[])
            result.traces.append(AgentTrace(
                agent="Clarifier",
                content=reply,
                input_messages=[],
                elapsed_ms=0,
            ))
            result.final_reply = reply
            return result

        # ── Step 3 : Slice context (now includes self-questions) ─────
        context_slice = build_context_slice(
            result.tags, user_message, result.summary,
            conversation_history=conversation_history,
            generated_questions=generated_questions,
            include_code=True,
        )
        heuristic_ids = get_heuristic_ids_used(result.tags)

        # Store in session for future learning
        _session["last_heuristic_ids"] = heuristic_ids
        _session["last_tags"] = result.tags
        _session["last_summary"] = result.summary
        _session["last_user_message"] = user_message

        # ── Step 4a : Architect (gets context + Introspector questions) ──
        notify_update("Architect", "running")
        t0 = time.perf_counter()
        recent_failures = memory.get_recent_failures(n=8)
        arch_msgs = build_architect_messages(
            context_slice,
            generated_questions,
            recent_failures=recent_failures,
        )
        arch_model = _model_for("architect", model_map)
        architect_plan = _llm_call(client, arch_model, arch_msgs)
        elapsed = int((time.perf_counter() - t0) * 1000)
        notify_update("Architect", "completed", content=architect_plan, elapsed_ms=elapsed, input_messages=_mask_code_context(arch_msgs))
        result.traces.append(AgentTrace(
            agent="Architect",
            content=architect_plan,
            input_messages=_mask_code_context(arch_msgs),
            elapsed_ms=elapsed,
        ))
        _session["last_architect_plan"] = architect_plan

        # ── Step 4b : Skeptic (gets context + questions + Architect plan) ──
        notify_update("Skeptic", "running")
        t0 = time.perf_counter()
        skep_msgs = build_skeptic_messages(
            context_slice, architect_plan, generated_questions
        )
        skeptic_model = _model_for("skeptic", model_map)
        skeptic_critique = _llm_call(client, skeptic_model, skep_msgs)
        elapsed = int((time.perf_counter() - t0) * 1000)
        notify_update("Skeptic", "completed", content=skeptic_critique, elapsed_ms=elapsed, input_messages=_mask_code_context(skep_msgs))
        result.traces.append(AgentTrace(
            agent="Skeptic",
            content=skeptic_critique,
            input_messages=_mask_code_context(skep_msgs),
            elapsed_ms=elapsed,
        ))

        # ── Step 4c : Architect (V2) (gets its own plan + Skeptic critique) ──
        notify_update("Architect (V2)", "running")
        t0 = time.perf_counter()
        arch_v2_msgs = build_architect_v2_messages(
            context_slice, architect_plan, skeptic_critique, generated_questions
        )
        architect_plan_v2 = _llm_call(client, arch_model, arch_v2_msgs)
        elapsed = int((time.perf_counter() - t0) * 1000)
        notify_update("Architect (V2)", "completed", content=architect_plan_v2, elapsed_ms=elapsed, input_messages=_mask_code_context(arch_v2_msgs))
        result.traces.append(AgentTrace(
            agent="Architect (V2)",
            content=architect_plan_v2,
            input_messages=_mask_code_context(arch_v2_msgs),
            elapsed_ms=elapsed,
        ))

        architect_plan = architect_plan_v2
        _session["last_architect_plan"] = architect_plan

        # ── Step 5 : Synthesizer (gets Architect + Skeptic) ─────────
        notify_update("Synthesizer", "running")
        t0 = time.perf_counter()
        syn_msgs = build_synthesizer_messages(
            user_message, generated_questions,
            architect_plan, skeptic_critique,
            context_slice=context_slice
        )
        synth_model = _model_for("synthesizer", model_map)
        final_reply = _llm_call(client, synth_model, syn_msgs, max_tokens=2048)
        elapsed = int((time.perf_counter() - t0) * 1000)
        notify_update("Synthesizer", "completed", content=final_reply, elapsed_ms=elapsed, input_messages=syn_msgs)
        result.traces.append(AgentTrace(
            agent="Synthesizer",
            content=final_reply,
            input_messages=syn_msgs,
            elapsed_ms=elapsed,
        ))

        # ── Step 6 : BugChecker / Iterative Fix Loop ────────────────
        # Loop logic: If mode="loop", repeat check -> fix until PASS or limit
        # If mode="once", do exactly one pass (check -> maybe fix).
        
        if reasoning_mode == "fast":
            # Fast mode bypasses the BugChecker entirely for speed.
            max_iterations = 0
            current_reply = final_reply
            result.final_reply = final_reply
        else:
            max_iterations = 3 if reasoning_mode == "loop" else 1
            current_reply = final_reply
        
        for i in range(max_iterations):
            notify_update("BugChecker", "running")
            t0 = time.perf_counter()
            bc_msgs = build_bugcheck_messages(user_message, current_reply)
            bug_model = _model_for("bugchecker", model_map)
            bc_raw, bc_data, bc_retries = _call_with_json_retry(
                client,
                bug_model,
                bc_msgs,
                parse_fn=parse_bugcheck_json,
                valid_fn=is_valid_bugcheck_json,
                max_tokens=400,
                temperature=0.2,
                retries=2,
            )
            bc_result = bc_data if bc_data is not None else parse_bugcheck(bc_raw)
            elapsed = int((time.perf_counter() - t0) * 1000)

            bc_content = f"Verdict: {bc_result['verdict']} (Iter {i+1})\nJSON retries: {bc_retries}"
            if bc_result["bugs"]:
                bc_content += "\nBugs: " + "; ".join(bc_result["bugs"])
            if bc_result["missing"]:
                bc_content += "\nMissing: " + "; ".join(bc_result["missing"])
            if bc_result["fix_hints"]:
                bc_content += "\nFixes: " + "; ".join(bc_result["fix_hints"])

            notify_update("BugChecker", "completed", content=bc_content, elapsed_ms=elapsed, input_messages=bc_msgs)
            result.traces.append(AgentTrace(
                agent="BugChecker",
                content=bc_content,
                input_messages=bc_msgs,
                elapsed_ms=elapsed,
            ))
            
            # If PASS, we are content
            if bc_result["verdict"] == "PASS":
                final_reply = current_reply
                break

            # If FAIL, try to fix
            if bc_result["verdict"] == "FAIL" and (bc_result["bugs"] or bc_result["missing"]):
                logger.info("BugChecker FAILED (Iter %d) — re-synthesizing", i + 1)

                notify_update("SynthesizerFix", "running")
                t0 = time.perf_counter()
                fix_msgs = build_fix_messages(user_message, current_reply, bc_result)
                fix_model = _model_for("synthesizer_fix", model_map)
                fixed_reply = _llm_call(client, fix_model, fix_msgs, max_tokens=2048)
                elapsed = int((time.perf_counter() - t0) * 1000)
                
                notify_update("SynthesizerFix", "completed", content=fixed_reply, elapsed_ms=elapsed, input_messages=fix_msgs)
                result.traces.append(AgentTrace(
                    agent="SynthesizerFix",
                    content=fixed_reply,
                    input_messages=fix_msgs,
                    elapsed_ms=elapsed,
                ))
                current_reply = fixed_reply
                final_reply = fixed_reply
            else:
                # E.g. verdict was unclear/invalid, or FAIL but no clear bugs provided
                # In this case break out to avoid infinite loops on bad parses
                final_reply = current_reply
                break

        # ── Step 7 : Historian (final cross-check) ─────────────────
        notify_update("Historian", "running")
        t0 = time.perf_counter()
        hist_msgs = build_historian_messages(
            context_slice, architect_plan, skeptic_critique
        )
        hist_model = _model_for("historian", model_map)
        historian_warnings = _llm_call(client, hist_model, hist_msgs)
        elapsed = int((time.perf_counter() - t0) * 1000)
        notify_update("Historian", "completed", content=historian_warnings, elapsed_ms=elapsed, input_messages=_mask_code_context(hist_msgs))
        result.traces.append(AgentTrace(
            agent="Historian",
            content=historian_warnings,
            input_messages=_mask_code_context(hist_msgs),
            elapsed_ms=elapsed,
        ))

        historian_text_lower = historian_warnings.lower()
        matched_failure = "no known failure patterns detected" not in historian_text_lower
        memory.log_historian_note(
            summary=historian_warnings,
            tags=result.tags,
            matched_failure=matched_failure,
        )

        result.final_reply = final_reply
        _session["last_final_reply"] = final_reply

    except Exception as exc:
        logger.exception("Pipeline error")
        result.error = str(exc)
        result.final_reply = f"⚠️ Pipeline error: {exc}"

    return result


# ── Sub-flows ────────────────────────────────────────────────────────────────

def _handle_success(
    client,
    model_map: dict[str, str],
    user_message: str,
    result: PipelineResult,
) -> PipelineResult:
    """
    User confirmed success → ONE inference that both updates the
    manifesto and records the thought process, then we save
    programmatically.
    """
    gen_qs = _session.get("last_generated_questions", [])
    arch_plan = _session.get("last_architect_plan", "")
    last_reply = _session.get("last_final_reply", "")[:600]

    conversation_summary = (
        f"User said: {user_message}\n"
        f"Previous task: {_session.get('last_summary', '(unknown)')}\n"
        f"Previous reply excerpt: {last_reply}"
    )

    # ── Single combined Scribe + ThoughtRecorder call ────────────────
    combined_system = (
        compose_system_prompt(
            "You are the project Scribe AND Thought Recorder in one.\n"
            "You MUST return a JSON object with two keys:\n"
            '  "scribe_entry": a 1-3 sentence manifesto update,\n'
            '  "thought_record": an object with keys:\n'
            '      "problem_type", "key_questions" (list of strings),\n'
            '      "approach_summary", "pitfalls_avoided", "reuse_hint"\n'
            "Return ONLY valid JSON, no markdown fences."
        )
    )
    combined_user = (
        f"CONVERSATION:\n{conversation_summary}\n\n"
        f"GENERATED QUESTIONS:\n{json.dumps(gen_qs)}\n\n"
        f"ARCHITECT PLAN:\n{arch_plan[:400]}\n\n"
        "Write the combined JSON now."
    )
    combined_msgs = [
        {"role": "system", "content": combined_system},
        {"role": "user", "content": combined_user},
    ]

    t0 = time.perf_counter()
    scribe_model = _model_for("scribe_recorder", model_map)
    raw = _llm_call(client, scribe_model, combined_msgs, max_tokens=500, temperature=0.3)
    elapsed = int((time.perf_counter() - t0) * 1000)

    # Parse the combined response
    scribe_text = ""
    thought_record = {}
    try:
        parsed = json.loads(raw)
        scribe_text = parsed.get("scribe_entry", raw[:200])
        thought_record = parsed.get("thought_record", {})
    except json.JSONDecodeError:
        scribe_text = raw[:200]
        thought_record = {
            "problem_type": "unknown",
            "key_questions": gen_qs[:3],
            "approach_summary": arch_plan[:150],
            "pitfalls_avoided": "",
            "reuse_hint": "recorded from raw output",
        }

    result.traces.append(AgentTrace(
        agent="ScribeRecorder",
        content=(
            f"Manifesto update: {scribe_text}\n"
            f"Problem type: {thought_record.get('problem_type', '?')}\n"
            f"Key Qs: {json.dumps(thought_record.get('key_questions', []))}\n"
            f"Reuse hint: {thought_record.get('reuse_hint', '?')}"
        ),
        input_messages=combined_msgs,
        elapsed_ms=elapsed,
    ))

    # ── Programmatic saves (no extra LLM calls) ─────────────────────
    on_success(scribe_text, _session.get("last_heuristic_ids", []))

    if gen_qs:
        memory.save_thought(
            tags=_session.get("last_tags", []),
            thought_record=thought_record,
            generated_questions=gen_qs,
            succeeded=True,
        )
        # Promote top questions to permanent heuristics
        key_qs = thought_record.get("key_questions", [])
        promoted = []
        for q in key_qs[:2]:
            new_id = memory.add_generated_heuristic(
                q, _session.get("last_tags", [])
            )
            promoted.append(f"{new_id}: {q}")
        if promoted:
            logger.info("Promoted questions to heuristics: %s", promoted)

    result.final_reply = (
        "✅ **Success logged!** Manifesto updated and thought process "
        "recorded in a single pass.\n\n"
        f"*Scribe entry:* {scribe_text}"
    )
    return result


def _handle_failure(user_message: str) -> None:
    """
    User reported failure →
      1. Log failure
      2. Penalise heuristics
      3. Save thought process as FAILED so it can be avoided
    """
    on_failure(
        summary=_session.get("last_summary", user_message[:120]),
        snippet=_session.get("last_final_reply", "")[:500],
        tags=_session.get("last_tags", []),
        heuristic_ids=_session.get("last_heuristic_ids", []),
    )

    # Record failed thought process so Introspector avoids it next time
    gen_qs = _session.get("last_generated_questions", [])
    if gen_qs:
        memory.save_thought(
            tags=_session.get("last_tags", []),
            thought_record={
                "problem_type": "failed-attempt",
                "key_questions": gen_qs,
                "approach_summary": _session.get("last_architect_plan", "")[:200],
                "pitfalls_avoided": f"FAILED: {user_message[:150]}",
                "reuse_hint": "AVOID this approach",
            },
            generated_questions=gen_qs,
            succeeded=False,
        )


def _handle_clarification(
    client,
    model_map: dict[str, str],
    user_message: str,
    result: PipelineResult,
) -> PipelineResult:
    """User is providing clarification — give a lightweight response."""
    messages = [
        {"role": "system", "content": compose_system_prompt("Acknowledge clarifications and confirm the updated plan.")},
        {"role": "user", "content": (
            "The user is providing additional clarification:\n\n"
            f"{user_message}\n\n"
            "Acknowledge what they've clarified and ask if they'd like "
            "you to proceed with the updated understanding."
        )},
    ]
    t0 = time.perf_counter()
    clarifier_model = _model_for("clarifier", model_map)
    reply = _llm_call(client, clarifier_model, messages, max_tokens=512)
    elapsed = int((time.perf_counter() - t0) * 1000)

    result.traces.append(AgentTrace(
        agent="Clarifier",
        content=reply,
        input_messages=messages,
        elapsed_ms=elapsed,
    ))
    result.final_reply = reply
    return result
