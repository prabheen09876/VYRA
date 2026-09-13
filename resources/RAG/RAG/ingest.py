from pathlib import Path

from langchain_core.documents import Document


BASE_DIR = Path(__file__).resolve().parent

KNOWLEDGE_DIR = BASE_DIR / "data" / "documents"


def load_documents():

    documents = []

    markdown_files = sorted(
        KNOWLEDGE_DIR.glob("*.md")
    )

    if not markdown_files:
        raise FileNotFoundError(
            f"No Markdown files found in {KNOWLEDGE_DIR}"
        )

    for file_path in markdown_files:

        content = file_path.read_text(
            encoding="utf-8"
        )

        document = Document(
            page_content=content,
            metadata={
                "source": file_path.name,
                "file_path": str(file_path),
            }
        )

        documents.append(document)

    print(f"Loaded {len(documents)} knowledge files.")

    for document in documents:
        print(
            f"  - {document.metadata['source']}"
        )

    return documents


if __name__ == "__main__":

    documents = load_documents()

    print(
        f"\nTotal documents: {len(documents)}"
    )