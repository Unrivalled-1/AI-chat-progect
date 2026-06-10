"""
Simple AI Chat using the Hugging Face Inference API.
This will later be extended into a reasoning wrapper.
"""

import os
from huggingface_hub import InferenceClient

# ── Configuration ────────────────────────────────────────────────────────────
HF_TOKEN = os.environ.get("HF_API_TOKEN")
MODEL = "meta-llama/Llama-3.2-3B-Instruct:cheapest"  # Free-tier friendly chat model

if not HF_TOKEN:
    raise RuntimeError("Missing HF_API_TOKEN in environment.")

client = InferenceClient(token=HF_TOKEN)

# ── Conversation state ───────────────────────────────────────────────────────
system_prompt = (
    "You are a helpful, friendly AI assistant. "
    "Answer the user's questions clearly and concisely."
)
messages: list[dict] = [{"role": "system", "content": system_prompt}]


def chat(user_input: str) -> str:
    """Send a message and return the assistant's reply."""
    messages.append({"role": "user", "content": user_input})

    response = client.chat_completion(
        model=MODEL,
        messages=messages,
        max_tokens=1024,
        temperature=0.7,
    )

    reply = response.choices[0].message.content
    messages.append({"role": "assistant", "content": reply})
    return reply


# ── Main loop ────────────────────────────────────────────────────────────────
def main():
    print("╔══════════════════════════════════════╗")
    print("║        AI Chat  (type 'quit')        ║")
    print("╚══════════════════════════════════════╝")
    print(f"Model: {MODEL}\n")

    while True:
        try:
            user_input = input("You: ").strip()
        except (EOFError, KeyboardInterrupt):
            print("\nGoodbye!")
            break

        if not user_input:
            continue
        if user_input.lower() in ("quit", "exit", "q"):
            print("Goodbye!")
            break

        try:
            reply = chat(user_input)
            print(f"\nAI: {reply}\n")
        except Exception as e:
            print(f"\n[Error] {e}\n")


if __name__ == "__main__":
    main()
