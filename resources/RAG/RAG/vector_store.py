import shutil
from pathlib import Path

from langchain_chroma import Chroma

from ingest import load_documents
from chunker import split_documents
from embeddings import create_embedding_model


# --------------------------------------------------
# Configuration
# --------------------------------------------------

BASE_DIR = Path(__file__).resolve().parent

CHROMA_PATH = BASE_DIR / "data" / "chroma_db"

COLLECTION_NAME = "vyra_knowledge"


# --------------------------------------------------
# Create Vector Store
# --------------------------------------------------

def create_vector_store():

    print("Loading documents...")

    documents = load_documents()

    print(f"Loaded {len(documents)} knowledge files.")

    for document in documents:
        source = document.metadata.get("source", "unknown")

        print(f"  - {Path(source).name}")


    # --------------------------------------------------
    # Split documents
    # --------------------------------------------------

    print("\nSplitting documents...")

    chunks = split_documents(documents)

    print(f"Created {len(chunks)} chunks.")
    print(f"Total chunks: {len(chunks)}")


    # --------------------------------------------------
    # Remove old Chroma database
    # --------------------------------------------------

    if CHROMA_PATH.exists():

        print("\nRemoving old Chroma database...")

        shutil.rmtree(CHROMA_PATH)


    # --------------------------------------------------
    # Load local embedding model
    # --------------------------------------------------

    print("\nLoading local embedding model...")

    embeddings = create_embedding_model()


    # --------------------------------------------------
    # Verify embedding dimension
    # --------------------------------------------------

    test_vector = embeddings.embed_query("test")

    print(
        f"Embedding dimension: {len(test_vector)}"
    )


    if len(test_vector) != 384:

        raise ValueError(
            f"Expected 384-dimensional embeddings, "
            f"but got {len(test_vector)}."
        )


    # --------------------------------------------------
    # Create Chroma vector store
    # --------------------------------------------------

    print("\nCreating Chroma vector store...")

    vector_store = Chroma.from_documents(
        documents=chunks,
        embedding=embeddings,
        persist_directory=str(CHROMA_PATH),
        collection_name=COLLECTION_NAME
    )


    print("\nVYRA RAG vector database is ready.")

    return vector_store


# --------------------------------------------------
# Main
# --------------------------------------------------

if __name__ == "__main__":

    create_vector_store()