import re

def _extract_and_execute_schedules(text: str) -> str:
    if not text or not isinstance(text, str):
        return text
    
    pattern = re.compile(r'<schedule\b([^>]*)>(.*?)</schedule>|<schedule\b([^>]*)/\s*>', re.IGNORECASE | re.DOTALL)
    
    def replacer(match):
        attrs = match.group(1) or match.group(3) or ""
        run_at_m = re.search(r'run_at=[\'"](.*?)[\'"]', attrs, re.IGNORECASE)
        msg_m = re.search(r'message=[\'"](.*?)[\'"]', attrs, re.IGNORECASE)
        
        run_at_str = run_at_m.group(1) if run_at_m else ""
        msg_str = msg_m.group(1) if msg_m else ""
        if not run_at_str or not msg_str:
            return match.group(0) # Not a valid schedule tag
            
        # Mock successful scheduling
        return f"\n*Successfully Scheduled: '{msg_str}' for {run_at_str}*\n"
        
    return pattern.sub(replacer, text)

print(_extract_and_execute_schedules('Sure! <schedule run_at="2024" message="hi"/> and <schedule run_at="2025" message="hello"></schedule> Done!'))
