import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
// Served with the site: no render-blocking request to another origin.
import '@fontsource-variable/geist'
import '@fontsource-variable/geist-mono'
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
