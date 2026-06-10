import re

def _extract_and_execute_schedules(text: str) -> str:
    pattern = re.compile(r'<schedule\s+run_at=["\'](.*?)["\']\s+message=["\'](.*?)["\']\s*/?>', re.IGNORECASE | re.DOTALL)
    
    def replacer(match):
        run_at = match.group(1)
        message = match.group(2)
        print(f"Creating schedule: {run_at} - {message}")
        return f"\n*Scheduled Event: {message} for {run_at}*\n"
    
    return pattern.sub(replacer, text)

print(_extract_and_execute_schedules('Here is a schedule: <schedule run_at="2024-01-01T12:00:00Z" message="Remind me to eat" />'))
