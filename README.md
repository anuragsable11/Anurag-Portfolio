# Anurag Sable — Portfolio

Personal portfolio site for **Anurag Sable**, Backend & Agentic AI Engineer.

Built as a full-stack app: a **React (Vite)** frontend and a **Node.js / Express** API that
receives contact-form submissions.

---

## Stack

| Layer    | Technology                                            |
| -------- | ----------------------------------------------------- |
| Frontend | React 18, Vite 6, Framer Motion, React Icons, plain CSS |
| Backend  | Node.js, Express 4, CORS, dotenv                       |

---

## Quick start

From the project root:

```bash
# 1. Install everything (root + client + server)
npm run install:all

# 2. Run the frontend and the API together
npm run dev
```

- Frontend → http://localhost:5173
- API → http://localhost:5000

Vite proxies `/api/*` to the Express server, so the contact form works in development
with no extra configuration.

### Run them separately

```bash
npm run dev:client   # Vite dev server only
npm run dev:server   # Express API only (auto-restarts on change)
```

---

## Before you publish — 3 things to do

1. **Add your resume PDF.**
   Drop your resume into `client/public/` named exactly:

   ```
   client/public/Anurag_Sable_Resume.pdf
   ```

   The "Download Resume" buttons in the navbar and hero link to it.
   (To use a different filename, update `profile.resume` in `client/src/data/content.js`.)

2. **Set your real GitHub URL.**
   `client/src/data/content.js` → `profile.github` is currently a placeholder
   (`https://github.com/`). Replace it with your profile URL.

3. **Add project links.**
   Each project in `content.js` has an empty `links: {}`. Once your repos are public,
   you can add `{ github: '...', demo: '...' }` and surface them on the cards.

---

## Editing content

**Everything on the site comes from one file:**

```
client/src/data/content.js
```

| Export           | Controls                                              |
| ---------------- | ----------------------------------------------------- |
| `profile`        | Name, role, tagline, contact details, resume path      |
| `stats`          | The four number tiles in the About section             |
| `skillGroups`    | The six skill cards                                    |
| `projects`       | Project cards (set `featured: true` for the wide layout) |
| `timeline`       | Training + education entries                           |
| `certifications` | Certificate cards                                      |
| `navLinks`       | Navbar items (each `id` must match a section `id`)     |

No component edits are needed for normal content changes.

### Changing the colors

The palette lives in the `:root` block at the top of `client/src/index.css`:

```css
--cyan: #22d3ee;
--violet: #a78bfa;
--grad: linear-gradient(120deg, #22d3ee 0%, #818cf8 50%, #a78bfa 100%);
```

Change those two accents and the whole site follows.

---

## API

### `GET /api/health`

Liveness check.

```json
{ "ok": true, "service": "portfolio-api", "time": "..." }
```

### `POST /api/contact`

Accepts a contact-form submission.

```json
{
  "name": "Jane Doe",
  "email": "jane@company.com",
  "subject": "Backend role",
  "message": "At least 10 characters."
}
```

- Validates name, email format and message length server-side.
- Rate limited to **5 submissions per IP per 15 minutes**.
- Appends the message to `server/data/messages.json` (gitignored) and logs it to the console.

Returns `201` on success, `400` on validation failure, `429` when rate limited.

> **Note:** messages are stored in a JSON file, not emailed. To get email notifications,
> add `nodemailer` to `server/` and send a mail inside the `/api/contact` handler after
> `saveMessage(entry)`.

---

## Production build

```bash
npm run build     # builds client/dist
npm start         # serves the API
```

Set `NODE_ENV=production` and the Express server will also serve `client/dist`, so the
whole site runs from a single port.

```bash
# Windows PowerShell
$env:NODE_ENV="production"; npm start
```

### Deploying

- **Frontend only** (Vercel / Netlify / GitHub Pages): build `client/` and deploy `client/dist`.
  The contact form then needs the API hosted separately — point it at the deployed API URL.
- **Both together** (Render / Railway / Fly.io): build command `npm run install:all && npm run build`,
  start command `npm start`, with `NODE_ENV=production`.

Set `CORS_ORIGIN` in the server environment to your deployed frontend origin.
See `server/.env.example`.

---

## Project structure

```
Portfolio/
├── client/                   # React + Vite frontend
│   ├── public/               # favicon.svg — put your resume PDF here
│   └── src/
│       ├── components/       # Navbar, Hero, About, Skills, Projects, Journey, Contact, Footer
│       ├── data/content.js   # ← all site content
│       ├── hooks/            # scroll-position hooks
│       ├── index.css         # design tokens + all styles
│       ├── App.jsx
│       └── main.jsx
├── server/                   # Express API
│   ├── data/                 # messages.json (created on first submission)
│   ├── .env.example
│   └── index.js
└── package.json              # orchestration scripts
```

---

## Features

- Animated hero with a rotating role typewriter and a syntax-highlighted code panel
- Aurora-orb + grid background, scroll progress bar, section-aware navbar with a sliding pill
- Scroll-reveal animations throughout (Framer Motion), fully disabled under
  `prefers-reduced-motion`
- Filterable project cards with expandable detail and a pipeline diagram for featured work
- Working contact form with client-side and server-side validation
- Responsive down to 360px; keyboard-accessible with visible focus rings
