"""Static assessment catalog and role skill requirements (levels 0-5)."""

SKILLS = [
    "Programming Fundamentals",
    "Data Structures",
    "Algorithms",
    "Databases",
    "Operating Systems",
    "Computer Networks",
    "Aptitude",
    "Communication",
    "Statistics",
    "Machine Learning",
    "Web Development",
    "Cloud & DevOps",
]

ROLE_REQUIREMENTS = {
    # Non-engineering tracks. Without these the catalogue was entirely technical,
    # so a business/product/founder profile could only ever be matched to the
    # "least wrong" engineering role — which is how an entrepreneur's resume ended
    # up recommended for Web Development.
    "Product Manager": {
        "Communication": 5,
        "Aptitude": 5,
        "Statistics": 4,
        "Databases": 3,
        "Programming Fundamentals": 2,
        "Web Development": 2,
    },
    "Business / Operations Analyst": {
        "Communication": 5,
        "Aptitude": 5,
        "Statistics": 5,
        "Databases": 4,
    },
    "Software Engineer (Backend)": {
        "Programming Fundamentals": 5,
        "Data Structures": 5,
        "Algorithms": 5,
        "Databases": 4,
        "Operating Systems": 4,
        "Computer Networks": 3,
        "Aptitude": 4,
        "Communication": 3,
    },
    "Full Stack Developer": {
        "Programming Fundamentals": 4,
        "Data Structures": 4,
        "Web Development": 5,
        "Databases": 4,
        "Cloud & DevOps": 3,
        "Communication": 4,
        "Aptitude": 3,
    },
    "Data Analyst": {
        "Statistics": 5,
        "Databases": 5,
        "Programming Fundamentals": 3,
        "Machine Learning": 3,
        "Communication": 4,
        "Aptitude": 4,
    },
    "ML Engineer": {
        "Machine Learning": 5,
        "Statistics": 5,
        "Programming Fundamentals": 4,
        "Data Structures": 4,
        "Algorithms": 4,
        "Cloud & DevOps": 3,
    },
    "Cloud / DevOps Engineer": {
        "Cloud & DevOps": 5,
        "Operating Systems": 5,
        "Computer Networks": 4,
        "Programming Fundamentals": 3,
        "Databases": 3,
        "Communication": 3,
    },
}


def _q(qid, skill, text, options, answer):
    return {"id": qid, "skill": skill, "question": text, "options": options, "answer": answer}


