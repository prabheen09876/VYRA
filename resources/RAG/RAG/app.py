import streamlit as st

from retriever import retrieve_documents
from llm import generate_answer


# ============================================================
# Page Configuration
# ============================================================

st.set_page_config(
    page_title="VYRA RAG",
    page_icon="🧠",
    layout="wide"
)


# ============================================================
# Styling
# ============================================================

st.markdown(
    """
    <style>
        .main-title {
            font-size: 42px;
            font-weight: 700;
            margin-bottom: 0px;
        }

        .subtitle {
            color: #888888;
            font-size: 17px;
            margin-bottom: 30px;
        }

        .answer-box {
            padding: 20px;
            border-radius: 12px;
            border: 1px solid #444;
            margin-top: 10px;
        }

        .retrieval-box {
            padding: 15px;
            border-radius: 10px;
            border: 1px solid #444;
            margin-bottom: 12px;
        }
    </style>
    """,
    unsafe_allow_html=True
)


# ============================================================
# Header
# ============================================================

st.markdown(
    '<div class="main-title">VYRA</div>',
    unsafe_allow_html=True
)

st.markdown(
    '<div class="subtitle">Retrieval-Augmented Generation Assistant</div>',
    unsafe_allow_html=True
)


# ============================================================
# Sidebar
# ============================================================

with st.sidebar:

    st.header("VYRA Controls")

    show_retrieval = st.checkbox(
        "Show retrieved documents",
        value=True
    )

    show_scores = st.checkbox(
        "Show retrieval scores",
        value=True
    )

    st.divider()

    st.markdown("### Pipeline")

    st.write("1. User Question")
    st.write("2. Chroma Retrieval")
    st.write("3. Context Selection")
    st.write("4. LLM Generation")
    st.write("5. VYRA Answer")

    st.divider()

    st.caption("VYRA RAG Prototype")


# ============================================================
# Chat History
# ============================================================

if "messages" not in st.session_state:
    st.session_state.messages = []


# Display previous messages

for message in st.session_state.messages:

    with st.chat_message(message["role"]):

        st.markdown(message["content"])


# ============================================================
# User Input
# ============================================================

question = st.chat_input(
    "Ask VYRA something..."
)


# ============================================================
# Process Question
# ============================================================

if question:

    # --------------------------------------------------------
    # Display user question
    # --------------------------------------------------------

    st.session_state.messages.append(
        {
            "role": "user",
            "content": question
        }
    )

    with st.chat_message("user"):
        st.markdown(question)


    # --------------------------------------------------------
    # Assistant response
    # --------------------------------------------------------

    with st.chat_message("assistant"):

        with st.spinner("Searching VYRA knowledge base..."):

            try:

                # ====================================================
                # STEP 1 — RETRIEVAL
                # ====================================================

                results = retrieve_documents(question)


                # ====================================================
                # STEP 2 — EXTRACT CONTEXT
                # ====================================================

                if not results:

                    st.warning(
                        "No relevant documents were retrieved."
                    )

                    answer = (
                        "I couldn't find relevant information "
                        "in the VYRA knowledge base."
                    )

                    st.markdown(answer)

                    st.session_state.messages.append(
                        {
                            "role": "assistant",
                            "content": answer
                        }
                    )

                    st.stop()


                # ====================================================
                # Handle Different Retriever Return Formats
                # ====================================================

                documents = []
                scores = []

                for item in results:

                    # Case 1:
                    # (document, score)

                    if isinstance(item, tuple) and len(item) >= 2:

                        documents.append(item[0])
                        scores.append(item[1])

                    else:

                        documents.append(item)


                # ====================================================
                # Convert Documents to Text
                # ====================================================

                context_parts = []

                for doc in documents:

                    if hasattr(doc, "page_content"):

                        context_parts.append(
                            doc.page_content
                        )

                    elif isinstance(doc, str):

                        context_parts.append(doc)

                    else:

                        context_parts.append(
                            str(doc)
                        )


                context = "\n\n".join(
                    context_parts
                )


                # ====================================================
                # STEP 3 — SHOW RETRIEVAL
                # ====================================================

                if show_retrieval:

                    with st.expander(
                        f"Retrieved Documents ({len(documents)})",
                        expanded=False
                    ):

                        for i, doc in enumerate(documents):

                            st.markdown(
                                f"### Result {i + 1}"
                            )

                            if hasattr(
                                doc,
                                "page_content"
                            ):

                                st.write(
                                    doc.page_content
                                )

                            else:

                                st.write(doc)


                            # ----------------------------------------
                            # Metadata
                            # ----------------------------------------

                            if hasattr(
                                doc,
                                "metadata"
                            ):

                                metadata = doc.metadata

                                if metadata:

                                    st.caption(
                                        f"Metadata: {metadata}"
                                    )


                            # ----------------------------------------
                            # Score
                            # ----------------------------------------

                            if (
                                show_scores
                                and i < len(scores)
                            ):

                                st.caption(
                                    f"Distance / Score: "
                                    f"{scores[i]}"
                                )

                            st.divider()


                # ====================================================
                # STEP 4 — GENERATE ANSWER
                # ====================================================

                with st.spinner(
                    "Generating VYRA answer..."
                ):

                    answer = generate_answer(
                        question,
                        context
                    )


                # ====================================================
                # STEP 5 — DISPLAY ANSWER
                # ====================================================

                st.markdown(
                    '<div class="answer-box">',
                    unsafe_allow_html=True
                )

                st.markdown(answer)

                st.markdown(
                    "</div>",
                    unsafe_allow_html=True
                )


                # ====================================================
                # SAVE CHAT HISTORY
                # ====================================================

                st.session_state.messages.append(
                    {
                        "role": "assistant",
                        "content": answer
                    }
                )


            except Exception as e:

                st.error(
                    "Something went wrong while processing "
                    "your question."
                )

                st.exception(e)