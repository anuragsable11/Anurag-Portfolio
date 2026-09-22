import * as THREE from 'three'

/** Reads a CSS custom property and returns it as a THREE.Color. */
export function cssColor(name, fallback) {
  if (typeof document === 'undefined') return new THREE.Color(fallback)
  const raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  try {
    return new THREE.Color(raw || fallback)
  } catch {
    return new THREE.Color(fallback)
  }
}

/**
 * Pauses a render loop while its canvas is off screen.
 *
 * With several WebGL scenes on one page, letting them all animate at once
 * burns CPU for nothing. `gate.visible` is false whenever the element is out
 * of view, and `onEnter` fires when it comes back so the loop can restart.
 */
export function createVisibilityGate(element, onEnter) {
  const gate = { visible: false }

  const observer = new IntersectionObserver(
    (entries) => {
      const nowVisible = entries.some((e) => e.isIntersecting)
      const wasVisible = gate.visible
      gate.visible = nowVisible
      if (nowVisible && !wasVisible) onEnter?.()
    },
    { rootMargin: '120px' }
  )
  observer.observe(element)

  gate.dispose = () => observer.disconnect()
  return gate
}

/** Standard three-point lighting used by every scene here. */
export function addLights(scene) {
  const ambient = new THREE.AmbientLight(0xffffff, 1.15)
  const key = new THREE.DirectionalLight(0xffffff, 1.5)
  key.position.set(3, 4, 5)
  const rim = new THREE.DirectionalLight(0xffffff, 0.65)
  rim.position.set(-4, -2, -3)
  scene.add(ambient, key, rim)
  return { ambient, key, rim }
}

/** Creates a renderer sized to `mount`, or null when WebGL is unavailable. */
export function createRenderer(mount) {
  let renderer
  try {
    renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true })
  } catch {
    return null
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.setSize(mount.clientWidth, mount.clientHeight)
  renderer.outputColorSpace = THREE.SRGBColorSpace
  mount.appendChild(renderer.domElement)
  return renderer
}

/**
 * Rasterises an inline <svg> element into a texture, drawn on a tile of
 * `background`. Used to put the tech logos onto 3D geometry.
 */
export function svgToTexture(svgEl, { size = 256, background, padding = 0.24 } = {}) {
  return new Promise((resolve) => {
    const clone = svgEl.cloneNode(true)
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
    clone.setAttribute('width', String(size))
    clone.setAttribute('height', String(size))

    // react-icons paths use fill="currentColor", which only resolves from an
    // inherited `color`, so it has to be set inline before serialising.
    const resolved = getComputedStyle(svgEl).color
    clone.style.color = resolved

    const markup = new XMLSerializer().serializeToString(clone)
    const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(markup)}`

    const canvas = document.createElement('canvas')
    canvas.width = size
    canvas.height = size
    const ctx = canvas.getContext('2d')

    const finish = () => {
      const texture = new THREE.CanvasTexture(canvas)
      texture.colorSpace = THREE.SRGBColorSpace
      texture.anisotropy = 4
      resolve(texture)
    }

    const image = new Image()
    image.onload = () => {
      ctx.fillStyle = background
      ctx.fillRect(0, 0, size, size)
      const inset = size * padding
      ctx.drawImage(image, inset, inset, size - inset * 2, size - inset * 2)
      finish()
    }
    image.onerror = () => {
      // Still give back a blank tile rather than leaving a hole in the scene.
      ctx.fillStyle = background
      ctx.fillRect(0, 0, size, size)
      finish()
    }
    image.src = url
  })
}
