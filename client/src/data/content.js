/**
 * Single source of truth for every piece of content on the site.
 * Edit this file to update the portfolio — no component changes needed.
 */

export const profile = {
  name: 'Anurag Sable',
  firstName: 'Anurag',
  role: 'Backend & Agentic AI Engineer',
  roles: [
    'Backend Engineer',
    'Agentic AI Engineer',
    'LLM Systems Developer',
    'Python Developer',
  ],
  tagline:
    'I build backend systems that let LLMs think, remember and act — orchestration layers, RAG pipelines and async task queues in Python.',
  location: 'Diva, Thane, Maharashtra',
  phone: '+91 7045877301',
  email: 'anuragsable01@gmail.com',
  linkedin: 'https://linkedin.com/in/anurag-sable-4181382a6/',
  github: 'https://github.com/',
  resume: '/Anurag_Sable_Resume.pdf',
  availability: 'Open to backend / AI engineering roles',
  summary: [
    'Computer Science & Engineering graduate specializing in backend engineering for AI-driven systems, with hands-on experience building LLM-integrated applications — conversational pipelines with asynchronous task orchestration, and Retrieval-Augmented Generation (RAG) systems that ground LLM outputs in external data.',
    'Strong foundation in Python, Django, FastAPI and REST API design, with a growing focus on agentic AI engineering — orchestrating LLMs, tools and stateful context into reliable backend systems.',
  ],
}

export const stats = [
  { value: '5+', label: 'Projects shipped' },
  { value: '2', label: 'LLM systems built' },
  { value: '6', label: 'Months of training' },
  { value: '2026', label: 'B.E. graduate' },
]

export const skillGroups = [
  {
    id: 'backend',
    title: 'Backend',
    icon: 'server',
    blurb: 'API design and service architecture',
    items: ['Python (Advanced)', 'Django', 'Django REST Framework', 'FastAPI'],
  },
  {
    id: 'ai',
    title: 'Agentic AI / LLM Systems',
    icon: 'brain',
    blurb: 'Orchestrating models, tools and context',
    items: [
      'LLM Orchestration (Ollama, Qwen3)',
      'Tool Integration',
      'Stateful Context Management',
      'RAG Pipelines',
      'Async Task Orchestration (Celery, Redis)',
    ],
  },
  {
    id: 'genai',
    title: 'GenAI Components',
    icon: 'sparkles',
    blurb: 'The retrieval half of the pipeline',
    items: ['Sentence Transformers', 'Embeddings', 'Semantic Search', 'Document Retrieval'],
  },
  {
    id: 'db',
    title: 'Databases',
    icon: 'database',
    blurb: 'Relational and vector storage',
    items: ['PostgreSQL', 'MySQL', 'SQLite', 'ChromaDB (Vector DB)'],
  },
  {
    id: 'frontend',
    title: 'Frontend',
    icon: 'code',
    blurb: 'Enough to ship the whole product',
    items: ['HTML5', 'CSS3', 'JavaScript'],
  },
  {
    id: 'tools',
    title: 'Tools & Fundamentals',
    icon: 'tools',
    blurb: 'Day-to-day workflow',
    items: ['Git / GitHub', 'Docker', 'Postman', 'VS Code', 'REST APIs', 'WebSockets', 'OOP', 'SQL'],
  },
]

