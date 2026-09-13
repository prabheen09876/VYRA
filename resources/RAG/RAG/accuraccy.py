from retriever import retrieve_documents


# ============================================================
# CONFIGURATION
# ============================================================

K_VALUES = [1, 2, 3]


# ============================================================
# SEMANTIC / PARAPHRASED TEST DATASET
# ============================================================

TEST_CASES = [

    # ========================================================
    # PUSH-UPS
    # ========================================================

    {
        "id": "Q001",
        "question": "Which upper-body muscles are activated during push-ups?",
        "expected_keywords": ["chest", "shoulders", "triceps"],
    },
    {
        "id": "Q002",
        "question": "What muscle groups receive the most work from a push-up?",
        "expected_keywords": ["chest", "shoulders", "triceps"],
    },
    {
        "id": "Q003",
        "question": "Which muscles does this bodyweight pressing movement target?",
        "expected_keywords": ["chest", "shoulders", "triceps"],
    },
    {
        "id": "Q004",
        "question": "What areas of the upper body are trained when performing push-ups?",
        "expected_keywords": ["chest", "shoulders", "triceps"],
    },
    {
        "id": "Q005",
        "question": "Which muscles are primarily engaged by push-ups?",
        "expected_keywords": ["chest", "shoulders", "triceps"],
    },
    {
        "id": "Q006",
        "question": "What parts of the body get trained by a standard push-up?",
        "expected_keywords": ["chest", "shoulders", "triceps"],
    },
    {
        "id": "Q007",
        "question": "Does a push-up mainly work the chest and arms?",
        "expected_keywords": ["chest", "triceps"],
    },
    {
        "id": "Q008",
        "question": "Are the shoulders involved when doing push-ups?",
        "expected_keywords": ["shoulders"],
    },
    {
        "id": "Q009",
        "question": "Do push-ups activate the triceps?",
        "expected_keywords": ["triceps"],
    },
    {
        "id": "Q010",
        "question": "Is the chest one of the primary muscles used in push-ups?",
        "expected_keywords": ["chest"],
    },
    {
        "id": "Q011",
        "question": "How can someone become better at performing push-ups?",
        "expected_keywords": ["push-ups", "improve"],
    },
    {
        "id": "Q012",
        "question": "What can I do to increase my push-up ability?",
        "expected_keywords": ["push-ups", "improve"],
    },
    {
        "id": "Q013",
        "question": "What are some ways to improve push-up performance?",
        "expected_keywords": ["push-ups", "improve"],
    },
    {
        "id": "Q014",
        "question": "How can I increase the number of push-ups I can perform?",
        "expected_keywords": ["push-ups", "improve"],
    },
    {
        "id": "Q015",
        "question": "What technique should I use when performing a proper push-up?",
        "expected_keywords": ["push-up", "form"],
    },
    {
        "id": "Q016",
        "question": "How should a standard push-up be performed correctly?",
        "expected_keywords": ["push-up", "form"],
    },
    {
        "id": "Q017",
        "question": "What mistakes should I avoid while doing push-ups?",
        "expected_keywords": ["push-up", "mistakes"],
    },
    {
        "id": "Q018",
        "question": "Which common errors can reduce the quality of a push-up?",
        "expected_keywords": ["push-up", "mistakes"],
    },
    {
        "id": "Q019",
        "question": "How do I perform push-ups with better technique?",
        "expected_keywords": ["push-up", "form"],
    },
    {
        "id": "Q020",
        "question": "What should I watch out for when doing repeated push-ups?",
        "expected_keywords": ["push-up"],
    },


    # ========================================================
    # CHEST
    # ========================================================

    {
        "id": "Q021",
        "question": "Which exercises are effective for developing the chest?",
        "expected_keywords": ["chest"],
    },
    {
        "id": "Q022",
        "question": "What movements can I use to train my pectoral muscles?",
        "expected_keywords": ["chest"],
    },
    {
        "id": "Q023",
        "question": "How can I build my chest through exercise?",
        "expected_keywords": ["chest"],
    },
    {
        "id": "Q024",
        "question": "What workouts focus primarily on the chest?",
        "expected_keywords": ["chest"],
    },
    {
        "id": "Q025",
        "question": "Which training movements target the pecs?",
        "expected_keywords": ["chest"],
    },
    {
        "id": "Q026",
        "question": "What exercises are useful when training the chest muscles?",
        "expected_keywords": ["chest"],
    },
    {
        "id": "Q027",
        "question": "Which muscle group is emphasized during chest training?",
        "expected_keywords": ["chest"],
    },
    {
        "id": "Q028",
        "question": "What muscles are typically recruited during chest-focused exercises?",
        "expected_keywords": ["chest"],
    },
    {
        "id": "Q029",
        "question": "How should I approach training my chest?",
        "expected_keywords": ["chest"],
    },
    {
        "id": "Q030",
        "question": "What type of exercises should I perform for chest development?",
        "expected_keywords": ["chest"],
    },


    # ========================================================
    # SHOULDERS
    # ========================================================

    {
        "id": "Q031",
        "question": "Which exercises can strengthen the shoulder muscles?",
        "expected_keywords": ["shoulder"],
    },
    {
        "id": "Q032",
        "question": "What movements are useful for developing the shoulders?",
        "expected_keywords": ["shoulder"],
    },
    {
        "id": "Q033",
        "question": "How can I train my deltoids effectively?",
        "expected_keywords": ["shoulder"],
    },
    {
        "id": "Q034",
        "question": "What exercises should I use for shoulder development?",
        "expected_keywords": ["shoulder"],
    },
    {
        "id": "Q035",
        "question": "Which movements place emphasis on the shoulders?",
        "expected_keywords": ["shoulder"],
    },
    {
        "id": "Q036",
        "question": "What muscle group is being trained during shoulder workouts?",
        "expected_keywords": ["shoulder"],
    },
    {
        "id": "Q037",
        "question": "How can someone improve their shoulder strength?",
        "expected_keywords": ["shoulder"],
    },
    {
        "id": "Q038",
        "question": "What exercises target the muscles around the shoulders?",
        "expected_keywords": ["shoulder"],
    },
    {
        "id": "Q039",
        "question": "Which training movements are appropriate for the deltoids?",
        "expected_keywords": ["shoulder"],
    },
    {
        "id": "Q040",
        "question": "What should I include in a shoulder-focused workout?",
        "expected_keywords": ["shoulder"],
    },


    # ========================================================
    # TRICEPS / ARMS
    # ========================================================

    {
        "id": "Q041",
        "question": "What exercises can I perform to strengthen my triceps?",
        "expected_keywords": ["triceps"],
    },
    {
        "id": "Q042",
        "question": "Which movements specifically target the back of the upper arm?",
        "expected_keywords": ["triceps"],
    },
    {
        "id": "Q043",
        "question": "How can I train my triceps effectively?",
        "expected_keywords": ["triceps"],
    },
    {
        "id": "Q044",
        "question": "What exercises are useful for developing the triceps?",
        "expected_keywords": ["triceps"],
    },
    {
        "id": "Q045",
        "question": "Which muscle is targeted when performing triceps-focused movements?",
        "expected_keywords": ["triceps"],
    },
    {
        "id": "Q046",
        "question": "What workouts can help develop my arms?",
        "expected_keywords": ["arms"],
    },
    {
        "id": "Q047",
        "question": "How should I train the muscles in my arms?",
        "expected_keywords": ["arms"],
    },
    {
        "id": "Q048",
        "question": "Which exercises work the upper-arm muscles?",
        "expected_keywords": ["arms"],
    },
    {
        "id": "Q049",
        "question": "What movements are useful for arm development?",
        "expected_keywords": ["arms"],
    },
    {
        "id": "Q050",
        "question": "Which exercises put emphasis on the triceps?",
        "expected_keywords": ["triceps"],
    },


    # ========================================================
    # LEGS
    # ========================================================

    {
        "id": "Q051",
        "question": "What exercises can I use to develop my legs?",
        "expected_keywords": ["legs"],
    },
    {
        "id": "Q052",
        "question": "Which movements are useful for lower-body training?",
        "expected_keywords": ["legs"],
    },
    {
        "id": "Q053",
        "question": "How can I strengthen my lower body through exercise?",
        "expected_keywords": ["legs"],
    },
    {
        "id": "Q054",
        "question": "What workouts target the muscles of the legs?",
        "expected_keywords": ["legs"],
    },
    {
        "id": "Q055",
        "question": "Which exercises are good for lower-body development?",
        "expected_keywords": ["legs"],
    },
    {
        "id": "Q056",
        "question": "What movements should I include in a leg workout?",
        "expected_keywords": ["legs"],
    },
    {
        "id": "Q057",
        "question": "Which muscles are trained during lower-body exercises?",
        "expected_keywords": ["legs"],
    },
    {
        "id": "Q058",
        "question": "How should I approach training my legs?",
        "expected_keywords": ["legs"],
    },
    {
        "id": "Q059",
        "question": "What exercises place emphasis on the lower body?",
        "expected_keywords": ["legs"],
    },
    {
        "id": "Q060",
        "question": "Which training movements work multiple muscles in the legs?",
        "expected_keywords": ["legs"],
    },


    # ========================================================
    # CORE
    # ========================================================

    {
        "id": "Q061",
        "question": "Which exercises can strengthen the muscles of my core?",
        "expected_keywords": ["core"],
    },
    {
        "id": "Q062",
        "question": "What movements are useful for core development?",
        "expected_keywords": ["core"],
    },
    {
        "id": "Q063",
        "question": "How can I make my core stronger?",
        "expected_keywords": ["core"],
    },
    {
        "id": "Q064",
        "question": "What workouts focus on the core muscles?",
        "expected_keywords": ["core"],
    },
    {
        "id": "Q065",
        "question": "Which exercises target abdominal and core muscles?",
        "expected_keywords": ["core"],
    },
    {
        "id": "Q066",
        "question": "What should I do to improve core strength?",
        "expected_keywords": ["core"],
    },
    {
        "id": "Q067",
        "question": "Which muscles are involved in core-focused training?",
        "expected_keywords": ["core"],
    },
    {
        "id": "Q068",
        "question": "What exercises should I include in a core workout?",
        "expected_keywords": ["core"],
    },
    {
        "id": "Q069",
        "question": "How should I train my midsection?",
        "expected_keywords": ["core"],
    },
    {
        "id": "Q070",
        "question": "Which movements are designed to improve core strength?",
        "expected_keywords": ["core"],
    },


    # ========================================================
    # COMPOUND EXERCISES
    # ========================================================

    {
        "id": "Q071",
        "question": "What does the term compound exercise mean?",
        "expected_keywords": ["compound"],
    },
    {
        "id": "Q072",
        "question": "Can you explain what a compound movement is?",
        "expected_keywords": ["compound"],
    },
    {
        "id": "Q073",
        "question": "What makes an exercise a compound movement?",
        "expected_keywords": ["compound"],
    },
    {
        "id": "Q074",
        "question": "How would you define compound exercises?",
        "expected_keywords": ["compound"],
    },
    {
        "id": "Q075",
        "question": "What type of exercise trains several muscles at once?",
        "expected_keywords": ["compound"],
    },
    {
        "id": "Q076",
        "question": "Which exercises involve multiple muscle groups simultaneously?",
        "expected_keywords": ["compound"],
    },
    {
        "id": "Q077",
        "question": "What are the advantages of compound movements?",
        "expected_keywords": ["compound"],
    },
    {
        "id": "Q078",
        "question": "Why are multi-joint exercises useful?",
        "expected_keywords": ["compound"],
    },
    {
        "id": "Q079",
        "question": "Why would someone include compound exercises in a workout?",
        "expected_keywords": ["compound"],
    },
    {
        "id": "Q080",
        "question": "What is the purpose of using multi-muscle exercises?",
        "expected_keywords": ["compound"],
    },
    {
        "id": "Q081",
        "question": "Which exercises work multiple muscle groups together?",
        "expected_keywords": ["compound"],
    },
    {
        "id": "Q082",
        "question": "How are compound movements different from single-muscle exercises?",
        "expected_keywords": ["compound"],
    },
    {
        "id": "Q083",
        "question": "What characterizes a multi-joint exercise?",
        "expected_keywords": ["compound"],
    },
    {
        "id": "Q084",
        "question": "What kind of movement involves several muscle groups?",
        "expected_keywords": ["compound"],
    },
    {
        "id": "Q085",
        "question": "Why might compound training be useful?",
        "expected_keywords": ["compound"],
    },


    # ========================================================
    # ISOLATION EXERCISES
    # ========================================================

    {
        "id": "Q086",
        "question": "What is an isolation exercise?",
        "expected_keywords": ["isolation"],
    },
    {
        "id": "Q087",
        "question": "Can you explain isolation movements?",
        "expected_keywords": ["isolation"],
    },
    {
        "id": "Q088",
        "question": "What makes a movement an isolation exercise?",
        "expected_keywords": ["isolation"],
    },
    {
        "id": "Q089",
        "question": "How would you define isolation training?",
        "expected_keywords": ["isolation"],
    },
    {
        "id": "Q090",
        "question": "Which exercises focus primarily on one muscle?",
        "expected_keywords": ["isolation"],
    },
    {
        "id": "Q091",
        "question": "What type of exercise targets a specific muscle?",
        "expected_keywords": ["isolation"],
    },
    {
        "id": "Q092",
        "question": "How do isolation movements differ from compound movements?",
        "expected_keywords": ["isolation", "compound"],
    },
    {
        "id": "Q093",
        "question": "What is the difference between single-muscle and multi-muscle exercises?",
        "expected_keywords": ["isolation", "compound"],
    },
    {
        "id": "Q094",
        "question": "When would someone use an isolation exercise?",
        "expected_keywords": ["isolation"],
    },
    {
        "id": "Q095",
        "question": "Why might an athlete use exercises that focus on one muscle?",
        "expected_keywords": ["isolation"],
    },
    {
        "id": "Q096",
        "question": "What exercises are designed to concentrate on a particular muscle?",
        "expected_keywords": ["isolation"],
    },
    {
        "id": "Q097",
        "question": "What type of movement isolates a particular muscle group?",
        "expected_keywords": ["isolation"],
    },
    {
        "id": "Q098",
        "question": "How can you distinguish isolation exercises from compound exercises?",
        "expected_keywords": ["isolation", "compound"],
    },
    {
        "id": "Q099",
        "question": "What is the main characteristic of an isolation movement?",
        "expected_keywords": ["isolation"],
    },
    {
        "id": "Q100",
        "question": "Which training style focuses on a specific muscle rather than several muscles?",
        "expected_keywords": ["isolation"],
    },


    # ========================================================
    # COMPOUND VS ISOLATION
    # ========================================================

    {
        "id": "Q101",
        "question": "How do multi-muscle exercises compare with single-muscle exercises?",
        "expected_keywords": ["compound", "isolation"],
    },
    {
        "id": "Q102",
        "question": "What separates compound training from isolation training?",
        "expected_keywords": ["compound", "isolation"],
    },
    {
        "id": "Q103",
        "question": "What is the difference between exercises that use many muscles and exercises that focus on one?",
        "expected_keywords": ["compound", "isolation"],
    },
    {
        "id": "Q104",
        "question": "How are compound and isolation movements different?",
        "expected_keywords": ["compound", "isolation"],
    },
    {
        "id": "Q105",
        "question": "Which type of exercise involves multiple muscle groups?",
        "expected_keywords": ["compound"],
    },
    {
        "id": "Q106",
        "question": "Which type of training concentrates on a single muscle?",
        "expected_keywords": ["isolation"],
    },
    {
        "id": "Q107",
        "question": "What is the difference between multi-joint and single-joint exercises?",
        "expected_keywords": ["compound", "isolation"],
    },
    {
        "id": "Q108",
        "question": "How can I tell whether an exercise is compound or isolation?",
        "expected_keywords": ["compound", "isolation"],
    },
    {
        "id": "Q109",
        "question": "What distinguishes exercises that train several muscles from exercises that target one?",
        "expected_keywords": ["compound", "isolation"],
    },
    {
        "id": "Q110",
        "question": "Can you compare compound movements with isolation movements?",
        "expected_keywords": ["compound", "isolation"],
    },


    # ========================================================
    # GENERAL TRAINING / PERFORMANCE
    # ========================================================

    {
        "id": "Q111",
        "question": "How can I improve my overall exercise performance?",
        "expected_keywords": ["exercise"],
    },
    {
        "id": "Q112",
        "question": "What can I do to perform better during workouts?",
        "expected_keywords": ["exercise"],
    },
    {
        "id": "Q113",
        "question": "How can I get better results from my training?",
        "expected_keywords": ["training"],
    },
    {
        "id": "Q114",
        "question": "What should I focus on to improve my workouts?",
        "expected_keywords": ["training"],
    },
    {
        "id": "Q115",
        "question": "How should I make progress with my exercise routine?",
        "expected_keywords": ["training"],
    },
    {
        "id": "Q116",
        "question": "What are some ways to improve my training performance?",
        "expected_keywords": ["training"],
    },
    {
        "id": "Q117",
        "question": "How can I make my workouts more effective?",
        "expected_keywords": ["training"],
    },
    {
        "id": "Q118",
        "question": "What should I prioritize when trying to improve my fitness training?",
        "expected_keywords": ["training"],
    },
    {
        "id": "Q119",
        "question": "How can someone make steady progress with workouts?",
        "expected_keywords": ["training"],
    },
    {
        "id": "Q120",
        "question": "What factors should I consider when improving my exercise routine?",
        "expected_keywords": ["training"],
    },


    # ========================================================
    # CROSS-TOPIC SEMANTIC QUESTIONS
    # ========================================================

    {
        "id": "Q121",
        "question": "Which exercises can simultaneously involve the chest, shoulders, and arms?",
        "expected_keywords": ["chest", "shoulders"],
    },
    {
        "id": "Q122",
        "question": "What movements can train more than one major muscle group?",
        "expected_keywords": ["compound"],
    },
    {
        "id": "Q123",
        "question": "What kind of exercises are useful when I want to work several muscles together?",
        "expected_keywords": ["compound"],
    },
    {
        "id": "Q124",
        "question": "Which training approach focuses on one particular muscle at a time?",
        "expected_keywords": ["isolation"],
    },
    {
        "id": "Q125",
        "question": "If I want to target one muscle specifically, what type of exercise should I use?",
        "expected_keywords": ["isolation"],
    },
    {
        "id": "Q126",
        "question": "What type of workout would be useful for targeting my chest?",
        "expected_keywords": ["chest"],
    },
    {
        "id": "Q127",
        "question": "What kind of training would help strengthen my shoulders?",
        "expected_keywords": ["shoulder"],
    },
    {
        "id": "Q128",
        "question": "What should I do if I want stronger arms?",
        "expected_keywords": ["arms"],
    },
    {
        "id": "Q129",
        "question": "What should I do if my goal is stronger legs?",
        "expected_keywords": ["legs"],
    },
    {
        "id": "Q130",
        "question": "What should I do if I want to develop my core?",
        "expected_keywords": ["core"],
    },


    # ========================================================
    # MORE NATURAL USER QUESTIONS
    # ========================================================

    {
        "id": "Q131",
        "question": "I'm trying to build my chest. What exercises should I look at?",
        "expected_keywords": ["chest"],
    },
    {
        "id": "Q132",
        "question": "I want bigger shoulders. Which movements target them?",
        "expected_keywords": ["shoulder"],
    },
    {
        "id": "Q133",
        "question": "My goal is stronger triceps. What should I train?",
        "expected_keywords": ["triceps"],
    },
    {
        "id": "Q134",
        "question": "I want to strengthen my lower body. What exercises are useful?",
        "expected_keywords": ["legs"],
    },
    {
        "id": "Q135",
        "question": "I'm looking for exercises that can improve my core strength.",
        "expected_keywords": ["core"],
    },
    {
        "id": "Q136",
        "question": "I want to get better at push-ups. Where should I focus?",
        "expected_keywords": ["push-up"],
    },
    {
        "id": "Q137",
        "question": "Which muscles should I expect to feel when doing push-ups?",
        "expected_keywords": ["chest", "shoulders"],
    },
    {
        "id": "Q138",
        "question": "Why do my triceps work when I perform push-ups?",
        "expected_keywords": ["triceps"],
    },
    {
        "id": "Q139",
        "question": "Why do push-ups involve the chest?",
        "expected_keywords": ["chest"],
    },
    {
        "id": "Q140",
        "question": "Are push-ups useful for upper-body training?",
        "expected_keywords": ["push-up"],
    },


    # ========================================================
    # ADVANCED PARAPHRASES
    # ========================================================

    {
        "id": "Q141",
        "question": "Which muscle groups contribute to the pressing action in a push-up?",
        "expected_keywords": ["chest", "triceps"],
    },
    {
        "id": "Q142",
        "question": "What upper-body areas are recruited during a bodyweight press?",
        "expected_keywords": ["chest", "shoulders"],
    },
    {
        "id": "Q143",
        "question": "What movement category describes exercises that recruit multiple muscle groups?",
        "expected_keywords": ["compound"],
    },
    {
        "id": "Q144",
        "question": "What exercise category is intended to emphasize one specific muscle?",
        "expected_keywords": ["isolation"],
    },
    {
        "id": "Q145",
        "question": "What is the training distinction between a multi-joint movement and a single-muscle movement?",
        "expected_keywords": ["compound", "isolation"],
    },
    {
        "id": "Q146",
        "question": "Which category would an exercise belong to if it recruits several muscles simultaneously?",
        "expected_keywords": ["compound"],
    },
    {
        "id": "Q147",
        "question": "Which category describes movements intended to concentrate the workload on one muscle?",
        "expected_keywords": ["isolation"],
    },
    {
        "id": "Q148",
        "question": "What kind of exercise should I choose when I want to emphasize one muscle group?",
        "expected_keywords": ["isolation"],
    },
    {
        "id": "Q149",
        "question": "What type of movement is useful when I want several muscle groups working together?",
        "expected_keywords": ["compound"],
    },
    {
        "id": "Q150",
        "question": "How does the muscle involvement of compound movements differ from isolation movements?",
        "expected_keywords": ["compound", "isolation"],
    },


    # ========================================================
    # FINAL MIXED QUESTIONS
    # ========================================================

    {
        "id": "Q151",
        "question": "Which upper-body exercise can involve both pressing muscles and the core?",
        "expected_keywords": ["push-up"],
    },
    {
        "id": "Q152",
        "question": "What kind of training movement is best described as working several muscles together?",
        "expected_keywords": ["compound"],
    },
    {
        "id": "Q153",
        "question": "What kind of exercise would be appropriate for concentrating on one muscle?",
        "expected_keywords": ["isolation"],
    },
    {
        "id": "Q154",
        "question": "What exercises should someone consider for developing their lower body?",
        "expected_keywords": ["legs"],
    },
    {
        "id": "Q155",
        "question": "What exercises would be appropriate for someone focusing on their midsection?",
        "expected_keywords": ["core"],
    },
    {
        "id": "Q156",
        "question": "Which movements can be used to emphasize the deltoid region?",
        "expected_keywords": ["shoulder"],
    },
    {
        "id": "Q157",
        "question": "Which exercises can emphasize the muscles on the back of the upper arm?",
        "expected_keywords": ["triceps"],
    },
    {
        "id": "Q158",
        "question": "What movements can be used to develop the pectoral region?",
        "expected_keywords": ["chest"],
    },
    {
        "id": "Q159",
        "question": "What should I know about the muscles involved in push-ups?",
        "expected_keywords": ["push-up"],
    },
    {
        "id": "Q160",
        "question": "How can I determine which exercise is appropriate for a particular muscle group?",
        "expected_keywords": ["exercise"],
    },
]


