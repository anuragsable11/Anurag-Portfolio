// TEMPORARY contact-sheet renderer (deleted after the fix): the real model,
// lights and textures, stepped at 60 fps through a move, tiled into one image.
//   ?act=<action|idle|meditate|hover|mood:<m>|cine@<mood>|look:<yaw>,<pitch>>
//   ?n=12  ?span=<s>  ?from=<s>  ?yaw=<deg>  ?pitch=<deg>  ?dist=<u>  ?aim=<y>
//   ?w=360  ?h=480  ?cols=6  ?theme=dark  ?calm=1
import * as THREE from 'three'
import '/src/index.css'
import { createSamuraiModel } from '/src/components/Samurai3D/SamuraiModel.js'
import { createAnimationController } from '/src/components/Samurai3D/SamuraiAnimationController.js'
import { createStage } from '/src/components/Samurai3D/SamuraiScene.js'
import { ACTIONS } from '/src/components/Samurai3D/poses.js'
import { TRANSITION } from '/src/components/Samurai3D/constants.js'
import { TEXTURE_QUALITY, requestTextures } from '/src/lib/samurai-preload.js'
import { renderStudioPMREM } from '/src/lib/studio-env.js'

const params = new URLSearchParams(location.search)
const get = (k, d) => (params.has(k) ? params.get(k) : d)
document.documentElement.dataset.theme = get('theme', 'dark')
const act = get('act', 'cinematic')
const n = +get('n', 12)
const from = +get('from', 0)
const W = +get('w', 360)
const H = +get('h', 480)
const cols = +get('cols', 6)
const yawDeg = +get('yaw', 0)
const pitchDeg = get('pitch', null)
const dist = get('dist', null)
const aim = get('aim', null)
const calm = get('calm', '0') === '1'

const mount = document.getElementById('stage')
mount.style.width = W + 'px'
mount.style.height = H + 'px'
const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, preserveDrawingBuffer: true })
renderer.setPixelRatio(1)
renderer.setSize(W, H)
renderer.outputColorSpace = THREE.SRGBColorSpace
renderer.toneMapping = THREE.NeutralToneMapping
renderer.toneMappingExposure = 1
renderer.shadowMap.enabled = true
renderer.shadowMap.type = THREE.PCFShadowMap
mount.appendChild(renderer.domElement)

const stage = createStage({ renderer, mount, bigShadows: false })
const { scene, camera, controls } = stage
const model = createSamuraiModel({ maxAnisotropy: renderer.capabilities.getMaxAnisotropy(), integrated: false, breathe: async () => {}, renderer })
const rig = await model.build()
scene.add(rig.root)
model.fillTextures(await requestTextures(TEXTURE_QUALITY))
model.applyTheme()
stage.applyTheme()
scene.environment = renderStudioPMREM(renderer).texture

const target = controls.target.clone()
if (aim !== null) target.y = +aim
const off = camera.position.clone().sub(controls.target)
const sph = new THREE.Spherical().setFromVector3(off)
sph.theta += (yawDeg * Math.PI) / 180
if (pitchDeg !== null) sph.phi = Math.PI / 2 - (+pitchDeg * Math.PI) / 180
if (dist !== null) sph.radius = +dist
camera.position.copy(target).add(off.setFromSpherical(sph))
camera.lookAt(target)
camera.aspect = W / H
camera.updateProjectionMatrix()

// The cursor, for look:<yaw>,<pitch> — placed so he turns his head that far.
const cursor = { x: 0, y: 0, active: false, at: -10 }
const clock = { now: 0 }
const controller = createAnimationController({
  model,
  camera,
  controls: { target },
  canvas: renderer.domElement,
  cursor,
  orbit: { interacting: false },
  clock,
  wake() {},
  onCue() {},
  onState() {},
})
controller.attach(rig)
controller.markStarted()
if (calm) controller.setCalm(true)

const dt = 1 / 60
let t = 0
const step = () => {
  t += dt
  clock.now = t
  cursor.at = t
  controller.update(dt, t)
}
for (let i = 0; i < 180; i++) step()

let span = +get('span', 0)
const [kind, arg] = act.split(/[:@]/)
if (kind === 'meditate') {
  controller.toggleMeditation()
  span ||= TRANSITION + 1
} else if (kind === 'mood') {
  controller.setMood(arg)
  span ||= 3
} else if (kind === 'hover') {
  controller.setHover(true)
  span ||= 3
} else if (kind === 'look') {
  // A cursor far to the side / above or below of the canvas.
  const [cx, cy] = arg.split(',').map(Number)
  const rect = renderer.domElement.getBoundingClientRect()
  cursor.active = true
  cursor.x = rect.left + rect.width * (0.5 + cx)
  cursor.y = rect.top + rect.height * (0.5 + cy)
  span ||= 2
} else if (kind === 'cine') {
  controller.setMood(arg)
  for (let i = 0; i < 90; i++) step()
  controller.playAction('cinematic')
  span ||= ACTIONS.cinematic.duration + 0.5
} else if (kind === 'idle') {
  span ||= 8
} else {
  if (!controller.playAction(kind)) throw new Error('unknown action ' + kind)
  span ||= ACTIONS[kind].duration + 0.5
}
const start = t

const rows = Math.ceil(n / cols)
const sheet = document.createElement('canvas')
sheet.width = Math.min(n, cols) * W
sheet.height = rows * H
const ctx = sheet.getContext('2d')
ctx.fillStyle = document.documentElement.dataset.theme === 'dark' ? '#0a0a0a' : '#ffffff'
ctx.fillRect(0, 0, sheet.width, sheet.height)
for (let k = 0; k < n; k++) {
  const tk = from + (n > 1 ? (span * k) / (n - 1) : 0)
  while (t - start < tk - 1e-6) step()
  renderer.render(scene, camera)
  const x = (k % cols) * W
  const y = Math.floor(k / cols) * H
  ctx.drawImage(renderer.domElement, x, y)
  ctx.fillStyle = '#ff40c0'
  ctx.font = 'bold 15px monospace'
  ctx.fillText(`${(t - start).toFixed(2)}s ${controller.state}`, x + 6, y + 18)
}
document.body.appendChild(sheet)
window.__sheet = sheet.toDataURL('image/png')
