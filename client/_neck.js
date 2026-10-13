// TEMPORARY: the trunk's outline round the neck, per height and angle, in
// body space (origin at the hips; +Z forward; the rig's own +X).
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
const skip = new Set([
  ...rig.arms.flatMap((a) => [...sub(a.shoulder)]),
  ...sub(rig.katana),
  ...sub(rig.saya),
  ...sub(rig.headRig),
  ...rig.legs.flatMap((l) => [...sub(l.hip)]),
])
const inv = new THREE.Matrix4().copy(rig.root.matrixWorld).invert()
const v = new THREE.Vector3()
const bands = [0.66, 0.7, 0.74, 0.78, 0.82, 0.86, 0.9, 0.94]
const BIN = 10
const out = {}
for (let b = 0; b < bands.length - 1; b++) out[bands[b]] = new Array(36).fill(0)
rig.root.traverse((m) => {
  if (!m.isMesh || skip.has(m)) return
  const pos = m.geometry.attributes.position
  const toRoot = inv.clone().multiply(m.matrixWorld)
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i).applyMatrix4(toRoot)
    const y = v.y - HIP_Y
    for (let b = 0; b < bands.length - 1; b++) {
      if (y < bands[b] || y >= bands[b + 1]) continue
      // angle from the front (+Z), toward +X
      let a = (Math.atan2(v.x, v.z) * 180) / Math.PI
      if (a < 0) a += 360
      const k = Math.floor(a / BIN) % 36
      out[bands[b]][k] = Math.max(out[bands[b]][k], Math.hypot(v.x, v.z))
    }
  }
})
// The skull and mask, as they hang now, for reference.
const head = {}
for (const [name, set] of [['head', sub(rig.headRig)]]) {
  let minY = 9
  for (const m of set) {
    const pos = m.geometry.attributes.position
    const toRoot = inv.clone().multiply(m.matrixWorld)
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(toRoot)
      minY = Math.min(minY, v.y - HIP_Y)
    }
  }
  head[name] = +minY.toFixed(3)
}
const rows = Object.entries(out).map(([y, arr]) => `${(+y).toFixed(2)} ` + arr.map((r) => (r ? r.toFixed(2) : ' -- ')).join(' '))
document.getElementById('out').textContent = rows.join('\n')
window.__neck = { rows, head }
