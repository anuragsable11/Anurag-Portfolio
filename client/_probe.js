// TEMPORARY motion probe (deleted after the fix). Steps the real controller
// at 60 fps through every move and measures what an animator would flag:
// the blade or an arm through the armour, feet off or through the floor,
// sliding feet, joints that pop, and — new — any part of the head inside the
// trunk's armour (the fix under test).
import * as THREE from 'three'
import { createSamuraiModel } from '/src/components/Samurai3D/SamuraiModel.js'
import { createAnimationController } from '/src/components/Samurai3D/SamuraiAnimationController.js'
import { GRIP_SPAN } from '/src/components/Samurai3D/constants.js'
import { REST } from '/src/components/Samurai3D/poses.js'

const log = (...a) => (document.getElementById('out').textContent += a.join(' ') + '\n')
const model = createSamuraiModel({ maxAnisotropy: 1, integrated: true, breathe: async () => {} })
const rig = await model.build()
const root = rig.root
const scene = new THREE.Scene()
scene.add(root)

const all = []
root.traverse((o) => all.push(o))
const rest = all.map((o) => ({ o, p: o.position.clone(), q: o.quaternion.clone(), s: o.scale.clone() }))
const reset = () => rest.forEach(({ o, p, q, s }) => (o.position.copy(p), o.quaternion.copy(q), o.scale.copy(s)))

const sub = (o) => {
  const s = new Set()
  o.traverse((c) => c.isMesh && s.add(c))
  return s
}
const meshes = []
root.traverse((o) => {
  if (!o.isMesh || !o.visible) return
  const m = [].concat(o.material)[0]
  if (m.blending === THREE.AdditiveBlending || m.transparent || o.isSprite) return
  ;[].concat(o.material).forEach((mm) => (mm.side = THREE.DoubleSide))
  meshes.push(o)
})
const katanaSet = sub(rig.katana)
const armSets = rig.arms.map((a) => sub(a.shoulder))
const legSets = rig.legs.map((l) => sub(l.hip))
const headSet = sub(rig.headRig)
const sayaSet = sub(rig.saya)
const owner = (mesh) => {
  let o = mesh
  while (o && o !== root) {
    if (o.name) return o.name
    o = o.parent
  }
  return 'root'
}
const ray = new THREE.Raycaster()
const A = new THREE.Vector3()
const B = new THREE.Vector3()
const D = new THREE.Vector3()
let lastHitPoints = []
function hits(a, b, exclude) {
  D.subVectors(b, a)
  const len = D.length()
  ray.set(a, D.normalize())
  ray.far = len
  const list = meshes.filter((m) => !exclude.some((s) => s.has(m)))
  const found = ray.intersectObjects(list, false)
  lastHitPoints = found.map((h) => h.point.toArray().map((x) => +x.toFixed(2)))
  return found.map((h) => owner(h.object))
}

/* ---- Head vs trunk: ray parity from the head's lowest points ---- */
// The trunk the head must stay out of: everything on the body except the
// head itself, the katana and the scabbards; the sode come along (the
// turned-back wings beside the face hang over them). Open tubes (cords)
// are left out: parity needs closed shapes.
const trunk = meshes.filter((m) => {
  if (headSet.has(m) || katanaSet.has(m) || sayaSet.has(m)) return false
  if (legSets.some((s) => s.has(m))) return false
  const name = [].concat(m.material)[0].name
  if (name === 'rope' || name === 'helmetLacing') return false
  if (armSets.some((s) => s.has(m)) && !rig.arms.some((a) => sub(a.sode).has(m))) return false
  return true
})
let trunkTris = 0
for (const m of trunk) trunkTris += (m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count) / 3
// Head sample points: for each head mesh except the skull itself and the
// eyes, the vertices in the lowest fifth of its own height, thinned.
const headParts = []
for (const m of headSet) {
  if (!meshes.includes(m)) continue
  if (m.geometry.type === 'SphereGeometry') continue // the cranium
  const pos = m.geometry.attributes.position
  let lo = Infinity
  let hi = -Infinity
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i)
    lo = Math.min(lo, y)
    hi = Math.max(hi, y)
  }
  const cut = lo + (hi - lo) * 0.2
  const low = []
  for (let i = 0; i < pos.count; i++) if (pos.getY(i) <= cut) low.push(i)
  const step = Math.max(1, Math.floor(low.length / 40))
  const pts = []
  for (let k = 0; k < low.length; k += step) pts.push(new THREE.Vector3().fromBufferAttribute(pos, low[k]))
  headParts.push({ name: owner(m), mesh: m, pts })
}
const RAYS = [new THREE.Vector3(1, 0.11, 0.07).normalize(), new THREE.Vector3(-0.2, 0.09, -1).normalize()]
const P = new THREE.Vector3()
const bodyInv = new THREE.Matrix4()
function headOverlaps(rep, local) {
  bodyInv.copy(rig.body.matrixWorld).invert()
  for (const part of headParts) {
    for (const p of part.pts) {
      P.copy(p).applyMatrix4(part.mesh.matrixWorld)
      // Only points down near the trunk can be inside it.
      const yBody = P.clone().applyMatrix4(bodyInv).y
      if (yBody > 0.98) continue
      let inside = 0
      let into = null
      for (const d of RAYS) {
        ray.set(P, d)
        ray.far = 6
        const found = ray.intersectObjects(trunk, false)
        if (found.length % 2 === 1) {
          inside++
          into = found[0]
        }
      }
      if (inside === 2) {
        const key = `${part.name}→${owner(into.object)}`
        rep.headHits[key] = (rep.headHits[key] || 0) + 1
        rep.headAt ??= {}
        rep.headAt[key] ??= [+local.toFixed(2), ...P.toArray().map((x) => +x.toFixed(2))]
      }
    }
  }
}

