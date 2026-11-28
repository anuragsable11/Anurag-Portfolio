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
 * Vercel provides at build time. With a site URL it writes sitemap.xml and
 * points robots.txt at it. And it preloads the headings' font on the home
 * page (see preloadHeadingFont).
 */
import { readdir, readFile, rm, writeFile } from 'node:fs/promises'

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

/**
 * The Mincho that sets the name and the headings is fetched alongside the
 * page rather than once the stylesheet asks for it, so the first paint is
 * already in it instead of a fallback face that then jumps. Its file name
 * is hashed by the build, so it is looked up here.
 */
const assets = await readdir(new URL('assets/', dist))
const headingFont = assets.find((f) => /^shippori-mincho-latin-500-normal-.+\.woff2$/.test(f))
function preloadHeadingFont(html) {
  if (!headingFont) {
    console.warn('[prerender] heading font not found in dist/assets: not preloaded.')
    return html
  }
  const link = `<link rel="preload" as="font" type="font/woff2" href="/assets/${headingFont}" crossorigin />`
  const parts = html.split('</head>')
  if (parts.length !== 2) throw new Error('[prerender] expected one </head>')
  return `${parts[0]}  ${link}\n  </head>${parts[1]}`
}

await page('index.html', (html) =>
  preloadHeadingFont(fill(html, '<div id="root"></div>', renderHome()))
)
await page('projects.html', (html) =>
  Object.entries(renderProjects()).reduce((out, [empty, content]) => fill(out, empty, content), html)
)

// Search engines: the pages there are, when they last changed (every deploy
// rebuilds them), and where to find that list.
if (site) {
  const paths = ['/', '/projects.html']
  const built = new Date().toISOString().slice(0, 10)
  await writeFile(
    new URL('sitemap.xml', dist),
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
      paths.map((p) => `  <url><loc>${site}${p}</loc><lastmod>${built}</lastmod></url>`).join('\n') +
      `\n</urlset>\n`
  )
  const robots = new URL('robots.txt', dist)
  await writeFile(robots, `${(await readFile(robots, 'utf8')).trimEnd()}\n\nSitemap: ${site}/sitemap.xml\n`)
  console.log('[prerender] sitemap.xml written, robots.txt points at it')
}

await rm(ssr, { recursive: true, force: true })
console.log(`[prerender] done${site ? ` (${site})` : ''}`)
