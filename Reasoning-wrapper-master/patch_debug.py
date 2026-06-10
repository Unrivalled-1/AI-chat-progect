import re
with open('app.py', 'r') as f:
    text = f.read()

target = """        t0 = perf_counter()
        output = _model_generate_text(
            client,
            resolved_model,"""

new_target = """        t0 = perf_counter()
        with open('app_debug.log', 'a') as df:
            df.write(f"=== PAYLOAD FOR {name} ===\\n{user_payload}\\n\\n")
        output = _model_generate_text(
            client,
            resolved_model,"""

text = text.replace(target, new_target)
with open('app.py', 'w') as f:
    f.write(text)
