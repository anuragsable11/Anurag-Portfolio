/**
 * Single source of truth for every piece of content on the site.
 * Edit this file to update the portfolio — no component changes needed.
 */
import docmindLanding from '../assets/projects/docmind-landing-1600.webp'
import docmindLandingSmall from '../assets/projects/docmind-landing-800.webp'
import cursusLanding from '../assets/projects/cursus-landing-1600.webp'
import cursusLandingSmall from '../assets/projects/cursus-landing-800.webp'
import verusLanding from '../assets/projects/verus-landing-1600.webp'
import verusLandingSmall from '../assets/projects/verus-landing-800.webp'
import quizverseLanding from '../assets/projects/quizverse-landing-1600.webp'
import quizverseLandingSmall from '../assets/projects/quizverse-landing-800.webp'
import skysnapLanding from '../assets/projects/skysnap-landing-1600.webp'
import skysnapLandingSmall from '../assets/projects/skysnap-landing-800.webp'
import donewardLanding from '../assets/projects/doneward-landing-1600.webp'
import donewardLandingSmall from '../assets/projects/doneward-landing-800.webp'

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
  github: 'https://github.com/anuragsable11',
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
      'Prompt Engineering',
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
    id: 'ml',
    title: 'ML Frameworks',
    icon: 'brain',
    blurb: 'The libraries under the models',
    items: ['Hugging Face', 'PyTorch', 'TensorFlow'],
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
    id: 'verus',
    name: 'Verus AI',
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
    // The product's own landing page, shown above the engineering write-up.
    showcase: {
      image: verusLanding,
      imageSmall: verusLandingSmall,
      width: 1590,
      height: 758,
      address: 'verus.local',
      alt: 'Verus AI landing page: the headline "Private AI chat, on your own terms." above Continue chatting and Explore features buttons, with a badge reading "Qwen3 via Ollama — zero cloud calls".',
      headline: 'Private AI chat, on your own terms.',
      pitch:
        'Verus AI runs a language model on your own server and delivers answers live to your browser. No API keys, no per-token bills, and not a single message leaves your infrastructure.',
      promises: ['Self-hosted', 'Conversation memory', 'Live WebSocket replies'],
    },
    links: { github: 'https://github.com/anuragsable11/OmniChat-AI' },
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
    showcase: {
      image: docmindLanding,
      imageSmall: docmindLandingSmall,
      width: 1585,
      height: 761,
      address: 'docmind.local',
      alt: 'DocMind landing page: the headline "Ask your PDFs anything. Get answers you can check." beside a mock chat over annual-report-2025.pdf, where the answer cites pages 4 and 12.',
      headline: 'Ask your PDFs anything. Get answers you can check.',
      pitch:
        "Upload a PDF and ask in plain language. Every answer cites the page it came from, and if the document doesn't say it, DocMind won't make it up.",
      promises: ['Page citations', 'No cloud upload', 'No account needed'],
    },
    links: { github: 'https://github.com/anuragsable11/DocMind' },
  },
  {
    id: 'cursus',
    name: 'Cursus AI',
    subtitle: 'Career Intelligence for AI Engineers',
    year: '2026',
    featured: true,
    category: 'Full Stack',
    accent: 'emerald',
    summary:
      'For aspiring AI Engineers: it reads your resume, scores it against a real job description, and turns the gaps into a 2–12 week learning roadmap — instant and rule-based, or expanded by a local Qwen3 model.',
    highlights: [
      'Built resume parsing that turns an uploaded PDF into a structured profile of skills, experience, education and projects.',
      'Compared the extracted skills against a job description to score the match and list the missing skills as gaps.',
      'Generated a 2–12 week learning roadmap from those gaps: an instant rule-based plan, plus an optional AI version on a local Qwen3 (4B) model via Ollama that adds explanations, project ideas and interview topics.',
      'Built a FastAPI backend and a Next.js frontend with secure accounts (Argon2id password hashing and server-side sessions), progress tracking, and light and dark themes.',
    ],
    stack: ['FastAPI', 'Python', 'Next.js', 'TypeScript', 'Ollama (Qwen3 4B)', 'Argon2id'],
    flow: ['Resume PDF', 'Skill profile', 'Job match', 'Skill gaps', 'Roadmap'],
    showcase: {
      image: cursusLanding,
      imageSmall: cursusLandingSmall,
      width: 1525,
      height: 763,
      address: 'cursus.local',
      alt: 'Cursus AI overview page in dark mode: the headline "Anurag, know exactly what to learn next" beside an Analyze your resume button, a three-step journey (Resume profile, Job match, Learning roadmap), and an example card showing 12 skills found in resume.pdf, 68% skill coverage and a Week 2 Embeddings & RAG checklist.',
      headline: 'Know exactly what to learn next.',
      pitch:
        'Turn your resume into a skill profile, see how it covers a real job description, and follow a week-by-week plan with projects worth building.',
      promises: ['Resume profile', 'Job match', 'Learning roadmap'],
    },
    links: { github: 'https://github.com/anuragsable11/cursus-ai' },
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
    showcase: {
      image: skysnapLanding,
      imageSmall: skysnapLandingSmall,
      width: 1571,
      height: 728,
      address: 'sky-snap-weather-website-x92k.vercel.app',
      alt: 'SkySnap landing page on a starry night sky: the headline "What’s the sky doing?" under a "Live weather · Any city on earth" label, a city search bar with a Snap it button, recent searches and quick picks for London, New York, Tokyo, Mumbai, Paris and Sydney, with a sun-and-cloud icon on the right.',
    },
    links: {
      live: 'https://sky-snap-weather-website-x92k.vercel.app/',
      github: 'https://github.com/anuragsable11/SkySnap-Weather-Website-',
    },
  },
  {
    id: 'doneward',
    name: 'Doneward',
    subtitle: 'Task Management Web Application',
    year: '2024',
    featured: false,
    category: 'Web App',
    accent: 'amber',
    summary:
      'A task manager with full CRUD backed by the Django ORM and PostgreSQL, structured on a clean model-view-template architecture.',
    highlights: [
      'Developed a task management app with full CRUD operations (add, update, delete, mark complete) using the Django ORM.',
      'Structured the backend with a clean model-view-template architecture ensuring smooth data handling.',
    ],
    stack: ['Django', 'Python', 'PostgreSQL', 'HTML', 'CSS'],
    showcase: {
      image: donewardLanding,
      imageSmall: donewardLandingSmall,
      width: 1580,
      height: 756,
      address: 'doneward.vercel.app',
      alt: 'Doneward landing page in dark mode: the serif headline "Write it down. Get it done." with "done." circled in orange, a "Meet Stripes, your task assistant" badge above it, Start for free and Log in buttons, and the line "Free · Private · No clutter".',
      headline: 'Write it down. Get it done.',
      pitch:
        'A calm, focused to-do list for everything on your mind. Capture tasks in a keystroke, check them off with a satisfying click, and never lose a thing.',
      promises: ['Free', 'Private', 'No clutter'],
    },
    links: {
      live: 'https://doneward.vercel.app/',
      github: 'https://github.com/anuragsable11/Django-TO-DO-List',
    },
  },
  {
    id: 'quizverse',
    name: 'Quizverse',
    subtitle: 'Timed Trivia Quiz Web Application',
    year: '2025',
    featured: false,
    category: 'Web App',
    accent: 'violet',
    summary:
      'Timed multiple-choice quizzes across 17 categories and three difficulty levels, with a scorecard that tracks every attempt — questions come from the Open Trivia Database.',
    highlights: [
      'Built timed multiple-choice quizzes across 17 categories, pulling questions from the Open Trivia Database.',
      'Players choose the category, difficulty, number of questions (5–50) and time per question (10–60 s), with instant feedback and a full answer review at the end.',
      'Built a scorecard with quizzes played, average and best score, a score-history chart and every attempt.',
      'Added guest play or sign-up and log-in, profile name and photo, keyboard shortcuts, and light and dark mode, responsive down to phone width.',
    ],
    stack: ['React', 'TypeScript', 'Vite', 'Tailwind CSS', 'shadcn/ui', 'React Router', 'Recharts'],
    showcase: {
      image: quizverseLanding,
      imageSmall: quizverseLandingSmall,
      width: 1585,
      height: 759,
      address: 'playquizverse.vercel.app',
      alt: 'Quizverse landing page in dark mode: the headline "Timed quizzes in 17 categories" with Start a quiz and Create an account buttons, beside a "Pick a category" grid running from General Knowledge to Vehicles, with a "How a quiz works" table below.',
    },
    links: {
      live: 'https://playquizverse.vercel.app/',
      github: 'https://github.com/anuragsable11/Quize-website',
    },
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
