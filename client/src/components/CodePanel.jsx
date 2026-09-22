/**
 * Static code panel shown in place of the 3D graph when the visitor prefers
 * reduced motion, or the browser cannot give us WebGL.
 */

const codeLines = [
  { t: 'cmt', v: '# agent.py — orchestrate model, tools and memory' },
  { t: 'raw', v: [['key', 'class '], ['fn', 'AgentRuntime'], ['op', ':']] },
  {
    t: 'raw',
    v: [
      ['op', '    '],
      ['key', 'def '],
      ['fn', '__init__'],
      ['op', '(self, llm, tools, memory):'],
    ],
  },
  { t: 'raw', v: [['op', '        self.llm    = llm        '], ['cmt', '# Qwen3 via Ollama']] },
  { t: 'raw', v: [['op', '        self.tools  = tools      '], ['cmt', '# RAG · retrieval']] },
  { t: 'raw', v: [['op', '        self.memory = memory     '], ['cmt', '# Redis context']] },
  { t: 'blank' },
  {
    t: 'raw',
    v: [['op', '    '], ['key', 'async def '], ['fn', 'run'], ['op', '(self, turn):']],
  },
  {
    t: 'raw',
    v: [
      ['op', '        ctx     = '],
      ['key', 'await '],
      ['var', 'self.memory.'],
      ['fn', 'load'],
      ['op', '(turn.session)'],
    ],
  },
  {
    t: 'raw',
    v: [
      ['op', '        grounded= '],
      ['key', 'await '],
      ['var', 'self.tools.'],
      ['fn', 'retrieve'],
      ['op', '(turn.query, k='],
      ['num', '5'],
      ['op', ')'],
    ],
  },
  {
    t: 'raw',
    v: [
      ['op', '        answer  = '],
      ['key', 'await '],
      ['var', 'self.llm.'],
      ['fn', 'generate'],
      ['op', '(ctx, grounded)'],
    ],
  },
  {
    t: 'raw',
    v: [
      ['op', '        '],
      ['key', 'await '],
      ['var', 'self.memory.'],
      ['fn', 'append'],
      ['op', '(turn, answer)'],
    ],
  },
  { t: 'raw', v: [['op', '        '], ['key', 'return '], ['var', 'answer']] },
  { t: 'blank' },
  { t: 'cmt', v: '# queued on Celery → never blocks the request cycle' },
]

function CodeLine({ line }) {
  if (line.t === 'blank') return <div className="ln">&nbsp;</div>
  if (line.t === 'cmt') return <div className="ln tk-cmt">{line.v}</div>
  return (
    <div className="ln">
      {line.v.map(([tone, txt], i) => (
        <span key={i} className={`tk-${tone}`}>
          {txt}
        </span>
      ))}
    </div>
  )
}

export default function CodePanel() {
  return (
    <div className="terminal">
      <div className="terminal-bar">
        <span className="term-dot" />
        <span className="term-dot" />
        <span className="term-dot" />
        <span className="terminal-title">anurag@backend ~ /agent.py</span>
      </div>
      <div className="terminal-body">
        {codeLines.map((line, i) => (
          <CodeLine key={i} line={line} />
        ))}
      </div>
    </div>
  )
}
