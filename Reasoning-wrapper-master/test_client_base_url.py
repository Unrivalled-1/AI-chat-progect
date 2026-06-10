from huggingface_hub import InferenceClient
client = InferenceClient(base_url="https://api.openai.com/v1", api_key="sk-12345")
print("calling chat_completion...")
try:
    client.chat_completion(model="moonshotai/Kimi-K2.5:cheapest", messages=[{"role": "user", "content": "hi"}])
except Exception as e:
    print(type(e).__name__, "-", e)
