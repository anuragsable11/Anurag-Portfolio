import { Suspense, useEffect } from 'react'
import Background from './components/Background.jsx'
import Navbar from './components/Navbar.jsx'
import Hero from './components/Hero.jsx'
import About from './components/About.jsx'
import Skills from './components/Skills.jsx'
import Projects from './components/Projects.jsx'
import Contact from './components/Contact.jsx'
import Footer from './components/Footer.jsx'
import { navLinks } from './data/content.js'
import { startCompanion } from './lib/companion.js'
import { startSmoothScroll } from './lib/smooth-scroll.js'

const sectionIds = navLinks.map((l) => l.id)

export default function App() {
  // The samurai's senses: which section is in view, skills being looked at,
  // and one hidden key. Runs even when the 3D samurai itself does not.
  useEffect(() => startCompanion(sectionIds), [])

  // Wheel and trackpad scrolling glide (see lib/smooth-scroll.js).
  useEffect(() => startSmoothScroll(), [])

  return (
    <>
      <Background />
      <Navbar />
      <main>
        <Hero />
        {/* Each section below the hero is its own Suspense boundary, so React
            hydrates the prerendered page a section at a time instead of in
            one long task (nothing here suspends). */}
        <Suspense>
          <About />
        </Suspense>
        <Suspense>
          <Skills />
        </Suspense>
        <Suspense>
          <Projects />
        </Suspense>
        <Suspense>
          <Contact />
        </Suspense>
      </main>
      <Footer />
    </>
  )
}