// Lowest point of each boot (ankle subtree), and of each knee (knee subtree minus ankle).
const vertsOf = (set) => {
  const out = []
  for (const m of set) {
    const pos = m.geometry.attributes.position
    const step = Math.max(1, Math.floor(pos.count / 400))
    for (let i = 0; i < pos.count; i += step) out.push([m, new THREE.Vector3().fromBufferAttribute(pos, i)])
  }
  return out
}
const bootVerts = rig.legs.map((l) => vertsOf(sub(l.ankle)))
const kneeVerts = rig.legs.map((l) => {
  const s = sub(l.knee)
  for (const m of sub(l.ankle)) s.delete(m)
  return vertsOf(s)
})
const W = new THREE.Vector3()
const lowest = (verts) => {
  let y = Infinity
  let at = null
  for (const [m, v] of verts) {
    W.copy(v).applyMatrix4(m.matrixWorld)
    if (W.y < y) {
      y = W.y
      at = W.clone()
    }
  }
  return at
}

const named = (n) => root.getObjectByName(n)
const base = named('katana_base')
const tip = named('katana_tip')
const freeHand = rig.arms[0].hand
const grip = new THREE.Object3D()
grip.position.set(0, -GRIP_SPAN, 0)
rig.katana.add(grip)
const neutralWrist = REST.grip

const cursor = { x: 0, y: 0, active: false, at: -10 }
function makeController(calm) {
  const clock = { now: 0 }
  const camera = new THREE.PerspectiveCamera(31, 1.3, 0.1, 100)
  camera.position.set(-1.4, 2.6, 8.8)
  camera.lookAt(0, 2.04, 0)
  camera.updateMatrixWorld()
  const cues = []
  cursor.active = false
  const controller = createAnimationController({
    model,
    camera,
    controls: { target: new THREE.Vector3(0, 2.04, 0) },
    canvas: document.body,
    cursor,
    orbit: { interacting: false },
    clock,
    wake() {},
    onCue: (c) => cues.push([clock.now, c]),
    onState() {},
  })
  controller.attach(rig)
  controller.markStarted()
  if (calm) controller.setCalm(true)
  return { controller, clock, cues }
}
/** Puts the cursor at a fraction of the viewport from its centre (±0.5 = edges). */
const lookAt = (fx, fy) => {
  cursor.active = true
  cursor.x = innerWidth * (0.5 + fx)
  cursor.y = innerHeight * (0.5 + fy)
}

const TRACK = ['body', 'head', 'shoulder_L', 'shoulder_R', 'elbow_L', 'elbow_R', 'katana', 'hip_L', 'hip_R', 'knee_L', 'knee_R', 'samurai', 'sode_L', 'sode_R', 'kusazuri_0', 'kusazuri_3', 'yodarekake']

