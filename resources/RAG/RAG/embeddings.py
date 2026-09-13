from langchain_huggingface import HuggingFaceEmbeddings

def create_embedding_model():

    embeddings = HuggingFaceEmbeddings(
        model_name="sentence-transformers/all-MiniLM-L6-v2",
        model_kwargs={
            "device": "cpu"
        },
        encode_kwargs={
            "normalize_embeddings": True
        }
    )

    print("Local Hugging Face embedding model loaded successfully.")

    return embeddings