# ============================================================
# RELEVANCE CHECK
# ============================================================

def is_relevant(document, expected_keywords):
    """
    Determines whether a retrieved document is relevant.

    A document is considered relevant when it contains
    at least one expected concept.

    For questions containing multiple expected concepts,
    at least one concept must be present for retrieval
    benchmarking.
    """

    text = document.page_content.lower()

    for keyword in expected_keywords:
        if keyword.lower() in text:
            return True

    return False


# ============================================================
# RETRIEVAL EVALUATION
# ============================================================

def evaluate_question(question_data):
    question = question_data["question"]
    expected_keywords = question_data["expected_keywords"]

    documents = retrieve_documents(question)

    results = []

    for rank, document in enumerate(documents, start=1):

        relevant = is_relevant(
            document,
            expected_keywords
        )

        results.append({
            "rank": rank,
            "relevant": relevant,
            "document": document
        })

    first_relevant_rank = None

    for result in results:
        if result["relevant"]:
            first_relevant_rank = result["rank"]
            break

    return first_relevant_rank, results


# ============================================================
# METRIC CALCULATIONS
# ============================================================

def calculate_metrics(all_results):

    metrics = {}

    for k in K_VALUES:

        hits = 0

        for result in all_results:

            rank = result["rank"]

            if rank is not None and rank <= k:
                hits += 1

        hit_rate = hits / len(all_results)

        metrics[f"Hit@{k}"] = hit_rate

    # --------------------------------------------------------
    # MRR
    # --------------------------------------------------------

    reciprocal_ranks = []

    for result in all_results:

        rank = result["rank"]

        if rank is None:
            reciprocal_ranks.append(0)

        else:
            reciprocal_ranks.append(1 / rank)

    mrr = sum(reciprocal_ranks) / len(reciprocal_ranks)

    metrics["MRR"] = mrr

    return metrics


