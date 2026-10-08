import { clamp } from './util.js'
import { MAX_PIXELS, START_DISCRETE, START_INTEGRATED, qualityLadder, rungOf } from './quality.js'

/**
 * Quality: measured, not guessed.
 *
 * The GPU's own time per frame (a timer query, where the browser offers
 * one) and the frame interval decide the rung of the quality ladder (see
 * quality.js). Over each window of frames: too slow, and the rung steps
 * down at once; comfortably fast, and it steps up — but only while it has
 * never had to step down, so the level settles instead of oscillating.
 *
 * Rungs fall into three tiers, and each tier sets more than resolution:
 *   HIGH    ambient occlusion and sharpening; 4k shadows on discrete GPUs
 *   MEDIUM  no post-processing, 2k shadows
 *   LOW     under 1.5× resolution, 1k shadows, fewer sparks
 * setLevel() pins a tier (the governor then only moves within it); 'AUTO'
 * lets the governor roam the whole ladder.
 *
 *   renderer     the renderer whose pixel ratio is managed
 *   timer        a GPU timer (gpu-timer.js) or null
 *   mount        the canvas' container (its CSS size)
 *   finePointer  desktop-class input: the full ladder, with AO rungs
 *   integrated   integrated GPU: start lower, never 4k shadows
 *   info         { gpuName, backend } for the dev readout
 *   clock        { now }: the loop's clock
 *   post         { current }: the post chain, once it exists
 *   isPaused     true while the governor should not judge (e.g. docked)
 *   onTier       (tier, settings) => void whenever the tier changes
 *   onStruggle   () => void when even the lowest rung runs under ~12 fps
 */
export const TIERS = ['HIGH', 'MEDIUM', 'LOW']
export const tierOfRung = (q) => (q.ao > 0 ? 'HIGH' : q.dpr >= 1.5 ? 'MEDIUM' : 'LOW')

