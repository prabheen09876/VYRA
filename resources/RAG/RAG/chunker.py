from langchain_text_splitters import (
    MarkdownHeaderTextSplitter,
    RecursiveCharacterTextSplitter
)


def split_documents(documents):

    all_chunks = []

    markdown_splitter = MarkdownHeaderTextSplitter(
        headers_to_split_on=[
            ("#", "title"),
            ("##", "section"),
            ("###", "subsection"),
        ],
        strip_headers=False
    )

    recursive_splitter = RecursiveCharacterTextSplitter(
        chunk_size=1000,
        chunk_overlap=150,
        separators=[
            "\n\n",
            "\n",
            ". ",
            " ",
            ""
        ]
    )

    for document in documents:

        markdown_chunks = markdown_splitter.split_text(
            document.page_content
        )

        for chunk in markdown_chunks:

            # Preserve original document metadata
            chunk.metadata.update(
                document.metadata
            )

            # Split large sections further
            final_chunks = recursive_splitter.split_documents(
                [chunk]
            )

            for final_chunk in final_chunks:

                # Preserve the original source
                final_chunk.metadata["source"] = (
                    document.metadata["source"]
                )

                all_chunks.append(final_chunk)

    print(
        f"Created {len(all_chunks)} chunks."
    )

    return all_chunks


if __name__ == "__main__":

    from ingest import load_documents

    documents = load_documents()

    chunks = split_documents(documents)

    for i, chunk in enumerate(
        chunks,
        start=1
    ):

        print(f"\n--- Chunk {i} ---")

        print(chunk.page_content)

        print("\nMetadata:")

        print(chunk.metadata)