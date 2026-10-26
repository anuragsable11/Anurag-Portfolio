/**
 * The last build step: writes the site's words into its HTML, so crawlers,
 * link previews and visitors without JavaScript get the real page, not an
 * empty shell. Runs after `vite build` (the pages) and `vite build --ssr`
 * (src/entry-server.jsx, into dist-ssr/), then deletes dist-ssr/.
 *
 *   index.html     the whole portfolio, rendered by React; the browser
 *                  hydrates it (src/main.jsx)
 *   projects.html  the title, menu, grid and an index of every project
 *
 * It also completes the Open Graph tags, which need absolute URLs: SITE_URL
 * if set (e.g. SITE_URL=https://example.com), else the production domain
 * Vercel provides at build time.
 */
import { readFile, rm, writeFile } from 'node:fs/promises'

const dist = new URL('./dist/', import.meta.url)
const ssr = new URL('./dist-ssr/', import.meta.url)

const { renderHome, renderProjects } = await import(new URL('entry-server.js', ssr))

const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL
const site = (process.env.SITE_URL || (vercel ? `https://${vercel}` : '')).replace(/\/+$/, '')
if (!site) console.warn('[prerender] No SITE_URL: Open Graph URLs stay relative (fine for local builds).')

/** Puts `content` inside the one empty element `empty`, or fails the build. */
function fill(html, empty, content) {
  const parts = html.split(empty)
  if (parts.length !== 2) {
    throw new Error(`[prerender] expected "${empty}" once, found it ${parts.length - 1} times`)
  }
  const close = empty.lastIndexOf('</')
  return parts[0] + empty.slice(0, close) + content + empty.slice(close) + parts[1]
}

async function page(file, edit) {
  const url = new URL(file, dist)
  let html = await readFile(url, 'utf8')
  html = edit(html).replaceAll('%SITE_URL%', site)
  if (html.includes('%SITE_URL')) throw new Error(`[prerender] ${file}: unfilled %SITE_URL%`)
  await writeFile(url, html)
  console.log(`[prerender] ${file}: ${(Buffer.byteLength(html) / 1024).toFixed(1)} kB`)
}

await page('index.html', (html) => fill(html, '<div id="root"></div>', renderHome()))
await page('projects.html', (html) =>
  Object.entries(renderProjects()).reduce((out, [empty, content]) => fill(out, empty, content), html)
)

await rm(ssr, { recursive: true, force: true })
console.log(`[prerender] done${site ? ` (${site})` : ''}`)
