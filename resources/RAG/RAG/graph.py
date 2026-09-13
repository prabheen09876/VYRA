from pathlib import Path
from typing import TypedDict

from langchain_chroma import Chroma
from langgraph.graph import StateGraph, START, END

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
# LangGraph State
# --------------------------------------------------

class VYRAState(TypedDict):
    question: str
    context: str
    answer: str


# --------------------------------------------------
# Node 1: Retrieve Knowledge
# --------------------------------------------------

def retrieve_node(state: VYRAState):

    print("\n[1] Searching VYRA knowledge base...")

    question = state["question"]

    documents = retriever.invoke(question)

    if not documents:
        return {
            "context": ""
        }

    print(f"\nRetrieved {len(documents)} chunks:")

    context_parts = []

    for i, document in enumerate(documents, start=1):

        print(f"\n--- Result {i} ---")
        print(document.page_content)

        context_parts.append(
            document.page_content
        )

    context = "\n\n".join(context_parts)

    return {
        "context": context
    }


# --------------------------------------------------
# Node 2: Generate Answer
# --------------------------------------------------

def generate_node(state: VYRAState):

    print("\n[2] Generating VYRA answer...")

    if not state["context"]:

        return {
            "answer": (
                "I don't have enough information in my "
                "knowledge base to answer that."
            )
        }

    answer = generate_answer(
        question=state["question"],
        context=state["context"]
    )

    return {
        "answer": answer
    }


# --------------------------------------------------
# Build LangGraph
# --------------------------------------------------

graph_builder = StateGraph(VYRAState)


# Add nodes

graph_builder.add_node(
    "retrieve",
    retrieve_node
)

graph_builder.add_node(
    "generate",
    generate_node
)


# Define flow

graph_builder.add_edge(
    START,
    "retrieve"
)

graph_builder.add_edge(
    "retrieve",
    "generate"
)

graph_builder.add_edge(
    "generate",
    END
)


# Compile graph

graph = graph_builder.compile()


# --------------------------------------------------
# Test
# --------------------------------------------------

if __name__ == "__main__":

    question = "What muscles do push-ups target?"

    print("\n" + "=" * 50)
    print("VYRA LANGGRAPH")
    print("=" * 50)

    print(f"\nQuestion: {question}")

    result = graph.invoke(
        {
            "question": question,
            "context": "",
            "answer": ""
        }
    )

    print("\n" + "=" * 50)
    print("VYRA:")
    print("=" * 50)

    print(result["answer"])