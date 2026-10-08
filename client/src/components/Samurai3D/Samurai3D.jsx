import { useEffect, useRef, useState } from 'react'
import { FiX } from 'react-icons/fi'
import { MOVES } from '../../lib/companion.js'
import SamuraiFallback from './SamuraiFallback.jsx'
import { createSamuraiEngine } from './SamuraiEngine.js'

/**
 * An original stylised samurai mascot, modelled from primitives.
 *
 * The character is chibi, but the armour is built the way real armour is: a
 * tōsei-gusoku (late-period armour) with the showpieces of an earlier
 * ō-yoroi, assembled from many separate, recognisable parts in layers.
 *
 * Layers, from the inside out:
 *  - Clothing. An indigo silk kosode woven with asanoha (it shows at the
 *    sleeves and armpits); striped, knife-pleated hakama; padded cotton with
 *    sashiko quilting for linings and the haidate apron; a stiff hakata-woven
 *    silk obi over the dō. Each fibre has its own finish: silk is smooth with
 *    a bright, tight sheen and glossy satin in its pattern, cotton is matte,
 *    braided silk cord sits between, leather is waxed and clear-coated.
 *  - Mail and splints. Kusari (mail) sleeves and shin guards, with lacquered
 *    splints, small ikada plates on the upper arm, and gilt-rimmed cops at
 *    the elbows (hiji-gane) and knees; kawara-haidate — small iron tiles sewn
 *    in staggered rows on a cloth apron — over the thighs.
 *  - The dō. A two-piece (ni-mai) dō, hinged under the left arm and tied
 *    with takahimo cords under the right. Each half is a muna-ita and two
 *    more plates riveted one over the next (okegawa), then four laced lames
 *    (mogami) to the waist; flank plates close the sides. Over the front hangs
 *    an ō-yoroi's tsurubashiri-gawa, stencilled indigo leather with a hishi
 *    lattice of hanabishi, gilt-edged; above it a gilt kiku kamon. From the
 *    shoulder straps hang the sendan-no-ita (three laced lames, right) and
 *    kyūbi-no-ita (one solid plate, left). Kohire cap the points of the
 *    shoulders; the back has the gattari and machi-uke for a banner pole and
 *    the agemaki bow on its ring.
 *  - Sode, kusazuri and the neck guards. Every plate is a solid, bevelled
 *    shell with real thickness, so its edges catch the light instead of
 *    reading as paper. Sode, kusazuri, the lower dō, the shikoro and the
 *    throat guard are lamellar: rows of lames over a dark lining, joined by
 *    flat silk braid (sugake odoshi), finished with cross-knots (hishinui)
 *    along the bottom lame. Each sode has its mizunomi-no-kan ring.
 *  - The kabuto and menpō are black urushi flecked with gold leaf: a sixteen-
 *    plate bowl with riveted seams, a rolled peak, broad turned-back wings
 *    with gilt kanamono, closely laced black lames at the neck, a flag ring
 *    at the back, and a broad engraved gilt crest of two swept blades on a
 *    chrysanthemum boss. The mask is a sculpted menpō: a
 *    curved brow with heavy folds over each eye, lit slits in gilt rims, a
 *    bridged nose with nostrils, cheek plates carrying the pegs the helmet
 *    cord hooks round, gold sunbursts, a tapered mouth guard with cheek
 *    folds, breathing slots, a horsehair moustache over a mouth open on
 *    gilt teeth, and a laced throat guard beneath.
 *  - The feet are leather boots on straw soles. The hands are gloved fists —
 *    four curled fingers and a thumb — with an iron tekko over the back; the
 *    katana hand's fingers always wrap the grip, and the other hand closes on
 *    it too in a two-handed guard.
 *  - Materials are physical: clear-coated urushi lacquer, hammered iron,
 *    polished gold, mail, stencilled leather, the textiles above, and a blade
 *    with a real hamon (temper line) — mirror-polished ji, cloudy matte ha.
 *  - On desktop, ambient occlusion darkens the gaps between plates, shadows
 *    are 4k, and the frame is supersampled (up to 3× the screen's pixels)
 *    with MSAA, then given a light contrast-adaptive sharpen. A quality
 *    ladder (see qualityLadder) is climbed or descended from the GPU's real
 *    frame times, so a strong GPU gets every pixel and a weak one stays
 *    smooth. Its rungs fall into HIGH / MEDIUM / LOW tiers (SamuraiQuality).
 *  - A soft fresnel rim on every lit surface lifts his silhouette off a
 *    dark page.
 *
 * He idles standing, facing the visitor: he breathes, blinks, glances about,
 * shifts his weight, and his head (and a little of his upper body) follows
 * the mouse cursor. Hovered, he comes a little more alive. Click / tap /
 * Enter plays his cinematic — ATTENTION, DRAW_KATANA (the free hand to the
 * grip, the blade raised before his face as a glint runs up it), STANCE (a
 * quick drop into a low guard; sparks off the edge, a ring of energy at his
 * feet) and RETURN_IDLE. Left alone for a long while he kneels into seiza
 * to meditate, katana across his lap, and rises when the visitor stirs.
 *
 * He is also the site's companion (see lib/companion.js). The page reports
 * which section is in view and what the visitor is doing; he answers with a
 * mood — calm, attentive, thinking, focused, battle, victory — and short
 * one-shot actions. Moods are whole-body poses (stance, arms via IK, blade,
 * eyes) that he eases between on springs; actions are keyframes layered on
 * top. His eyes cast their glow onto the mask; the skirt, sode, bow and
 * crest lag and flare from the body's real acceleration; a fast cut leaves
 * a fading sweep behind the edge; scrolling tips his head and weight.
 * On wide desktop screens he leaves the hero once it scrolls away and waits
 * in the corner, stepping out of sight whenever page content would be under
 * him. Reduced motion slows and softens every change, keeps only breathing
 * and blinks as idle motion, and plays every action in a gentle form.
 *
 * Load time is dominated by GPU shader compilation, so the scene is built to
 * keep that small: the reflection map is baked offline (see studio-env.js),
 * every material shares one of four shader programs, repeated pieces are
 * merged rather than instanced, shaders compile in parallel off the main
 * thread, and the AO pass is only switched on once the character is already
 * on screen, with its shader variants compiled in the background first. The
 * surface maps and reflection map are started by the Hero before this chunk
 * even arrives, and the geometry is built in short slices between frames,
 * so the page keeps animating while he is put together.
 *
 * Layout, standing, bottom to top (world units, floor at y = 0):
 *   0.04  sandals        1.15  hips / sash (HIP_Y)
 *   0.65  knees          1.87  shoulders
 *   2.32  eye line       2.95  helmet crown
 *   3.78  crest tips
 *
 * Drag to turn him a full 360° (he turns back to face the visitor after).
 * Colours come from the --samurai-* CSS tokens.
 */

