"""
Builds client/public/Anurag_Sable_Resume.pdf, the resume the site links to.

Keep its projects, names and certifications in step with
client/src/data/content.js: recruiters read both and compare them.

    pip install reportlab
    python scripts/build_resume.py

The resume must stay one page. If the content outgrows it, the script
tightens line spacing a little at a time, and fails loudly rather than
spilling onto a second page.
"""

from io import BytesIO
from pathlib import Path

from reportlab.lib.colors import HexColor
from reportlab.lib.enums import TA_CENTER
from reportlab.lib.pagesizes import LETTER
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import inch
from reportlab.platypus import HRFlowable, Paragraph, SimpleDocTemplate, Spacer

OUT = Path(__file__).resolve().parent.parent / 'client' / 'public' / 'Anurag_Sable_Resume.pdf'

INK = HexColor('#1a1a1a')
MUTED = HexColor('#333333')
MARGIN_X = 0.55 * inch
RULE_WIDTH = LETTER[0] - 2 * MARGIN_X

# ---------------------------------------------------------------------------
# Content
# ---------------------------------------------------------------------------

NAME = 'ANURAG SABLE'

# Two lines: all five do not fit on one at a readable size.
CONTACT = [
    [
        'Diva, Thane, Maharashtra',
        '+91 7045877301',
        ('anuragsable01@gmail.com', 'mailto:anuragsable01@gmail.com'),
    ],
    [
        ('linkedin.com/in/anurag-sable-4181382a6', 'https://linkedin.com/in/anurag-sable-4181382a6/'),
        ('github.com/anuragsable11', 'https://github.com/anuragsable11'),
    ],
]

SUMMARY = (
    'Computer Science &amp; Engineering graduate specializing in backend engineering for AI-driven '
    'systems, with hands-on experience building LLM-integrated applications: conversational pipelines '
    'with asynchronous task orchestration, and Retrieval-Augmented Generation (RAG) systems that ground '
    'LLM outputs in external data. Strong foundation in Python, Django, FastAPI, and REST API design, '
    'with a growing focus on agentic AI engineering — orchestrating LLMs, tools, and stateful context '
    'into reliable backend systems.'
)

SKILLS = [
    ('Backend', 'Python (Advanced), Django, Django REST Framework, FastAPI'),
    (
        'Agentic AI / LLM Systems',
        'LLM Orchestration (Ollama, Qwen3), Tool Integration, Stateful Context Management, '
        'RAG Pipelines, Async Task Orchestration (Celery, Redis)',
    ),
    ('Databases', 'PostgreSQL, MySQL, SQLite, ChromaDB (Vector DB)'),
    ('GenAI Components', 'Sentence Transformers, Embeddings, Semantic Search, Document Retrieval'),
    ('Frontend', 'HTML5, CSS3, JS'),
    ('Tools', 'Git/GitHub, VS Code, Docker, Postman'),
    ('Other', 'REST APIs, WebSockets, OOP, SQL'),
]

# Company work is described by what was built, never by internal product,
# partner or client names: this PDF is public.
EXPERIENCE = [
    {
        'title': 'Python Full Stack Developer Intern — Shubham Tanks and Liners Pvt Ltd',
        'when': 'Jun 2026 – Present',
        'points': [
            "Working on the company's in-house ERP system, building features with Django REST Framework, PostgreSQL, and React.",
            'Built and handled REST APIs with Django REST Framework: request validation, clear error responses, and frontend integration.',
            'Learned how a production ERP is structured across departments, and how to ship features in a shared team codebase with Git.',
        ],
    },
]

TRAINING = [
    {
        'title': 'Python Full Stack Trainee — QSpiders',
        'when': 'Sep 2025 (6 Months)',
        # One line: the internship above now carries the hands-on story. The
        # training certificate is folded in here rather than given a section.
        'points': [
            'Certified training in Django, Django REST Framework, REST APIs, and MySQL/SQLite schema design and query optimization.',
        ],
    },
]

ARROW = ' → '

