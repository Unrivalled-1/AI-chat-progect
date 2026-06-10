from huggingface_hub import InferenceClient
try:
    client = InferenceClient(token="")
    client.chat_completion(model="meta-llama/Llama-3.1-8B-Instruct", messages=[{"role": "user", "content": "hi"}])
except Exception as e:
    print("ERROR:", repr(e))
