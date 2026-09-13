import os

from dotenv import load_dotenv
from langchain_mistralai import ChatMistralAI
from langchain_core.prompts import ChatPromptTemplate

from retriever import create_retriever


load_dotenv()

MISTRAL_API_KEY = os.getenv("MISTRAL_API_KEY")

if not MISTRAL_API_KEY:
    raise ValueError(
        "MISTRAL_API_KEY is not set. "
        "Check your .env file."
    )


def create_llm():

    llm = ChatMistralAI(
        model="sentence-transformers/all-MiniLM-L6-v2",
        api_key=MISTRAL_API_KEY,
        temperature=0
    )

    return llm


def create_prompt():

    prompt = ChatPromptTemplate.from_messages(
        [
            (
                "system",
                """
You are VYRA, an AI fitness assistant.

Answer the user's question using ONLY the provided
context from the VYRA knowledge base.

If the answer cannot be found in the context,
say that you do not have enough information.

Do not invent or assume information.

Keep the answer clear, concise, and helpful.

Context:
{context}
"""
            ),
            (
                "human",
                "{question}"
            )
        ]
    )

    return prompt


def format_documents(documents):

    return "\n\n".join(
        document.page_content
        for document in documents
    )


def ask_vyra(question):

    retriever = create_retriever()

    llm = create_llm()

    prompt = create_prompt()

    documents = retriever.invoke(question)

    context = format_documents(documents)

    messages = prompt.format_messages(
        context=context,
        question=question
    )

    response = llm.invoke(messages)

    return response.content


if __name__ == "__main__":

    question = "What muscles do push-ups target?"

    print(f"\nUser: {question}\n")

    answer = ask_vyra(question)

    print("VYRA:")
    print(answer)