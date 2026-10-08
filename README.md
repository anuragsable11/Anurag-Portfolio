# Anurag Sable — Portfolio

Personal portfolio site for **Anurag Sable**, Backend & Agentic AI Engineer.

Built as a full-stack app: a **React (Vite)** frontend and a **Node.js / Express** API that
receives contact-form submissions.

---

## Stack

| Layer    | Technology                                            |
| -------- | ----------------------------------------------------- |
| Frontend | React 18, Vite 6, Three.js, Framer Motion, React Icons, plain CSS |
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
| `skillGroups`    | Grouped skill lists (not currently rendered — see below) |
| `projects`       | Project cards (set `featured: true` for the wide layout) |
| `timeline`       | Training + education entries                           |
| `certifications` | Certificate cards                                      |
| `navLinks`       | Navbar items (each `id` must match a section `id`)     |

The skills cloud logos live separately in `client/src/data/tech.js`, since each one
needs an icon component as well as a label.

`skillGroups` is kept but unused: the Skills section is now the logo cloud alone. To show
the grouped chip cards again, render `skillGroups` beneath `<ToolsCloud3D />` in
`components/Skills.jsx`.

No component edits are needed for normal content changes.

### Changing the colors

The palette lives in the `:root` block at the top of `client/src/index.css`:

```css
:root, :root[data-theme='light'] {
  --bg: #ffffff;
  --fg: #0a0a0a;
  --brand: #2584f5;      /* fills, rules, focus rings */
  --brand-text: #1069d2; /* text — darker so it clears AA on white */
}
:root[data-theme='dark'] {
  --bg: #0a0a0a;
  --fg: #fafafa;
  --brand: #569fff;
}
```

The palette is a neutral grayscale base with a single blue accent, in both a light and a
dark theme. `--brand` is split in two on purpose: the bright blue is fine for fills and
borders but falls short of WCAG AA as text on white, so text uses the darker
`--brand-text`. Keep that split if you change the accent.

### Theme toggle

The site ships light and dark themes. An inline script in `index.html` resolves the theme
before first paint (saved choice, else the OS preference) so there is no flash of the
wrong one; `src/hooks/useTheme.js` handles toggling and persistence.

### The hero samurai

The samurai lives in `client/src/components/Samurai3D/` (`SamuraiEngine.js` ties it
together; each file opens with what it does). Out of the box he is modelled in code, so
there is no model file to download. Two settings in `Samurai3D/config.js`:

- `renderer` — `'auto'` (default): WebGPU on discrete GPUs, WebGL 2 elsewhere, because
  integrated GPUs draw this scene faster with WebGL 2. `'webgpu'` or `'webgl'` force one.
- `model` — `null` (default): the built-in samurai. Or the URL of a `.glb` to load instead.

Whichever renderer is chosen falls back to WebGL 2, and from there to a still picture of him.

**Swapping in a GLB model**

1. With `npm run dev` running, open `http://localhost:5173/tools/export-samurai-glb.html`
   and save `samurai.glb`: the current samurai with his skeleton, named materials and
   animation clips — a starting point for re-modelling him in Blender.
2. Keep the joint names and the `extras.rig` marker on the root node (listed in
   `Samurai3D/rig.js`) and he keeps his full live performance. Any other rigged character
   works too, played from clips named `IDLE`, `ATTENTION`, `DRAW_KATANA`, `STANCE` and
   `RETURN_IDLE`. Materials named `eye`, `steel` (the blade) and `glow` (the eye halos)
   are the ones his effects light up.
3. Compress it — Meshopt, Draco and KTX2 files all load:
   `npx @gltf-transform/cli optimize samurai.glb samurai.opt.glb --compress meshopt --texture-compress webp`
4. Put it in `client/public/models/` and set `model: '/models/samurai.opt.glb'`. In
   development, `?samurai-model=/models/samurai.opt.glb` on the page URL tries a file
   without editing the config. If the file fails to load, the built-in samurai is used.
5. Re-render his poster (below) so the still picture matches the new model.

**The poster** — the picture shown while he loads, and wherever 3D can't run — lives in
`client/src/assets/samurai/`. With `npm run dev` running, open
`/tools/render-samurai-poster.html?theme=light` and `?theme=dark`, and save the downloads
over the files there.

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
- Emails it via `api/_lib/mailer.js` when configured — see below. The response includes
  a `delivered` boolean so you can tell whether mail actually went out.

Returns `201` on success, `400` on validation failure, `429` when rate limited.

---

## Getting the contact form to email you

**By default it does not email anyone.** Messages are saved and logged, but nothing is
sent until you add a Resend API key. That is the single most common reason for "I filled
in the form and got no mail".

### Check which state you are in

```
curl http://localhost:5000/api/health
```

`email.configured: false` with a `missing` list means no mail will go out. The server
also prints this at boot:

```
Contact email OFF (missing RESEND_API_KEY, CONTACT_TO_EMAIL)
```

### Turn it on (about two minutes)

1. Sign up at **https://resend.com** using the address you want messages delivered to.
2. Create an API key at **https://resend.com/api-keys**.
3. **Locally** — copy the example env file and fill in the two values:

   ```bash
   cp server/.env.example server/.env
   ```

   ```
   RESEND_API_KEY=re_your_key_here
   CONTACT_TO_EMAIL=you@example.com
   ```

   Restart the API. It should now print `Contact email -> you@example.com`.

4. **On Vercel** — add the same two variables under
   Settings → **Environment Variables**, then redeploy.

