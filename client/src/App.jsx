import Background from './components/Background.jsx'
import Navbar from './components/Navbar.jsx'
import Hero from './components/Hero.jsx'
import About from './components/About.jsx'
import Skills from './components/Skills.jsx'
import Projects from './components/Projects.jsx'
import Journey from './components/Journey.jsx'
import Contact from './components/Contact.jsx'
import Footer from './components/Footer.jsx'

export default function App() {
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
