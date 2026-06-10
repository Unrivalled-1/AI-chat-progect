import re
def _llm_decide_search_query(client, model: str, history: list[dict], user_msg: str) -> str:
    """Ask the LLM to decide if a web search is needed."""
    try:
        from app import _history_to_text
        history_text = _history_to_text(history[-5:] if history else [])
        prompt = (
            "You are a search planner. Your job is to determine if the user's latest message requires searching the web for current, factual, or external information.\n\n"
            f"Conversation so far:\n{history_text}\n\n"
            f"Latest user message:\n{user_msg}\n\n"
            "If a search is needed, output exactly <search>YOUR QUERY</search> where YOUR QUERY is a concise search engine query.\n"
            "If no search is needed, output <no_search>."
        )
        resp = client.chat.completions.create(
            model=model,
            messages=[{"role": "user", "content": prompt}],
            temperature=0.1,
            max_tokens=60
        )
        reply = str(resp.choices[0].message.content).strip()
        m = re.search(r"<search>(.*?)</search>", reply, re.IGNORECASE)
        if m:
            return m.group(1).strip()
    except Exception as e:
        import logging
        logging.getLogger(__name__).warning("Agentic Search Planner error: %s", e)
    return ""
