import { useEffect } from 'react'
import Background from './components/Background.jsx'
import Navbar from './components/Navbar.jsx'
import Hero from './components/Hero.jsx'
import About from './components/About.jsx'
import Skills from './components/Skills.jsx'
import Projects from './components/Projects.jsx'
import Journey from './components/Journey.jsx'
import Contact from './components/Contact.jsx'
import Footer from './components/Footer.jsx'
import { navLinks } from './data/content.js'
import { startCompanion } from './lib/companion.js'

const sectionIds = navLinks.map((l) => l.id)

export default function App() {
  // The samurai's senses: which section is in view, skills being looked at,
  // and one hidden key. Runs even when the 3D samurai itself does not.
  useEffect(() => startCompanion(sectionIds), [])

  return (
    <>
      <Background />
      <Navbar />
      <main>
        <Hero />
        <About />
        <Skills />
        <Projects />
        <Journey />
        <Contact />
      </main>
      <Footer />
    </>
  )
}
