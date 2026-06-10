import re

def _parse_iso_utc(d):
    return d

def _schedule_replacer(match):
    attrs = match.group(1)
    run_at_m = re.search(r'run_at=[\'"](.*?)[\'"]', attrs, re.IGNORECASE)
    msg_m = re.search(r'message=[\'"](.*?)[\'"]', attrs, re.IGNORECASE)
    
    if not run_at_m or not msg_m:
        return match.group(0)
        
    run_at_str = run_at_m.group(1)
    msg_str = msg_m.group(1)
    
    return f"\n*Successfully Scheduled: '{msg_str}' for {run_at_str}*\n"

def _extract_and_execute_schedules(text: str) -> str:
    if not text or not isinstance(text, str):
        return text
        
    text = re.sub(
        r'<schedule\b([^>]*?)/\s*>',
        _schedule_replacer,
        text,
        flags=re.IGNORECASE
    )
    text = re.sub(
        r'<schedule\b([^>]*)>(.*?)</schedule>',
        _schedule_replacer,
        text,
        flags=re.IGNORECASE | re.DOTALL
    )
    return text

print(_extract_and_execute_schedules('Sure! <schedule run_at="2024" message="hi"/> and <schedule message="hello" run_at="2025"></schedule> Done!'))
