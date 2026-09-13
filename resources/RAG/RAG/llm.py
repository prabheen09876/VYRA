import os

from dotenv import load_dotenv
from huggingface_hub import InferenceClient


# --------------------------------------------------
# Configuration
# --------------------------------------------------

# --------------------------------------------------
# Configuration
# --------------------------------------------------

load_dotenv()

HF_TOKEN = os.getenv("HF_TOKEN")

if not HF_TOKEN:
    raise ValueError(
        "HF_TOKEN is not set. "
        "Add your Hugging Face token to the .env file."
    )

MODEL_NAME = "openai/gpt-oss-20b"
PROVIDER = "groq"


# --------------------------------------------------
# Hugging Face Inference API
# --------------------------------------------------

print("Connecting to Hugging Face Inference API...")

client = InferenceClient(
    provider=PROVIDER,
    api_key=HF_TOKEN
)

print("Hugging Face API connected successfully.")


# --------------------------------------------------
# Generate VYRA Answer
# --------------------------------------------------

def generate_answer(question, context):

    prompt = f"""You are VYRA, a fitness and workout assistant.

Use ONLY the provided knowledge base context to answer the user's question.

Rules:
- Answer only from the provided context.
- Do not invent information.
- Do not use outside knowledge.
- Keep the answer clear and practical.
- If the context does not contain enough information, say:
"I don't have enough information in my knowledge base to answer that."

Knowledge Base Context:
{context}

User Question:
{question}

Answer:
"""

    response = client.chat_completion(
        model=MODEL_NAME,
        messages=[
            {
                "role": "system",
                "content": "You are VYRA, a helpful fitness assistant."
            },
            {
                "role": "user",
                "content": prompt
            }
        ],
        max_tokens=150,
        temperature=0.2
    )

    return response.choices[0].message.content.strip()


# --------------------------------------------------
# Test
# --------------------------------------------------

if __name__ == "__main__":

    question = "What muscles do push-ups target?"

    context = """
Push-ups mainly train the chest, shoulders, and triceps.

The core also works to maintain body position.
"""

    print("\nQuestion:")
    print(question)

    print("\nGenerating VYRA answer...\n")

    answer = generate_answer(question, context)

    print("VYRA:")
    print(answer)