PROJECTS = [
    {
        'title': 'Verus AI – Conversational LLM Orchestration Platform',
        'stack': ['Django', 'Django REST Framework', 'Django Channels', 'WebSockets', 'Celery', 'Redis', 'Ollama (Qwen3)'],
        'points': [
            'Designed a backend orchestration layer routing conversation turns between REST/WebSocket clients, a task queue, and a locally hosted Qwen3 LLM tool via Ollama.',
            'Implemented real-time bidirectional communication using WebSockets via Django Channels for live agent-style responses.',
            'Decoupled LLM inference from the request cycle using Celery and Redis, so AI generation runs as an asynchronous background task instead of blocking the API.',
            'Maintained stateful conversation context across turns using Redis, and validated API/WebSocket orchestration flows using Postman.',
        ],
    },
    {
        'title': 'DocMind – Retrieval-Augmented Reasoning Pipeline',
        'stack': ['FastAPI', 'Python', 'PyMuPDF', 'Sentence Transformers', 'ChromaDB', 'Ollama (Qwen3)'],
        'points': [
            'Built a multi-step RAG pipeline (extract' + ARROW + 'chunk' + ARROW + 'embed' + ARROW + 'retrieve' + ARROW
            + "generate) that grounds a local Qwen3 LLM's answers in a document knowledge base via FastAPI.",
            'Extracted and chunked PDF text with PyMuPDF, then generated semantic embeddings using Sentence Transformers.',
            "Stored embeddings and metadata in ChromaDB as the LLM's external memory/retrieval tool; implemented cosine-similarity retrieval with document-level filtering and relevance thresholding.",
            'Orchestrated retrieval and generation so the LLM consults document context before answering, with source-page tracking for traceability.',
            'Developed FastAPI endpoints for PDF upload and document Q&amp;A with a browser frontend in HTML, CSS, and JavaScript.',
        ],
    },
    {
        'title': 'Cursus AI – Career Intelligence for AI Engineers',
        'stack': ['FastAPI', 'Python', 'Next.js', 'TypeScript', 'Ollama (Qwen3 4B)', 'Argon2id'],
        'points': [
            'Built resume parsing that turns an uploaded PDF into a structured profile of skills, experience, education, and projects.',
            'Scored the extracted skills against a job description and turned the missing skills into a 2–12 week learning roadmap, rule-based or expanded by a local Qwen3 (4B) model via Ollama.',
            'Built a FastAPI backend and Next.js frontend with Argon2id password hashing, server-side sessions, and progress tracking.',
        ],
    },
    # The web apps get one line each: the AI systems above carry the resume.
    {
        'title': 'Quizverse – Timed Trivia Quiz Web Application',
        'stack': ['React', 'TypeScript', 'Tailwind CSS', 'Recharts'],
        'points': [
            'Built timed quizzes across 17 categories from the Open Trivia Database, with a scorecard and score-history chart.',
        ],
    },
    {
        'title': 'SkySnap – Weather Web Application',
        'stack': ['Django', 'Python', 'OpenWeather API', 'HTML CSS'],
        'points': [
            'Built a real-time weather app with Django, integrating the OpenWeather API for live temperature, humidity, and wind data.',
        ],
    },
    {
        'title': 'Doneward – Task Management Web Application',
        'stack': ['Django', 'Python', 'PostgreSQL', 'HTML CSS'],
        'points': [
            'Developed a task management app with full CRUD operations (add, update, delete, mark complete) using Django ORM.',
        ],
    },
]

EDUCATION = [
    {
        'title': 'BE in Computer Science &amp; Engineering (AI &amp; ML) — Mumbai University',
        'when': '2022 – 2026',
        'note': 'ARMIET College, Thane',
    },
    {
        'title': 'HSC Science — K V Pendharkar College of Arts, Science and Commerce',
        'when': '2022',
        'note': None,
    },
]

# ---------------------------------------------------------------------------
# Layout
# ---------------------------------------------------------------------------