export const projects = [
  {
    id: 'omnichat',
    name: 'OmniChat AI',
    subtitle: 'Conversational LLM Orchestration Platform',
    year: '2025',
    featured: true,
    category: 'Agentic AI',
    accent: 'cyan',
    summary:
      'A backend orchestration layer that routes conversation turns between REST/WebSocket clients, a task queue and a locally hosted Qwen3 LLM — so AI generation never blocks the API.',
    highlights: [
      'Designed a backend orchestration layer routing conversation turns between REST/WebSocket clients, a task queue and a locally hosted Qwen3 LLM tool via Ollama.',
      'Implemented real-time bidirectional communication using WebSockets via Django Channels for live, agent-style responses.',
      'Decoupled LLM inference from the request cycle using Celery and Redis, so generation runs as an asynchronous background task instead of blocking the API.',
      'Maintained stateful conversation context across turns using Redis, and validated API/WebSocket orchestration flows with Postman.',
    ],
    stack: [
      'Django',
      'Django REST Framework',
      'Django Channels',
      'WebSockets',
      'Celery',
      'Redis',
      'Ollama (Qwen3)',
    ],
    flow: ['Client', 'REST / WS', 'Celery queue', 'Qwen3 via Ollama', 'Stream back'],
    links: {},
  },
  {
    id: 'docmind',
    name: 'DocMind',
    subtitle: 'Retrieval-Augmented Reasoning Pipeline',
    year: '2025',
    featured: true,
    category: 'RAG',
    accent: 'violet',
    summary:
      'A multi-step RAG pipeline that grounds a local Qwen3 LLM in your own documents — with cosine-similarity retrieval, relevance thresholding and source-page traceability.',
    highlights: [
      'Built a multi-step RAG pipeline (extract, chunk, embed, retrieve, generate) that grounds a local Qwen3 LLM answer set in a document knowledge base via FastAPI.',
      'Extracted and chunked PDF text with PyMuPDF, then generated semantic embeddings using Sentence Transformers.',
      'Stored embeddings and metadata in ChromaDB as the external memory layer; implemented cosine-similarity retrieval with document-level filtering and relevance thresholding.',
      'Orchestrated retrieval and generation so the LLM consults document context before answering, with source-page tracking for traceability.',
      'Developed FastAPI endpoints for PDF upload and document Q&A with a browser frontend in HTML, CSS and JavaScript.',
    ],
    stack: ['FastAPI', 'Python', 'PyMuPDF', 'Sentence Transformers', 'ChromaDB', 'Ollama (Qwen3)'],
    flow: ['Extract', 'Chunk', 'Embed', 'Retrieve', 'Generate'],
    links: {},
  },
  {
    id: 'skysnap',
    name: 'SkySnap',
    subtitle: 'Weather Web Application',
    year: '2024',
    featured: false,
    category: 'Web App',
    accent: 'sky',
    summary:
      'A real-time weather app built on Django and the OpenWeather API, with a glassmorphism UI and localized date/time.',
    highlights: [
      'Built a real-time weather app with Django, integrating the OpenWeather API for live temperature, humidity and wind data.',
      'Implemented city-based search, dynamic weather icons and localized date/time display with a glassmorphism UI.',
    ],
    stack: ['Django', 'Python', 'OpenWeather API', 'HTML', 'CSS'],
    links: {},
  },
  {
    id: 'todo',
    name: 'Django To-Do List',
    subtitle: 'Task Management Web Application',
    year: '2024',
    featured: false,
    category: 'Web App',
    accent: 'emerald',
    summary:
      'A task manager with full CRUD backed by the Django ORM and PostgreSQL, structured on a clean model-view-template architecture.',
    highlights: [
      'Developed a task management app with full CRUD operations (add, update, delete, mark complete) using the Django ORM.',
      'Structured the backend with a clean model-view-template architecture ensuring smooth data handling.',
    ],
    stack: ['Django', 'Python', 'PostgreSQL', 'HTML', 'CSS'],
    links: {},
  },
  {
    id: 'sms',
    name: 'Student Management System',
    subtitle: 'Records CRUD Platform',
    year: '2024',
    featured: false,
    category: 'Web App',
    accent: 'amber',
    summary: 'A web-based system to manage student records end to end, built with Flask and MySQL.',
    highlights: [
      'Built a web-based system to manage student records with add, update, delete and view features using Flask and MySQL.',
    ],
    stack: ['Python', 'Flask', 'MySQL'],
    links: {},
  },
]

export const timeline = [
  {
    id: 'qspiders',
    kind: 'experience',
    title: 'Python Full Stack Trainee',
    org: 'QSpiders',
    period: 'Sep 2025 · 6 Months',
    points: [
      'Trained in backend development with Django and Django REST Framework, building and consuming RESTful APIs.',
      'Worked with relational databases including MySQL and SQLite; hands-on practice with query optimization and schema design.',
      'Gained frontend exposure in HTML5, CSS3 and JavaScript to support full-stack project delivery.',
    ],
  },
  {
    id: 'be',
    kind: 'education',
    title: 'B.E. in Computer Science & Engineering (AI & ML)',
    org: 'ARMIET College, Thane — Mumbai University',
    period: '2022 – 2026',
    points: ['Specialization in Artificial Intelligence and Machine Learning.'],
  },
  {
    id: 'hsc',
    kind: 'education',
    title: 'HSC — Science',
    org: 'K V Pendharkar College of Arts, Science and Commerce',
    period: '2022',
    points: [],
  },
]

export const certifications = [
  {
    id: 'qspiders-cert',
    title: 'Python Full Stack Development Training',
    issuer: 'QSpiders',
    date: 'Sep 2025',
    detail: 'Backend with Django, REST APIs, databases and frontend technologies.',
  },
  {
    id: 'tata-strive',
    title: 'Entrepreneurship Awareness Program',
    issuer: 'Tata STRIVE',
    date: 'Apr 2026',
    detail: 'Certified in entrepreneurship fundamentals, business planning and startup development.',
  },
]

export const navLinks = [
  { id: 'home', label: 'Home' },
  { id: 'about', label: 'About' },
  { id: 'skills', label: 'Skills' },
  { id: 'projects', label: 'Projects' },
  { id: 'journey', label: 'Journey' },
  { id: 'contact', label: 'Contact' },
]
