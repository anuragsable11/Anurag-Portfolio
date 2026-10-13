// TEMPORARY: the built model's extents per height band, in body space
// (origin at the hips, +Z forward), for the blade's clearance hull — and the
// landmarks the probe's head/trunk proxies are calibrated from.
import * as THREE from 'three'
import { createSamuraiModel } from '/src/components/Samurai3D/SamuraiModel.js'
import { HIP_Y } from '/src/components/Samurai3D/constants.js'

const model = createSamuraiModel({ maxAnisotropy: 1, integrated: true, breathe: async () => {} })
const rig = await model.build()
rig.root.updateMatrixWorld(true)
const sub = (o) => {
  const s = new Set()
  o.traverse((c) => c.isMesh && s.add(c))
  return s
}
const exclude = new Set([...rig.arms.flatMap((a) => [...sub(a.shoulder)]), ...sub(rig.katana), ...sub(rig.saya)])
const toBody = new THREE.Matrix4().copy(rig.body.matrixWorld).invert()
const v = new THREE.Vector3()

const Y0 = -1.125
const STEP = 0.05
const N = 66
const hull = Array.from({ length: N }, () => [0, -9, 9])
const box = (set) => {
  const b = new THREE.Box3()
  for (const m of set) {
    const pos = m.geometry.attributes.position
    const mw = toBody.clone().multiply(m.matrixWorld)
    for (let i = 0; i < pos.count; i++) b.expandByPoint(v.fromBufferAttribute(pos, i).applyMatrix4(mw))
  }
  return { min: b.min.toArray().map((x) => +x.toFixed(3)), max: b.max.toArray().map((x) => +x.toFixed(3)) }
}
rig.root.traverse((m) => {
  if (!m.isMesh || exclude.has(m)) return
  const pos = m.geometry.attributes.position
  const mw = toBody.clone().multiply(m.matrixWorld)
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i).applyMatrix4(mw)
    const k = Math.floor((v.y - Y0) / STEP)
    if (k < 0 || k >= N) continue
    const b = hull[k]
    b[0] = Math.max(b[0], Math.abs(v.x))
    b[1] = Math.max(b[1], v.z)
    b[2] = Math.min(b[2], v.z)
  }
})
// Empty bands (none expected inside the figure) take their neighbours'.
for (let k = 0; k < N; k++) if (hull[k][1] === -9) hull[k] = [...(hull[k - 1] || hull[k + 1] || [0.1, 0.1, -0.1])]

const report = {
  y0: Y0,
  step: STEP,
  hull: hull.map(([x, zf, zb], k) => [+(Y0 + (k + 0.5) * STEP).toFixed(3), +x.toFixed(3), +zf.toFixed(3), +zb.toFixed(3)]),
  crest: box(sub(rig.crest)),
  helmet: box([...sub(rig.helmet)].filter((m) => !sub(rig.crest).has(m))),
  skullPos: rig.skull.getWorldPosition(new THREE.Vector3()).applyMatrix4(toBody).toArray().map((x) => +x.toFixed(3)),
  headRigPos: rig.headRig.getWorldPosition(new THREE.Vector3()).applyMatrix4(toBody).toArray().map((x) => +x.toFixed(3)),
  throatHinge: rig.throat ? rig.throat.getWorldPosition(new THREE.Vector3()).applyMatrix4(toBody).toArray().map((x) => +x.toFixed(3)) : null,
  throatBox: rig.throat ? box(sub(rig.throat)) : null,
  saya: box(sub(rig.saya)),
}
document.getElementById('out').textContent = JSON.stringify(report, null, 1)
window.__measure = report
