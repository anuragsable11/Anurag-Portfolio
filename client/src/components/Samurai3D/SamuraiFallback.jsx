/**
 * The samurai as a still picture: rendered from the 3D model itself (see
 * tools/render-samurai-poster.html), held at his first frame.
 *
 * It is shown at once while the 3D samurai loads, and the live canvas
 * fades in over it; it stays in his place wherever 3D cannot run (no WebGL,
 * a model that failed to load, a lost GPU context).
 *
 * The picture is a CSS background (.samurai-poster in index.css), so the
 * stylesheet picks the theme's poster and the prerendered page can carry
 * it before any JavaScript runs, without fetching the other theme's. It is
 * 3:1 and the stage is never wider than that, so filling the stage's height
 * and cropping the sides (background-size: cover) shows the same framing as
 * the live camera at any stage shape.
 */
export default function SamuraiFallback() {
  return <div className="samurai-poster" aria-hidden="true" />
}
