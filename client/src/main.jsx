import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
// Served with the site: no render-blocking request to another origin.
// Montserrat sets the page, heavy for headings; Geist Mono sets the small
// technical labels (chips, the project view's details, the samurai's tooltip).
import '@fontsource-variable/montserrat'
// Shippori Mincho for the headings: its Latin letters only (the few kanji
// use the system's Mincho), two weights.
import '@fontsource/shippori-mincho/latin-500.css'
import '@fontsource/shippori-mincho/latin-700.css'
import '@fontsource-variable/geist-mono'
import 'lenis/dist/lenis.css'
import './index.css'

const root = document.getElementById('root')
const app = (
  <React.StrictMode>
    <App />
  </React.StrictMode>
)

// The build prerenders the page into #root (see prerender.js), so React
// takes over that HTML; in development the root starts empty.
if (root.hasChildNodes()) ReactDOM.hydrateRoot(root, app)
else ReactDOM.createRoot(root).render(app)
