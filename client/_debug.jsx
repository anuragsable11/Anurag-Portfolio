// Throwaway harness: renders the samurai alone, large, with the camera held
// still so it can be screenshotted from a chosen angle. Not part of the site.
//   ?theme=light|dark  ?yaw=<deg>  ?pitch=<deg>  ?dist=<units>  ?aim=<y>
//   ?tone=aces|neutral|agx  ?exposure=<n>  ?mood=<name>  ?act=<name>&actAt=<ms>
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { createRoot } from 'react-dom/client'
import '/src/index.css'

Object.defineProperty(OrbitControls.prototype, 'autoRotate', {
  get: () => false,
  set() {},
  configurable: true,
})
const params = new URLSearchParams(location.search)
// ?slow=<k> runs the samurai's clock k times slower, to catch actions mid-motion.
if (params.get('slow')) {
  const k = +params.get('slow')
  const real = performance.now.bind(performance)
  const start = real()
  performance.now = () => start + (real() - start) / k
}
if (params.get('theme')) document.documentElement.dataset.theme = params.get('theme')

// Force a tone mapping operator / exposure from the URL, for comparisons.
const tones = {
  aces: THREE.ACESFilmicToneMapping,
  neutral: THREE.NeutralToneMapping,
  agx: THREE.AgXToneMapping,
}
if (params.get('tone') && tones[params.get('tone')] !== undefined) {
  const forced = tones[params.get('tone')]
  Object.defineProperty(THREE.WebGLRenderer.prototype, 'toneMapping', {
    get: () => forced,
    set() {},
    configurable: true,
  })
}
if (params.get('exposure')) {
  const forced = +params.get('exposure')
  Object.defineProperty(THREE.WebGLRenderer.prototype, 'toneMappingExposure', {
    get: () => forced,
    set() {},
    configurable: true,
  })
}

// Expose the renderer's draw-call / triangle counters for the probe script.
// WebGLRenderer assigns its own  in the constructor, so an accessor
// on the prototype sees the assignment.
Object.defineProperty(THREE.WebGLRenderer.prototype, 'info', {
  get() {
    return this.__info
  },
  set(v) {
    this.__info = v
    window.__info = v
  },
  configurable: true,
})

// Pose the camera once from the URL: yaw around the target, pitch above the
// horizon, distance from the target.
const yaw = ((+params.get('yaw') || 0) * Math.PI) / 180
const pitch = ((+(params.get('pitch') ?? 8)) * Math.PI) / 180
const dist = +params.get('dist') || 8.8
const aim = params.get('aim')
const origUpdate = OrbitControls.prototype.update
OrbitControls.prototype.update = function (...args) {
  if (!this.__posed) {
    this.__posed = true
    if (aim !== null) this.target.y = +aim
    const t = this.target
    this.object.position.set(
      t.x + Math.sin(yaw) * Math.cos(pitch) * dist,
      t.y + Math.sin(pitch) * dist,
      t.z + Math.cos(yaw) * Math.cos(pitch) * dist
    )
    window.__controls = this
  }
  return origUpdate.apply(this, args)
}
const { default: Samurai3D } = await import('/src/components/Samurai3D.jsx')

// ?mood=<name> puts him in a mood; ?act=<name>&actAt=<ms> plays an action
// that long after he first appears.
const { act, setMood } = await import('/src/lib/companion.js')
if (params.get('mood')) setMood(params.get('mood'), 0)
const whenReady = (fn, delay) => {
  const poll = () =>
    document.querySelector('.samurai3d.is-ready') ? setTimeout(fn, delay) : requestAnimationFrame(poll)
  poll()
}
if (params.get('act')) whenReady(() => act(params.get('act')), +(params.get('actAt') || 0))
createRoot(document.getElementById('root')).render(<Samurai3D />)