# ============================================================
# MAIN
# ============================================================

def main():

    print("\n" + "=" * 70)
    print("VYRA SEMANTIC RETRIEVAL BENCHMARK")
    print("=" * 70)

    print(f"\nTotal test questions: {len(TEST_CASES)}")
    print("Testing semantic and paraphrased queries")

    print("\n" + "-" * 70)

    all_results = []

    passed = 0
    failed = 0

    for test in TEST_CASES:

        question_id = test["id"]
        question = test["question"]

        rank, documents = evaluate_question(test)

        if rank is not None:

            passed += 1

            print(
                f"[PASS] {question_id} | "
                f"Rank: {rank} | "
                f"{question}"
            )

        else:

            failed += 1

            print(
                f"[FAIL] {question_id} | "
                f"Rank: -- | "
                f"{question}"
            )

        all_results.append({
            "id": question_id,
            "question": question,
            "rank": rank,
        })

    # ========================================================
    # FINAL RESULTS
    # ========================================================

    metrics = calculate_metrics(all_results)

    print("\n")
    print("=" * 70)
    print("FINAL RESULTS")
    print("=" * 70)

    print(f"\nQuestions Tested : {len(TEST_CASES)}")
    print(f"Passed           : {passed}")
    print(f"Failed           : {failed}")

    print(
        f"\nHit@1           : "
        f"{metrics['Hit@1'] * 100:.2f}%"
    )

    print(
        f"Hit@2           : "
        f"{metrics['Hit@2'] * 100:.2f}%"
    )

    print(
        f"Hit@3           : "
        f"{metrics['Hit@3'] * 100:.2f}%"
    )

    print(
        f"MRR             : "
        f"{metrics['MRR']:.3f}"
    )

    print(
        f"MRR Percentage  : "
        f"{metrics['MRR'] * 100:.2f}%"
    )

    # ========================================================
    # QUALITY ASSESSMENT
    # ========================================================

    hit_at_2 = metrics["Hit@2"]

    print("\n" + "=" * 70)
    print("RETRIEVAL QUALITY")
    print("=" * 70)

    if hit_at_2 >= 0.95:

        print("\nExcellent retrieval quality.")

    elif hit_at_2 >= 0.90:

        print("\nVery good retrieval quality.")

    elif hit_at_2 >= 0.80:

        print("\nGood retrieval quality.")

    elif hit_at_2 >= 0.70:

        print("\nModerate retrieval quality.")

    else:

        print("\nRetrieval needs improvement.")

    # ========================================================
    # FAILED QUESTIONS
    # ========================================================

    failed_questions = [
        result
        for result in all_results
        if result["rank"] is None
    ]

    if failed_questions:

        print("\n" + "=" * 70)
        print("FAILED QUESTIONS")
        print("=" * 70)

        for result in failed_questions:

            print(
                f"\n{result['id']}: "
                f"{result['question']}"
            )

    else:

        print("\nNo failed retrieval queries.")

    # ========================================================
    # RANK DISTRIBUTION
    # ========================================================

    print("\n" + "=" * 70)
    print("RANK DISTRIBUTION")
    print("=" * 70)

    rank_1 = sum(
        1
        for result in all_results
        if result["rank"] == 1
    )

    rank_2 = sum(
        1
        for result in all_results
        if result["rank"] == 2
    )

    rank_3 = sum(
        1
        for result in all_results
        if result["rank"] == 3
    )

    not_found = sum(
        1
        for result in all_results
        if result["rank"] is None
    )

    print(f"\nRank 1 : {rank_1}")
    print(f"Rank 2 : {rank_2}")
    print(f"Rank 3 : {rank_3}")
    print(f"Not found : {not_found}")

    print("\n" + "=" * 70)
    print("Evaluation complete.")
    print("=" * 70)


# ============================================================
# ENTRY POINT
# ============================================================

if __name__ == "__main__":
    main()