with open('reasoning/pipeline.py', 'r', encoding='utf-8') as f:
    text = f.read()

target = """            req_base = model.split("/")[-1].lower()
            ret_base = returned_model.split("/")[-1].lower()
            if req_base not in ret_base and ret_base not in req_base:"""

new_target = """            req_base = model.split("/")[-1].lower()
            ret_base = returned_model.split("/")[-1].lower()
            req_clean = req_base.replace("-", "").replace(".", "").replace("_", "")
            ret_clean = ret_base.replace("-", "").replace(".", "").replace("_", "")
            if req_clean not in ret_clean and ret_clean not in req_clean:"""

text = text.replace(target, new_target)
with open('reasoning/pipeline.py', 'w', encoding='utf-8') as f:
    f.write(text)