ASSESSMENTS = [
    {
        "id": "core-cs",
        "kind": "coding",
        "title": "Core Computer Science",
        "description": "Data structures, algorithms, OS, networks and databases fundamentals.",
        "duration_minutes": 15,
        "questions": [
            _q("c1", "Data Structures", "Average-case lookup complexity of a hash table is", ["O(n)", "O(log n)", "O(1)", "O(n log n)"], 2),
            _q("c2", "Data Structures", "Which structure gives O(1) insertion and deletion at both ends?", ["Array", "Deque", "Binary heap", "Singly linked list"], 1),
            _q("c3", "Algorithms", "Worst-case time complexity of quicksort is", ["O(n log n)", "O(n^2)", "O(n)", "O(log n)"], 1),
            _q("c4", "Algorithms", "Which algorithm finds shortest paths with non-negative weights?", ["Kruskal", "Dijkstra", "Bellman-Ford only", "DFS"], 1),
            _q("c5", "Operating Systems", "Thrashing in an OS is caused by", ["Too many CPU cores", "Excessive paging", "Large disk cache", "Low clock speed"], 1),
            _q("c6", "Operating Systems", "A deadlock requires all of the following EXCEPT", ["Mutual exclusion", "Circular wait", "Preemption of all resources", "Hold and wait"], 2),
            _q("c7", "Computer Networks", "TCP provides", ["Unreliable datagrams", "Reliable ordered byte stream", "Broadcast only", "Connectionless transfer"], 1),
            _q("c8", "Computer Networks", "DNS primarily resolves", ["MAC to IP", "Domain names to IP addresses", "Ports to sockets", "IP to routes"], 1),
            _q("c9", "Databases", "Which normal form removes transitive dependencies?", ["1NF", "2NF", "3NF", "BCNF"], 2),
            _q("c10", "Databases", "An index primarily improves", ["Write throughput", "Read/lookup performance", "Storage usage", "Backup speed"], 1),
            _q("c11", "Programming Fundamentals", "Pass-by-reference means the function receives", ["A copy of the value", "The memory location of the value", "A serialized value", "A constant"], 1),
            _q("c12", "Programming Fundamentals", "Which is NOT an OOP pillar?", ["Encapsulation", "Inheritance", "Polymorphism", "Compilation"], 3),
        ],
    },
    {
        "id": "aptitude-comm",
        "kind": "aptitude",
        "title": "Aptitude & Communication",
        "description": "Quantitative reasoning, logic and professional communication.",
        "duration_minutes": 12,
        "questions": [
            _q("a1", "Aptitude", "If 5 machines make 5 widgets in 5 minutes, how long for 100 machines to make 100 widgets?", ["100 min", "20 min", "5 min", "1 min"], 2),
            _q("a2", "Aptitude", "A train travels 180 km in 2.5 hours. Its average speed is", ["60 km/h", "72 km/h", "80 km/h", "90 km/h"], 1),
            _q("a3", "Aptitude", "Next in series: 2, 6, 12, 20, 30, ?", ["36", "40", "42", "44"], 2),
            _q("a4", "Aptitude", "20% of 250 plus 15% of 200 equals", ["70", "80", "85", "95"], 1),
            _q("a5", "Communication", "The clearest way to open a professional email is", ["Hey!!!", "To whomsoever it may concern", "Hi Priya, I'm writing about the campus drive", "Respected sir/madam kindly do the needful"], 2),
            _q("a6", "Communication", "In the STAR method, 'R' stands for", ["Reason", "Result", "Reflection", "Requirement"], 1),
            _q("a7", "Communication", "Active listening in an interview is best shown by", ["Interrupting to add detail", "Paraphrasing the question before answering", "Silently nodding only", "Answering before the question ends"], 1),
            _q("a8", "Aptitude", "If a:b = 3:4 and b:c = 2:5, then a:c is", ["3:10", "6:20", "3:5", "2:5"], 0),
        ],
    },
    {
        "id": "data-ml",
        "kind": "coding",
        "title": "Statistics & Machine Learning",
        "description": "Probability, statistics and applied ML foundations.",
        "duration_minutes": 12,
        "questions": [
            _q("d1", "Statistics", "The median is preferred over the mean when data is", ["Normally distributed", "Skewed with outliers", "Categorical", "Perfectly symmetric"], 1),
            _q("d2", "Statistics", "A p-value of 0.03 at alpha 0.05 means", ["Fail to reject H0", "Reject H0", "H0 is proven true", "Sample is invalid"], 1),
            _q("d3", "Statistics", "Standard deviation measures", ["Central tendency", "Spread of the data", "Skewness", "Correlation"], 1),
            _q("d4", "Machine Learning", "High training accuracy with low test accuracy indicates", ["Underfitting", "Overfitting", "Data leakage only", "Good generalization"], 1),
            _q("d5", "Machine Learning", "Which metric suits an imbalanced binary classification?", ["Accuracy", "F1 score", "MSE", "R-squared"], 1),
            _q("d6", "Machine Learning", "K-means is an example of", ["Supervised regression", "Unsupervised clustering", "Reinforcement learning", "Sequence labeling"], 1),
            _q("d7", "Machine Learning", "Regularization is used to", ["Increase model variance", "Reduce overfitting", "Speed up inference only", "Remove features randomly"], 1),
            _q("d8", "Statistics", "Correlation of -0.9 indicates", ["No relationship", "Strong negative relationship", "Weak positive relationship", "Causation"], 1),
        ],
    },
    {
        "id": "web-cloud",
        "kind": "coding",
        "title": "Web Development & Cloud",
        "description": "Modern web stacks, APIs, containers and deployment.",
        "duration_minutes": 12,
        "questions": [
            _q("w1", "Web Development", "HTTP status 401 means", ["Not found", "Unauthenticated", "Forbidden", "Server error"], 1),
            _q("w2", "Web Development", "React state updates are", ["Always synchronous", "Batched and asynchronous", "Blocking", "Stored in the DOM"], 1),
            _q("w3", "Web Development", "CORS is enforced by", ["The server only", "The browser", "The database", "The DNS resolver"], 1),
            _q("w4", "Web Development", "A REST endpoint that creates a resource should use", ["GET", "POST", "PUT only", "DELETE"], 1),
            _q("w5", "Cloud & DevOps", "A Docker image is", ["A running process", "An immutable filesystem template", "A virtual machine", "A network overlay"], 1),
            _q("w6", "Cloud & DevOps", "Kubernetes' smallest deployable unit is", ["Container", "Pod", "Node", "Service"], 1),
            _q("w7", "Cloud & DevOps", "CI/CD primarily improves", ["Manual release control", "Automated build, test and deploy", "Database indexing", "UI design"], 1),
            _q("w8", "Cloud & DevOps", "Horizontal scaling means", ["Bigger machines", "More machine instances", "Faster disks", "More RAM per node"], 1),
        ],
    },
]

ASSESSMENT_BY_ID = {a["id"]: a for a in ASSESSMENTS}


def public_assessment(assessment: dict, include_answers: bool = False) -> dict:
    questions = []
    for q in assessment["questions"]:
        item = {"id": q["id"], "skill": q["skill"], "question": q["question"], "options": q["options"]}
        if include_answers:
            item["answer"] = q["answer"]
        questions.append(item)
    return {
        "id": assessment["id"],
        "kind": assessment.get("kind", "aptitude"),
        "title": assessment["title"],
        "description": assessment["description"],
        "duration_minutes": assessment["duration_minutes"],
        "question_count": len(assessment["questions"]),
        "skills": sorted({q["skill"] for q in assessment["questions"]}),
        "questions": questions,
    }


def grade(assessment_id: str, answers: dict):
    assessment = ASSESSMENT_BY_ID[assessment_id]
    per_skill = {}
    correct = 0
    for q in assessment["questions"]:
        bucket = per_skill.setdefault(q["skill"], {"correct": 0, "total": 0})
        bucket["total"] += 1
        if answers.get(q["id"]) == q["answer"]:
            bucket["correct"] += 1
            correct += 1
    skill_scores = {skill: round(5 * v["correct"] / v["total"], 2) for skill, v in per_skill.items()}
    return correct, len(assessment["questions"]), skill_scores
