from pathlib import Path

from langchain_chroma import Chroma

from embeddings import create_embedding_model
from llm import generate_answer


# --------------------------------------------------
# Configuration
# --------------------------------------------------

BASE_DIR = Path(__file__).resolve().parent

CHROMA_PATH = BASE_DIR / "data" / "chroma_db"

COLLECTION_NAME = "vyra_knowledge"


# --------------------------------------------------
# Load Embedding Model
# --------------------------------------------------

print("Loading local embedding model...")

embeddings = create_embedding_model()

print("Embedding model loaded successfully.")


# --------------------------------------------------
# Connect to Chroma
# --------------------------------------------------

print("Connecting to Chroma vector database...")

vector_store = Chroma(
    collection_name=COLLECTION_NAME,
    embedding_function=embeddings,
    persist_directory=str(CHROMA_PATH)
)

retriever = vector_store.as_retriever(
    search_kwargs={"k": 2}
)

print("Retriever created successfully.")


# --------------------------------------------------
# Retrieval Function
# --------------------------------------------------

def retrieve_documents(question):
    """
    Retrieve relevant documents from the VYRA
    Chroma knowledge base.
    """

    documents = retriever.invoke(question)

    return documents


# --------------------------------------------------
# RAG Pipeline
# --------------------------------------------------

def ask_vyra(question):

    print("\nSearching VYRA knowledge base...")

    documents = retrieve_documents(question)

    if not documents:
        return (
            "I don't have enough information in my "
            "knowledge base to answer that."
        )

    print(f"\nRetrieved {len(documents)} chunks:")

    context_parts = []

    for i, document in enumerate(documents, start=1):

        print(f"\n--- Result {i} ---")

        print(document.page_content)

        context_parts.append(document.page_content)

    context = "\n\n".join(context_parts)

    print("\nGenerating VYRA answer...")

    answer = generate_answer(
        question=question,
        context=context
    )

    return answer


# --------------------------------------------------
# Test
# --------------------------------------------------

if __name__ == "__main__":

    question = "What muscles do push-ups target?"

    print("\n" + "=" * 50)
    print("VYRA RAG")
    print("=" * 50)

    print(f"\nQuestion: {question}")

    answer = ask_vyra(question)

    print("\n" + "=" * 50)
    print("VYRA:")
    print("=" * 50)

    print(answer)