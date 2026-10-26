/**
 * Build-time rendering, run by prerender.js after `vite build`: the
 * portfolio as HTML for the browser to hydrate, and the projects page's
 * words. Built with `vite build --ssr`, so images resolve to the same
 * hashed URLs as in the browser build.
 */
import { StrictMode } from 'react'
import { renderToString } from 'react-dom/server'
import App from './App.jsx'
import { profile, projectsHead } from './data/content.js'
import {
  addressHTML,
  gridHTML,
  headlineHTML,
  indexHTML,
  menuHTML,
} from './projects-page/markup.js'

export function renderHome() {
  return renderToString(
    <StrictMode>
      <App />
    </StrictMode>
  )
}

/** Each empty element in projects.html, and what goes inside it. */
export function renderProjects() {
  const esc = (s) => s.replace(/[&<>]/g, (c) => `&#${c.charCodeAt(0)};`)
  return {
    '<span class="inner"></span>': headlineHTML(),
    '<p id="bioText"></p>': esc(projectsHead.sub),
    '<div class="colophon chrome" id="colophon"></div>': esc(profile.role),
    '<nav aria-label="Menu" id="menuNav"></nav>': menuHTML(),
    '<p class="addr" id="menuAddr"></p>': addressHTML(),
    '<div class="rows"></div>': gridHTML(),
    '<section id="index" class="visually-hidden"></section>': indexHTML(),
  }
}
