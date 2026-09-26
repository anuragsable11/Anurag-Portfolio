import { useEffect, useRef, useState } from 'react'
import { MOVES, playMove, useCompanion } from '../lib/companion.js'

/**
 * The samurai's moves as a row of keycaps under the hero. Pressing a key
 * anywhere on the page plays its move and lights its keycap here; on a touch
 * screen, tapping a keycap does the same.
 */
export default function SamuraiMoves() {
  const { action } = useCompanion()
  const [lit, setLit] = useState(null)
  const seen = useRef(action?.id ?? 0)

  useEffect(() => {
    if (!action || action.id === seen.current) return
    seen.current = action.id
    if (!MOVES.some((m) => m.action === action.name)) return
    setLit(action.name)
    const timer = setTimeout(() => setLit(null), 900)
    return () => clearTimeout(timer)
  }, [action])

  return (
    <div className="samurai-moves" role="group" aria-label="Samurai moves">
      <span className="samurai-moves-label" aria-hidden="true">
        Moves
      </span>
      {MOVES.map((m) => (
        <button
          key={m.key}
          type="button"
          className={`move-key ${lit === m.action ? 'is-lit' : ''}`}
          onClick={() => playMove(m.action)}
          aria-keyshortcuts={m.key}
          aria-label={`${m.title} (key ${m.key})`}
          title={`${m.title} — press ${m.key}`}
        >
          <kbd>{m.key}</kbd>
          <span>{m.label}</span>
        </button>
      ))}
    </div>
  )
}
