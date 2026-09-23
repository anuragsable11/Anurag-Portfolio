import * as THREE from 'three'
import { SVGLoader } from 'three/examples/jsm/loaders/SVGLoader.js'

/**
 * Turns an inline icon <svg> into solid 3D geometry.
 *
 * three.js has the pieces (SVGLoader, ExtrudeGeometry) but two gaps between
 * them lose the cut-outs of many logos: ShapePath.toShapes() decides holes by
 * even-odd nesting alone, and ExtrudeGeometry only fixes a hole's winding when
 * the outline around it is counter-clockwise. So the contours are classified
 * here with the path's real fill rule, the way a browser paints it, and every
 * winding is set explicitly before extruding.
 */

/** Drops repeated points, which leave zero-length edges for the triangulator. */
function cleanOutline(points) {
  const out = []
  for (const p of points) {
    const last = out[out.length - 1]
    if (!last || last.distanceToSquared(p) > 1e-12) out.push(p)
  }
  if (out.length > 2 && out[0].distanceToSquared(out[out.length - 1]) < 1e-12) out.pop()
  return out
}

/** Even-odd ray cast; exact for the simple, non-crossing contours of an icon. */
function pointInContour(p, contour) {
  let inside = false
  for (let i = 0, j = contour.length - 1; i < contour.length; j = i++) {
    const a = contour[i]
    const b = contour[j]
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) {
      inside = !inside
    }
  }
  return inside
}

/** Voted over three vertices, so one point grazing an edge cannot flip it. */
function contourInside(inner, outer) {
  const n = inner.length
  const votes = [0, Math.floor(n / 3), Math.floor((2 * n) / 3)].filter((k) =>
    pointInContour(inner[k], outer)
  ).length
  return votes >= 2
}

/** Sorts one path's contours into filled outlines, each with its holes. */
function contoursToShapes(contours, evenOdd) {
  const info = contours.map((points) => ({
    points,
    area: Math.abs(THREE.ShapeUtils.area(points)),
    sign: THREE.ShapeUtils.isClockWise(points) ? -1 : 1,
  }))
  const filled = (winding, depth) => (evenOdd ? depth % 2 === 1 : winding !== 0)

  const outers = []
  const holes = []
  info.forEach((c, i) => {
    let winding = 0
    let depth = 0
    info.forEach((d, j) => {
      if (i !== j && d.area > c.area && contourInside(c.points, d.points)) {
        winding += d.sign
        depth++
      }
    })
    const outside = filled(winding, depth)
    const inside = filled(winding + c.sign, depth + 1)
    if (!outside && inside) outers.push({ ...c, holes: [] })
    else if (outside && !inside) holes.push(c)
    // Otherwise the contour separates two equally filled regions: no edge.
  })

  // Each hole belongs to the smallest outline around it.
  for (const hole of holes) {
    let owner = null
    for (const outer of outers) {
      if (outer.area > hole.area && contourInside(hole.points, outer.points)) {
        if (!owner || outer.area < owner.area) owner = outer
      }
    }
    owner?.holes.push(hole.points)
  }

  // ExtrudeGeometry wants clockwise outlines and counter-clockwise holes.
  const cw = (pts) => (THREE.ShapeUtils.isClockWise(pts) ? pts : pts.slice().reverse())
  const ccw = (pts) => (THREE.ShapeUtils.isClockWise(pts) ? pts.slice().reverse() : pts)
  return outers.map((outer) => {
    const shape = new THREE.Shape(cw(outer.points))
    shape.holes = outer.holes.map((h) => new THREE.Path(ccw(h)))
    return shape
  })
}

/**
 * The icon's filled regions as THREE.Shapes, `size` across and centred on
 * the origin, y up.
 */
export function svgIconShapes(svgEl, size) {
  const clone = svgEl.cloneNode(true)
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
  clone.setAttribute('fill', '#000')
  clone.removeAttribute('style')
  clone.removeAttribute('width')
  clone.removeAttribute('height')
  clone.querySelectorAll('[fill="currentColor"]').forEach((n) => n.setAttribute('fill', '#000'))

  const { paths } = new SVGLoader().parse(new XMLSerializer().serializeToString(clone))
  const [minX, minY, w, h] = (svgEl.getAttribute('viewBox') || '0 0 24 24')
    .split(/[\s,]+/)
    .map(Number)
  const scale = size / Math.max(w, h)
  const cx = minX + w / 2
  const cy = minY + h / 2

  // SVG is y-down. The flip is done on the flattened outlines, and the
  // windings are then set explicitly, so nothing depends on a negative scale.
  const toLocal = (p) => new THREE.Vector2((p.x - cx) * scale, (cy - p.y) * scale)

  const shapes = []
  for (const path of paths) {
    const style = path.userData?.style
    if (style?.fill === 'none') continue
    const contours = path.subPaths
      .map((sub) => cleanOutline(sub.getPoints(8).map(toLocal)))
      .filter((pts) => pts.length > 2)
    shapes.push(...contoursToShapes(contours, style?.fillRule === 'evenodd'))
  }
  return shapes
}

/**
 * Extrudes an icon into a bevelled solid, `size` across, with its back face
 * at z = 0. Returns null when the icon yields no usable outline.
 */
export function extrudeSvgIcon(svgEl, { size, depth, bevel }) {
  const shapes = svgIconShapes(svgEl, size)
  if (!shapes.length) return null

  // The faces keep the exact outline and the bevel swells outward between
  // them. Kept shallow: a wider or inset bevel grows the holes, and in logos
  // with tightly packed cut-outs (CSS's letters, Postman's figure) they
  // overlap and the caps fail to triangulate.
  const geometry = new THREE.ExtrudeGeometry(shapes, {
    depth,
    curveSegments: 1,
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel * 0.25,
    bevelSegments: 2,
  })
  geometry.translate(0, 0, bevel)
  return geometry
}
