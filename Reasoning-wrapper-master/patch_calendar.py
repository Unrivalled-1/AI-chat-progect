import re

def patch_constitution():
    with open('reasoning/constitution.py', 'r') as f:
        content = f.read()
    
    # 1. Update time_context
    old_time = "f\"Unix timestamp: {int(now.timestamp())}\\n\""
    new_time = "f\"Unix timestamp: {int(now.timestamp())}\\n\"\n        f\"ISO 8601 UTC time: {now.strftime('%Y-%m-%dT%H:%M:%SZ')}\\n\"\n    "
    content = content.replace(old_time, new_time)
    
    # 2. Update RUNTIME_CONTEXT
    old_context = "- For games / apps / demos: one complete self-contained HTML file in a ```html fence.\"\"\".strip()"
    new_context = "- For games / apps / demos: one complete self-contained HTML file in a ```html fence.\n- To SCHEDULE an event or reminder for the user natively, DO NOT output a UI calendar. Instead, use exactly this XML format: <schedule run_at=\"YYYY-MM-DDTHH:MM:00Z\" message=\"<task description>\"></schedule>. The UI will automatically intercept it.\"\"\".strip()"
    content = content.replace(old_context, new_context)
    
    with open('reasoning/constitution.py', 'w') as f:
        f.write(content)

def patch_app():
    with open('app.py', 'r') as f:
        content = f.read()
        
    func_text = """
def _extract_and_execute_schedules(text: str) -> str:
    import re
    if not text or not isinstance(text, str):
        return text

    def _schedule_replacer(match):
        attrs = match.group(1)
        run_at_m = re.search(r'run_at=[\'"](.*?)[\'"]', attrs, re.IGNORECASE)
        msg_m = re.search(r'message=[\'"](.*?)[\'"]', attrs, re.IGNORECASE)
        
        if not run_at_m or not msg_m:
            return match.group(0)
            
        run_at_str = run_at_m.group(1).strip()
        msg_str = msg_m.group(1).strip()
        
        run_at = _parse_iso_utc(run_at_str)
        if not run_at:
            return f"\n> **Note:** AI tried to schedule an event but formatted the time incorrectly: `{run_at_str}`\n"
            
        action_id = _new_schedule_id()
        with _SCHED_LOCK:
            action = {
                "id": action_id,
                "created_at": _to_iso_utc(datetime.now(timezone.utc)),
                "run_at": _to_iso_utc(run_at),
                "event_title": "Scheduled by AI",
                "message": msg_str,
                "instructions": msg_str,
                "agent_name": "AI Assistant",
                "mode": "reasoning",
                "model": DEFAULT_MODEL,
                "target_agent": "",
                "status": "scheduled",
                "enabled": True,
                "repeat": "none",
                "sources": [],
                "note": "Scheduled directly by agent response."
            }
            _SCHEDULED_ACTIONS[action_id] = action
            
        pretty_time = run_at.strftime('%A, %b %d, %Y at %H:%M UTC')
        return f"\n> 📅 **Event Scheduled:** '{msg_str}' for {pretty_time}\n"

    text = re.sub(r'<schedule\b([^>]*?)/\s*>', _schedule_replacer, text, flags=re.IGNORECASE)
    text = re.sub(r'<schedule\b([^>]*)>(.*?)</schedule>', _schedule_replacer, text, flags=re.IGNORECASE | re.DOTALL)
    return text
"""
    if "def _extract_and_execute_schedules" not in content:
        # Insert after _execute_scheduled_action
        parts = content.split("def _scheduler_loop() -> None:")
        if len(parts) == 2:
            content = parts[0] + func_text + "\ndef _scheduler_loop() -> None:" + parts[1]
    
    # Intercept everywhere a reply is about to be returned/emitted
    # 1. API api_chat
    replacements = [
        (
            'run_state["result"].update({\n                "reply": reply,',
            'reply = _extract_and_execute_schedules(reply)\n            run_state["result"].update({\n                "reply": reply,'
        ),
        (
            'run_state["result"].update({\n                "reply": reply,',  # Again for conversational/custom
            'reply = _extract_and_execute_schedules(reply)\n            run_state["result"].update({\n                "reply": reply,'
        ),
        (
            'return jsonify({\n        "reply": result.final_reply,',
            'result.final_reply = _extract_and_execute_schedules(result.final_reply)\n    return jsonify({\n        "reply": result.final_reply,'
        ),
        (
            'emit("chat_response", {"reply": reply, "model": resolved_model, "mode": "direct", "traces": []})',
            'reply = _extract_and_execute_schedules(reply)\n            emit("chat_response", {"reply": reply, "model": resolved_model, "mode": "direct", "traces": []})'
        ),
        (
            'emit("chat_response", {\n                "reply": reply,',
            'reply = _extract_and_execute_schedules(reply)\n            emit("chat_response", {\n                "reply": reply,'
        ),
        (
            'emit("chat_response", {\n            "reply": result.final_reply,',
            'result.final_reply = _extract_and_execute_schedules(result.final_reply)\n        emit("chat_response", {\n            "reply": result.final_reply,'
        )
    ]
    
    for old_t, new_t in replacements:
        content = content.replace(old_t, new_t)
        
    with open('app.py', 'w') as f:
        f.write(content)

patch_constitution()
patch_app()