function run(name, seconds, script, { calm = false, warm = 3 } = {}) {
  reset()
  const { controller, clock, cues } = makeController(calm)
  const dt = 1 / 60
  let t = 0
  const step = () => {
    t += dt
    clock.now = t
    cursor.at = t
    controller.update(dt, t)
    root.updateMatrixWorld(true)
  }
  for (let i = 0; i < warm * 60; i++) step()
  const t0 = t
  const rep = {
    name,
    bladeHits: {},
    armHits: {},
    legHits: {},
    headHits: {},
    floorBlade: 0,
    minFoot: [9, 9],
    maxFootLift: [0, 0],
    slide: [0, 0],
    minKnee: [9, 9],
    wrist: 0,
    wristAt: 0,
    headPitch: [9, -9],
    headYaw: 0,
    pops: [],
    speedStops: 0,
  }
  const prevQ = new Map()
  const prevW = new Map()
  const tipPrev = new THREE.Vector3()
  const speeds = []
  const footPrev = [null, null]
  const headRig = named('head')
  for (let f = 0; f < seconds * 60; f++) {
    script(controller, t - t0, f)
    step()
    const local = t - t0
    for (const n of TRACK) {
      const o = named(n)
      if (!o) continue
      const q = o.quaternion
      const pq = prevQ.get(n)
      if (pq) {
        const d = pq.clone().invert().multiply(q)
        const ang = 2 * Math.acos(Math.min(1, Math.abs(d.w)))
        const w = ang / dt
        const pw = prevW.get(n)
        if (pw !== undefined) {
          const acc = Math.abs(w - pw) / dt
          if (acc > 400) rep.pops.push(`${n}@${local.toFixed(2)}s ${acc.toFixed(0)}rad/s²`)
        }
        prevW.set(n, w)
      }
      prevQ.set(n, q.clone())
    }
    rep.headPitch[0] = Math.min(rep.headPitch[0], headRig.rotation.x)
    rep.headPitch[1] = Math.max(rep.headPitch[1], headRig.rotation.x)
    rep.headYaw = Math.max(rep.headYaw, Math.abs(headRig.rotation.y))
    tip.getWorldPosition(B)
    if (f > 0) speeds.push(B.distanceTo(tipPrev) / dt)
    tipPrev.copy(B)
    if (f % 3 === 0) headOverlaps(rep, local)
    if (f % 2) continue
    base.getWorldPosition(A)
    tip.getWorldPosition(B)
    if (B.y < 0.02 || A.y < 0.02) {
      rep.floorBlade++
      rep.floorAt ??= [+local.toFixed(2), +A.y.toFixed(3), +B.y.toFixed(3)]
    }
    for (const h of new Set(hits(A, B, [katanaSet]))) {
      rep.bladeHits[h] = (rep.bladeHits[h] || 0) + 1
      rep.bladeAt ??= {}
      rep.bladeAt[h] ??= +local.toFixed(2)
    }
    rig.arms.forEach((arm, i) => {
      const E = arm.elbow.getWorldPosition(new THREE.Vector3())
      const S = arm.shoulder.getWorldPosition(new THREE.Vector3()).lerp(E, 0.25)
      const H = (i === 1 ? rig.katana : arm.hand || arm.elbow).getWorldPosition(new THREE.Vector3())
      const h1 = hits(S, E, [armSets[i], katanaSet])
      const p1 = lastHitPoints
      const h2 = hits(E, H, [armSets[i], katanaSet])
      const p2 = lastHitPoints
      const seen = new Set()
      for (const [h, pt, seg] of [...h1.map((h, j) => [h, p1[j], 'upper']), ...h2.map((h, j) => [h, p2[j], 'fore'])]) {
        const k = `${i ? 'katanaArm' : 'freeArm'}→${h}`
        if (seen.has(k)) continue
        seen.add(k)
        rep.armHits[k] = (rep.armHits[k] || 0) + 1
        rep.armPt ??= {}
        rep.armPt[k] ??= [seg, +local.toFixed(2), ...pt]
      }
    })
    rig.legs.forEach((leg, i) => {
      const K = leg.knee.getWorldPosition(new THREE.Vector3())
      const Hp = leg.hip.getWorldPosition(new THREE.Vector3()).lerp(K, 0.35)
      const An = leg.ankle.getWorldPosition(new THREE.Vector3())
      for (const h of new Set([...hits(Hp, K, [legSets[i]]), ...hits(K, An, [legSets[i]])])) {
        const k = `leg${i}→${h}`
        rep.legHits[k] = (rep.legHits[k] || 0) + 1
      }
      const low = lowest(bootVerts[i])
      rep.minFoot[i] = Math.min(rep.minFoot[i], low.y)
      rep.maxFootLift[i] = Math.max(rep.maxFootLift[i], low.y)
      if (footPrev[i] && low.y < 0.006 && footPrev[i].y < 0.006) rep.slide[i] += Math.hypot(low.x - footPrev[i].x, low.z - footPrev[i].z)
      footPrev[i] = low
      rep.minKnee[i] = Math.min(rep.minKnee[i], lowest(kneeVerts[i]).y)
    })
    const dev = 2 * Math.acos(Math.min(1, Math.abs(neutralWrist.dot(rig.katana.quaternion)))) * 57.3
    if (dev > rep.wrist) {
      rep.wrist = dev
      rep.wristAt = local
    }
    const W1 = grip.getWorldPosition(new THREE.Vector3())
    const W2 = (freeHand || rig.arms[0].elbow).getWorldPosition(new THREE.Vector3())
    rep.gripMin = Math.min(rep.gripMin ?? 9, W1.distanceTo(W2))
  }
  const peak = Math.max(...speeds)
  for (let i = 2; i < speeds.length - 2; i++) {
    if (speeds[i] < speeds[i - 1] && speeds[i] <= speeds[i + 1] && speeds[i] < 0.15 * peak && speeds[i - 2] > 0.3 * peak) rep.speedStops++
  }
  rep.peakTipSpeed = +peak.toFixed(2)
  rep.cues = cues.map(([c, n]) => n)
  return rep
}

