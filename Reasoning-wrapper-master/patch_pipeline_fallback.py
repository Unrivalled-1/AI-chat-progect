with open("reasoning/pipeline.py", "r") as f:
    text = f.read()

old_code = """        returned_model = getattr(response, "model", model)
        if returned_model and returned_model != model:
            req_base = model.split("/")[-1].lower()
            ret_base = returned_model.split("/")[-1].lower()
            req_clean = req_base.replace("-", "").replace(".", "").replace("_", "")
            ret_clean = ret_base.replace("-", "").replace(".", "").replace("_", "")
            if req_clean not in ret_clean and ret_clean not in req_clean:
                raise RuntimeError(
                    f"HuggingFace model fallback detected: You requested '{model}' but it is likely unhosted/unavailable on the serverless tier. "
                    f"The server silently routed the request to '{returned_model}'. "
                    f"Please select a different model."
                )"""

if old_code in text:
    text = text.replace(old_code, "")
    with open("reasoning/pipeline.py", "w") as f:
        f.write(text)
    print("Fallback removed.")
else:
    print("Could not find the exact code block.")