def styles(fit):
    """Paragraph styles; `fit` (<= 1) scales only the vertical spacing."""

    def ps(name, **kw):
        kw.setdefault('fontName', 'Helvetica')
        kw.setdefault('textColor', INK)
        return ParagraphStyle(name, **kw)

    return {
        'name': ps('name', fontName='Helvetica-Bold', fontSize=16, leading=19 * fit, alignment=TA_CENTER, spaceAfter=2 * fit),
        'contact': ps('contact', fontSize=8.7, leading=11 * fit, textColor=MUTED, alignment=TA_CENTER, spaceAfter=4 * fit),
        'heading': ps('heading', fontName='Helvetica-Bold', fontSize=10.5, leading=13 * fit, spaceBefore=3 * fit),
        'body': ps('body', fontSize=8.7, leading=11 * fit),
        'skill': ps('skill', fontSize=8.7, leading=11 * fit, spaceBefore=1 * fit),
        'item': ps('item', fontName='Helvetica-Bold', fontSize=9.2, leading=12 * fit, spaceBefore=2 * fit),
        'note': ps('note', fontSize=8.8, leading=11 * fit),
        'bullet': ps(
            'bullet', fontSize=8.7, leading=10.7 * fit, spaceBefore=0.5 * fit,
            leftIndent=22, bulletIndent=13, bulletFontName='Helvetica', bulletFontSize=8.7,
        ),
    }


def link(text, href):
    return f'<a href="{href}" color="#333333">{text}</a>'


def story(fit):
    s = styles(fit)
    gap = '&nbsp;' * 4
    out = []

    def section(title):
        out.append(Paragraph(title, s['heading']))
        out.append(HRFlowable(width=RULE_WIDTH, thickness=0.75, color=INK, spaceBefore=2 * fit, spaceAfter=2 * fit))

    def bullets(points):
        out.extend(Paragraph(p, s['bullet'], bulletText='•') for p in points)

    out.append(Paragraph(NAME, s['name']))
    lines = [' | '.join(link(*c) if isinstance(c, tuple) else c for c in line) for line in CONTACT]
    out.append(Paragraph('<br/>'.join(lines), s['contact']))

    section('SUMMARY')
    out.append(Paragraph(SUMMARY, s['body']))

    section('TECHNICAL SKILLS')
    out.extend(Paragraph(f'<b>{label}:</b> {items}', s['skill']) for label, items in SKILLS)

    for heading, entries in (('EXPERIENCE', EXPERIENCE), ('TRAINING', TRAINING)):
        section(heading)
        for t in entries:
            out.append(Paragraph(f'{t["title"]}{gap}{t["when"]}', s['item']))
            bullets(t['points'])

    section('PROJECTS')
    for p in PROJECTS:
        stack = ' · '.join(p['stack'])
        out.append(Paragraph(f'{p["title"]}&nbsp;&nbsp;<font name="Helvetica-BoldOblique">{stack}</font>', s['item']))
        bullets(p['points'])

    section('EDUCATION')
    for e in EDUCATION:
        out.append(Paragraph(f'{e["title"]}{gap}{e["when"]}', s['item']))
        if e['note']:
            out.append(Paragraph(e['note'], s['note']))

    return out


def render(fit):
    buf = BytesIO()
    doc = SimpleDocTemplate(
        buf,
        pagesize=LETTER,
        leftMargin=MARGIN_X,
        rightMargin=MARGIN_X,
        topMargin=0.18 * inch,
        bottomMargin=0.35 * inch,
        title='Anurag Sable - Resume',
        author='Anurag Sable',
        subject='Resume',
    )
    doc.build(story(fit))
    return buf.getvalue(), doc.page


def main():
    for step in range(11):  # 1.00 down to 0.90
        fit = 1 - step * 0.01
        pdf, pages = render(fit)
        if pages == 1:
            OUT.write_bytes(pdf)
            print(f'wrote {OUT} (1 page, spacing x{fit:.2f})')
            return
    raise SystemExit('Resume no longer fits on one page even with tighter spacing; trim the content.')


if __name__ == '__main__':
    main()