const fmt = (r) => {
  const o = { ...r }
  o.minFoot = o.minFoot.map((v) => +v.toFixed(3))
  o.maxFootLift = o.maxFootLift.map((v) => +v.toFixed(3))
  o.slide = o.slide.map((v) => +v.toFixed(3))
  o.minKnee = o.minKnee.map((v) => +v.toFixed(3))
  o.wrist = +o.wrist.toFixed(0)
  o.wristAt = +o.wristAt.toFixed(2)
  o.gripMin = +(o.gripMin ?? 0).toFixed(3)
  o.headPitch = o.headPitch.map((v) => +v.toFixed(2))
  o.headYaw = +o.headYaw.toFixed(2)
  o.popCount = o.pops.length
  o.pops = o.pops.slice(0, 4)
  return JSON.stringify(o)
}

log(`trunk meshes for the head test: ${trunk.length}, ${Math.round(trunkTris)} triangles; head sample points: ${headParts.reduce((n, p) => n + p.pts.length, 0)} in ${headParts.map((p) => p.name).join(',')}`)
const results = []
const once = (name, fn) => (c, t, f) => f === 0 && fn(c)
results.push(run('idle', 20, () => {}))
for (const a of ['slash', 'draw', 'bow', 'nod', 'spin', 'leap', 'thrust', 'salute', 'hop', 'cinematic']) {
  results.push(run(a, 4.5, once(a, (c) => c.playAction(a))))
}
for (const m of ['attentive', 'thinking', 'focused', 'battle', 'victory']) {
  results.push(run(`mood:${m}`, 5, (c, t, f) => (f === 0 ? c.setMood(m) : f === 180 ? c.setMood('calm') : null)))
}
for (const m of ['focused', 'battle', 'victory', 'thinking']) {
  results.push(run(`cinematic@${m}`, 5, (c, t, f) => (f === 0 ? c.setMood(m) : f === 90 ? c.playAction('cinematic') : null)))
}
results.push(run('meditate', 12, (c, t, f) => (f === 0 || f === 360) && c.toggleMeditation()))
results.push(run('interrupt slash→spin', 4, (c, t, f) => (f === 0 ? c.playAction('slash') : f === 24 ? c.playAction('spin') : null)))
results.push(run('gentle cinematic', 5, once('g', (c) => c.playAction('cinematic')), { calm: true }))
results.push(run('hover', 6, (c, t, f) => c.setHover(f > 30 && f < 240)))
// The cursor at the four corners and far below / above: the head's limits.
results.push(
  run('look corners', 10, (c, t, f) => {
    const k = Math.floor(f / 100)
    const at = [
      [-0.5, -0.5],
      [0.5, -0.5],
      [0.5, 0.5],
      [-0.5, 0.5],
      [0, 0.9],
      [0, -0.9],
    ][k] || [0, 0]
    lookAt(at[0], at[1])
  })
)
results.push(run('look down + bow', 5, (c, t, f) => (lookAt(0, 0.9), f === 60 && c.playAction('bow'))))
results.push(run('look side + nod', 5, (c, t, f) => (lookAt(-0.5, 0.3), f === 60 && c.playAction('nod'))))
for (const r of results) log(fmt(r))
window.__probe = results.map(fmt)
