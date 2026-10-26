/**
 * The projects page's words as HTML: the title, the menu, the flat grid and
 * a plain index of every project. The build writes them into projects.html
 * (see prerender.js), so the page reads without JavaScript; main.js writes
 * the same markup at runtime, so development needs no build step.
 */
import { navLinks, profile, projects, projectsHead } from '../data/content.js'

const esc = (value) =>
  String(value).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)

/** The projects on the page: those with a landing page to show. */
export const list = projects.filter((p) => p.showcase)

/** A project's Live and Code links. */
export function projectLinks(p) {
  const out = []
  if (p.links?.live)
    out.push({ href: p.links.live, text: 'Live ↗', label: `${p.name} live demo (opens in a new tab)` })
  if (p.links?.github)
    out.push({
      href: p.links.github,
      text: 'Code ↗',
      label: `${p.name} source code on GitHub (opens in a new tab)`,
    })
  return out
}

const external = ({ href, text, label }) =>
  `<a href="${esc(href)}" target="_blank" rel="noopener noreferrer"${
    label ? ` aria-label="${esc(label)}"` : ''
  }>${esc(text)}</a>`

/** The title, a span per word so each can rise in on its own. */
export function headlineHTML() {
  return `${projectsHead.title} ${projectsHead.highlight}`
    .split(/\s+/)
    .map((word, i) => `<span style="--i: ${i}">${esc(word)}</span>`)
    .join(' ')
}

const label = (id) => navLinks.find((l) => l.id === id)?.label ?? id

export function menuHTML() {
  return [
    `<a href="#grid" data-grid>${esc(`All ${projectsHead.eyebrow.toLowerCase()}`)}</a>`,
    `<a href="/">${esc(label('home'))}</a>`,
    external({ href: profile.github, text: 'GitHub' }),
    `<a href="/#contact">${esc(label('contact'))}</a>`,
  ].join('')
}

/** Where to find me, under the menu: the address, then every way to reach me. */
export function addressHTML() {
  return [
    esc(profile.location),
    '<br>',
    `<a href="mailto:${esc(profile.email)}">${esc(profile.email)}</a>`,
    ' · ',
    external({ href: profile.linkedin, text: 'LinkedIn' }),
    ' · ',
    external({ href: profile.resume, text: 'Resume' }),
  ].join('')
}

/** The flat grid: each project once, as a button that opens it. */
export function gridHTML() {
  return list
    .map(
      (p, pi) =>
        `<figure tabindex="0" role="button" aria-label="${esc(
          `${p.name}, ${p.subtitle}. Open details`
        )}" data-p="${pi}">` +
        `<div class="thumb"><img src="${esc(p.showcase.imageSmall)}" alt="${esc(
          p.showcase.alt
        )}" loading="lazy" decoding="async"></div>` +
        `<figcaption><b>${esc(p.name)}</b><span>${esc(`${p.category} · ${p.year}`)}</span></figcaption>` +
        '</figure>'
    )
    .join('')
}

/**
 * Every project as plain text: what the lightbox shows, with its links.
 * Visually hidden while the sphere runs (screen readers and crawlers read
 * it); the whole page when JavaScript does not run.
 */
export function indexHTML() {
  return list
    .map((p) => {
      const links = projectLinks(p).map(external).join(' ')
      return (
        '<article>' +
        `<h2>${esc(p.name)}</h2>` +
        `<p class="where">${esc(`${p.subtitle} · ${p.year}`)}</p>` +
        `<p class="note">${esc(p.summary)}</p>` +
        `<p class="stack">${esc(p.stack.join(' · '))}</p>` +
        (links ? `<p class="links">${links}</p>` : '') +
        '</article>'
      )
    })
    .join('')
}