| Variable | Required | Notes |
| --- | --- | --- |
| `RESEND_API_KEY` | yes | From resend.com/api-keys |
| `CONTACT_TO_EMAIL` | yes | Where messages are delivered |
| `CONTACT_FROM_EMAIL` | no | Defaults to Resend's shared test sender |

> On the default sender (`onboarding@resend.dev`), Resend only delivers to the address
> that owns the API key. That is fine for a personal portfolio. To send anywhere else,
> verify your own domain in Resend and set `CONTACT_FROM_EMAIL` to an address on it.

### If it still does not arrive

The server never hides a delivery failure. Check the logs — locally in the terminal, on
Vercel under your project → **Logs**:

```
[contact] emailed to you@example.com (3f2a...)      <- delivered
[contact] NOT EMAILED — resend responded 401: ...   <- the actual cause
```

A failed send never loses the message: it is stored (locally) and logged (everywhere)
before delivery is even attempted, and the visitor still sees a success message.

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

---

## Deploying to Vercel

`vercel.json` in the project root already configures this — import the repo and deploy,
no dashboard settings needed:

```json
{
  "buildCommand": "npm --prefix client install && npm --prefix client run build",
  "outputDirectory": "client/dist"
}
```

The `client` install is explicit because Vercel only installs the **root** `package.json`
by default, which would leave `vite` missing at build time.

### The contact form on Vercel

Vercel is serverless, so `server/index.js` does **not** run there. The same endpoint is
provided by `api/contact.js`, which Vercel deploys automatically as a function at
`/api/contact`. Both share their validation and rate-limiting rules from
`api/_lib/contact.js`, so the two can never drift apart.

| | Local (`npm run dev`) | Vercel |
| --- | --- | --- |
| Handler | `server/index.js` (Express) | `api/contact.js` (function) |
| Messages go to | `server/data/messages.json` | Function logs, + email if configured |

Serverless filesystems are ephemeral, so the Vercel function cannot write to disk.
Submissions are always written to the function logs (Vercel dashboard → your project →
**Logs**). To also receive them by email, add a free [Resend](https://resend.com) key under
Vercel → Settings → **Environment Variables**:

| Variable | Example | Required |
| --- | --- | --- |
| `RESEND_API_KEY` | `re_...` | yes, for email |
| `CONTACT_TO_EMAIL` | `anuragsable01@gmail.com` | yes, for email |
| `CONTACT_FROM_EMAIL` | `Portfolio <onboarding@resend.dev>` | optional |

Without them the form still works and still returns success — the message just lands in
the logs rather than your inbox.

### Deploying elsewhere

- **Render / Railway / Fly.io** (runs the real Express server): build command
  `npm run install:all && npm run build`, start command `npm start`, with
  `NODE_ENV=production`. Express then serves `client/dist` too, so everything runs on one port.
- Set `CORS_ORIGIN` to your deployed frontend origin. See `server/.env.example`.

---

## Project structure

```
Portfolio/
├── api/                      # Vercel serverless functions
│   ├── _lib/contact.js       # shared validation + rate limiting
│   └── contact.js            # POST /api/contact on Vercel
├── client/                   # React + Vite frontend
│   ├── public/               # favicon.svg — put your resume PDF here
│   ├── tools/                # dev pages: samurai poster renderer, GLB exporter
│   └── src/
│       ├── components/       # Navbar, Hero, About, Skills, Projects, Journey, Contact, Footer
│       │                     #   Samurai3D/ · ToolsCloud3D · AgentGraph3D (three.js)
│       ├── data/content.js   # ← all site content
│       ├── data/tech.js      # skills-cloud logos
│       ├── hooks/            # scroll-position + theme hooks
│       ├── lib/              # WebGL / reduced-motion capability checks
│       ├── index.css         # design tokens + all styles
│       ├── App.jsx
│       └── main.jsx
├── server/                   # Express API
│   ├── data/                 # messages.json (created on first submission)
│   ├── .env.example
│   └── index.js
├── vercel.json               # Vercel build config
└── package.json              # orchestration scripts
```

---

## Features

- Light and dark themes with a toggle, no flash on load
- Animated hero with a rotating role typewriter
- Three original Three.js scenes, all built from primitives and driven by the theme tokens:
  - **Hero** — a samurai companion in lacquered armour. He breathes, blinks and follows the
    cursor with his head; hovering warms his glow, and a click (or Enter) has him draw his
    katana in a short move with a blade glint and sparks. Drag to turn him. Drawn with
    WebGL 2, or WebGPU on discrete GPUs, at a quality level picked for the device and
    adjusted to its measured frame rate
  - **Skills** — the tech stack as solid 3D tiles orbiting a sphere. Drag to spin, hover a
    tile to lift and name it. Each logo is rasterised from its SVG onto a canvas texture.
  - **About** — the agent runtime as a node graph: client, API, queue, model and memory
    wired in a loop, with request pulses travelling the edges
- Scenes pause their render loop while off screen, so three canvases never animate at once
- three.js is code-split into one shared chunk: first paint ships ~118kB gzipped
- Scroll progress bar, section-aware navbar with a sliding pill
- Scroll-reveal animations throughout (Framer Motion), fully disabled under
  `prefers-reduced-motion`, which also keeps the samurai calm (breathing and blinking, no
  effects, gentler moves). Without WebGL (or with reduced motion) the skills cloud falls back
  to a flat logo grid and the About graph is simply omitted; without WebGL the hero shows a
  still picture of the samurai — none of which downloads three.js at all
- Filterable project cards with expandable detail and a pipeline diagram for featured work
- Working contact form with client-side and server-side validation
- Responsive down to 360px; keyboard-accessible with visible focus rings