/*
 * Code map (all in this folder):
 *   SamuraiEngine.js                the engine: renderer, loop, start-up, teardown
 *   SamuraiScene.js                 camera, orbit controls, studio lights, ground
 *   SamuraiModel.js                 the built-in model and its materials
 *   SamuraiAnimationController.js   moods, actions, idle life, IK, the gaze
 *   SamuraiInteraction.js           cursor, hover, press, keys, companion store
 *   SamuraiEffects.js               blade trail, glint, sparks, energy ring, rim light
 *   SamuraiFallback.jsx             his poster: placeholder while loading, and the
 *                                   static fallback where 3D cannot run
 *   SamuraiDock.js                  the corner dock
 *   SamuraiQuality.js               the quality governor (ladder in quality.js)
 *   post-webgl.js                   ambient occlusion + sharpening
 *   geometry.js, ik.js, poses.js, textures.js, constants.js, util.js
 */

export default function Samurai3D() {
  const slotRef = useRef(null)
  const frameRef = useRef(null)
  const mountRef = useRef(null)
  const hitRef = useRef(null)
  const dismissRef = useRef(null)
  const [tip, setTip] = useState(false)
  // No renderer could start, or the model failed to build: his poster stays.
  const [fallback, setFallback] = useState(false)

  useEffect(() => {
    const mount = mountRef.current
    if (!mount) return
    const engine = createSamuraiEngine({
      mount,
      frameEl: frameRef.current,
      slotEl: slotRef.current,
      hitEl: hitRef.current,
      dismissEl: dismissRef.current,
      setTip,
    })
    const fail = () => setFallback(true)
    // Too slow even at its lowest quality: free the GPU, keep the poster.
    const standDown = () => {
      setFallback(true)
      engine.dispose()
    }
    const offs = [engine.on('unsupported', fail), engine.on('error', fail), engine.on('fallback', standDown)]
    return () => {
      offs.forEach((off) => off())
      engine.dispose()
    }
  }, [])

  return (
    <div className="samurai-slot" ref={slotRef}>
      <div className="samurai-frame" ref={frameRef}>
        <div
          className={`robot3d samurai3d has-poster${fallback ? ' is-fallback' : ''}`}
          ref={mountRef}
          role={fallback ? undefined : 'button'}
          tabIndex={fallback ? undefined : 0}
          aria-hidden={fallback || undefined}
          aria-label={
            fallback
              ? undefined
              : '3D samurai companion. Drag to turn him; click, tap or press Enter and he draws his katana.'
          }
          aria-describedby={tip ? 'samurai-tip' : undefined}
        >
          <SamuraiFallback />
        </div>
        {/* Docked, only his silhouette takes clicks; the rest of the box lets them through. */}
        <div className="samurai-hit" ref={hitRef} aria-hidden="true" />
        {tip && (
          <span className="samurai-tip" id="samurai-tip" role="tooltip">
            Your guide through the portfolio.
            <span className="samurai-tip-keys">
              Moves:{' '}
              {MOVES.map((m) => (
                <kbd key={m.key}>{m.key}</kbd>
              ))}
            </span>
          </span>
        )}
        <button
          type="button"
          className="samurai-dismiss"
          ref={dismissRef}
          aria-label="Hide the samurai companion"
        >
          <FiX aria-hidden="true" />
        </button>
      </div>
    </div>
  )
}