export function createQuality({
  renderer,
  timer,
  mount,
  finePointer,
  integrated,
  info,
  clock,
  post,
  isPaused,
  onTier,
  onStruggle,
}) {
  const nativeDpr = Math.min(window.devicePixelRatio || 1, 2)
  const ladder = qualityLadder(finePointer, nativeDpr)
  const bigShadows = finePointer && !integrated
  const SETTINGS = {
    HIGH: { shadowMap: bigShadows ? 4096 : 2048, shadowRadius: bigShadows ? 7 : 4, sparks: 36, ring: true, glint: true },
    MEDIUM: { shadowMap: 2048, shadowRadius: 4, sparks: 24, ring: true, glint: true },
    LOW: { shadowMap: 1024, shadowRadius: 3, sparks: 12, ring: true, glint: true },
  }

  // Where to start: a desktop by its GPU; a software renderer at the
  // bottom; a phone at its own pixel ratio, or a step lower when it is a
  // small one (little memory, few cores).
  const software = /SwiftShader|llvmpipe|softpipe|Software|Microsoft Basic Render/i.test(info.gpuName)
  const smallDevice =
    !finePointer && ((navigator.deviceMemory || 8) <= 4 || (navigator.hardwareConcurrency || 8) <= 4)
  let rung = software
    ? ladder.length - 1
    : finePointer
      ? rungOf(ladder, integrated ? START_INTEGRATED : START_DISCRETE)
      : Math.min(ladder.length - 1, smallDevice ? 1 : 0)
  // The rungs the governor may use, best first: all of them, or one
  // tier's (setLevel). The ladder is ordered by cost, so a tier's rungs
  // are not always side by side.
  let level = 'AUTO'
  let allowed = ladder.map((_, i) => i)

  // The rung's pixel ratio, capped so a large canvas never exceeds MAX_PIXELS.
  const rungDpr = (i) => {
    const w = mount.clientWidth || 1
    const h = mount.clientHeight || 1
    return Math.min(ladder[i].dpr, Math.sqrt(MAX_PIXELS / (w * h)))
  }
  let dpr = rungDpr(rung)
  let tier = null

  // Windows are measured in seconds, so a struggling GPU is judged (and
  // relieved) as promptly as a fast one: a third of a second to settle
  // after a change, then three quarters of a second per window (a second
  // and a half once the level is locked), never fewer than a dozen frames.
  const perf = {
    warmUntil: 0.35,
    windowStart: 0,
    frames: 0,
    slow: 0,
    gpu: 0,
    gpuN: 0,
    dts: [],
    period: 1 / 60,
    locked: false,
    frozen: false,
    held: false,
    // Windows in a row spent at the bottom rung and still under ~12 fps.
    struggling: 0,
  }
  const history = []
  // Smoothed GPU time per frame, in ms (null until a timer result lands).
  let gpuEma = null

  /** Puts the current rung into effect: pixel ratio, AO resolution, tier. */
  const apply = () => {
    const { ao } = ladder[rung]
    dpr = rungDpr(rung)
    const next = tierOfRung(ladder[rung])
    if (next !== tier) {
      tier = next
      onTier?.(tier, SETTINGS[tier])
    }
    const w = mount.clientWidth
    const h = mount.clientHeight
    if (!w || !h) return
    renderer.setPixelRatio(dpr)
    renderer.setSize(w, h)
    post.current?.resize(w, h, dpr, ao)
    // A new size or rung allocates fresh render targets: let that settle
    // before the next window is judged.
    perf.warmUntil = clock.now + 0.35
    perf.windowStart = clock.now
    perf.frames = perf.slow = perf.gpu = perf.gpuN = 0
    perf.dts.length = 0
    if (import.meta.env.DEV) {
      window.__samuraiQuality = {
        rung,
        dpr,
        ao,
        tier,
        level,
        gpuName: info.gpuName,
        backend: info.backend,
        integrated,
        timer: !!timer,
        history,
      }
    }
  }

  const govern = (dt, gpuMs) => {
    if (isPaused() || dt === 0 || perf.frozen) return
    const now = clock.now
    if (perf.held) {
      perf.windowStart = now
      return
    }
    if (now < perf.warmUntil) {
      perf.windowStart = now
      return
    }
    perf.frames++
    perf.dts.push(dt)
    // A frame is slow when it clearly missed the next refresh, judged
    // against the typical frame of the last window.
    if (dt > Math.max(perf.period * 1.5, 1 / 48)) perf.slow++
    if (gpuMs !== null) {
      perf.gpu += gpuMs
      perf.gpuN++
      gpuEma = gpuEma === null ? gpuMs : gpuEma + (gpuMs - gpuEma) * 0.1
    }
    // A window is a dozen frames and at least three quarters of a second —
    // or, when frames are very slow, whatever three seconds bring.
    if ((perf.frames < 12 && now - perf.windowStart < 3) || now - perf.windowStart < (perf.locked ? 1.5 : 0.75)) return
    // The median interval is the cadence actually achieved: the display's
    // period when frames keep up, a multiple of it when they don't.
    perf.dts.sort((a, b) => a - b)
    const median = perf.dts[perf.dts.length >> 1]
    perf.period = clamp(median, 1 / 240, 1 / 50)
    const atBottom = allowed.indexOf(rung) === allowed.length - 1
    perf.struggling = atBottom && median > 1 / 12 ? perf.struggling + 1 : 0
    if (perf.struggling >= 2) {
      perf.frozen = true
      onStruggle?.()
      return
    }
    const slowShare = perf.slow / perf.frames
    const load = perf.gpuN ? perf.gpu / perf.gpuN / (perf.period * 1000) : null
    let next = rung
    const pos = allowed.indexOf(rung)
    if (slowShare > 0.2 || (load !== null && load > 0.92)) {
      // The further over budget, the more rungs at once.
      const over = Math.max(slowShare / 0.2, load === null ? 0 : load)
      next = allowed[Math.min(allowed.length - 1, pos + (over > 1.8 ? 3 : over > 1.3 ? 2 : 1))]
      perf.locked = true
    } else if (!perf.locked && pos > 0 && load !== null && slowShare < 0.03) {
      // Step up only when the rung above is predicted to leave a quarter
      // of the frame free for the rest of the page.
      const up = allowed[pos - 1]
      if ((load * ladder[up].cost) / ladder[rung].cost < 0.75) next = up
    }
    if (import.meta.env.DEV) {
      history.push({
        t: +now.toFixed(1),
        rung,
        next,
        slow: +slowShare.toFixed(2),
        load: load === null ? null : +load.toFixed(2),
        gpuMs: perf.gpuN ? +(perf.gpu / perf.gpuN).toFixed(1) : null,
        period: +(perf.period * 1000).toFixed(1),
        ao: !!post.current?.ready,
      })
      if (history.length > 200) history.shift()
    }
    perf.frames = perf.slow = perf.gpu = perf.gpuN = 0
    perf.dts.length = 0
    perf.windowStart = now
    if (next !== rung) {
      rung = next
      apply()
    }
  }

  return {
    ladder,
    apply,
    govern,
    get rung() {
      return rung
    },
    get dpr() {
      return dpr
    },
    /** AO resolution of the current rung (0: no AO, draw straight to the canvas). */
    get ao() {
      return ladder[rung].ao
    },
    get tier() {
      return tier
    },
    get level() {
      return level
    },
    get settings() {
      return SETTINGS[tier]
    },
    get gpuMs() {
      return gpuEma
    },
    /**
     * 'HIGH' | 'MEDIUM' | 'LOW' pins a tier (the nearest one this device's
     * ladder has); 'AUTO' hands the choice back to the governor.
     */
    setLevel(next) {
      const want = String(next || 'AUTO').toUpperCase()
      level = TIERS.includes(want) ? want : 'AUTO'
      if (level === 'AUTO') allowed = ladder.map((_, i) => i)
      else {
        // The tier's rungs, or those of the nearest tier that has any.
        const near = (t) => Math.abs(TIERS.indexOf(t) - TIERS.indexOf(level))
        for (const t of [...TIERS].sort((a, b) => near(a) - near(b))) {
          const idx = ladder.map((q, i) => (tierOfRung(q) === t ? i : -1)).filter((i) => i >= 0)
          if (idx.length) {
            allowed = idx
            break
          }
        }
      }
      perf.locked = false
      perf.frozen = false
      // Stay as close as the allowed rungs let it to where it was.
      if (!allowed.includes(rung)) {
        rung = allowed.reduce((best, i) => (Math.abs(ladder[i].cost - ladder[rung].cost) < Math.abs(ladder[best].cost - ladder[rung].cost) ? i : best))
      }
      apply()
      return level
    },
    /**
     * Holds judgement while something other than the GPU's load slows
     * frames (shaders compiling); judging resumes after a short settle.
     */
    hold(on) {
      perf.held = on
      if (!on) {
        perf.warmUntil = clock.now + 0.5
        perf.windowStart = clock.now
        perf.frames = perf.slow = perf.gpu = perf.gpuN = 0
        perf.dts.length = 0
      }
    },
    /** Pins a rung and stops the governor (dev tools and tests). */
    setRung(i) {
      rung = clamp(i, 0, ladder.length - 1)
      perf.frozen = true
      apply()
    },
  }
}
