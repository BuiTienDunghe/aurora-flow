// The HUD band above the prompt: context gauge and bar, effort, flow, sessions today.
// An SVG strip for the desktop and mobile apps (both modes, by prefers-color-scheme),
// and one line of text for the terminal.
import { AURORA } from './aurora-scene.js'

const EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max']
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])

export function contextBandOf(percent) {
  const p = percent ?? 0
  return p >= 85 ? 3 : p >= 70 ? 2 : p >= 40 ? 1 : 0
}

export function formatTokens(n) {
  if (n == null) return '—'
  if (n >= 1_000_000) return `${+(n / 1_000_000).toFixed(n % 1_000_000 ? 2 : 0)}M`
  if (n >= 1000) return `${(n / 1000).toFixed(n >= 100_000 ? 0 : 1)}k`
  return String(n)
}

export function formatFlow(min) {
  const m = Math.max(0, Math.floor(min ?? 0))
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`
}

function focusStageOf(min) {
  return min >= 45 ? 3 : min >= 30 ? 2 : min >= 15 ? 1 : 0
}

/** One line for the terminal. */
export function hudLine(hud) {
  const pct = hud.context
  const filled = Math.round((pct ?? 0) / 10)
  const bar = '▰'.repeat(filled) + '▱'.repeat(10 - filled)
  const ctx = pct == null ? 'Context —' : `Context ${pct}% ${bar} ${formatTokens(hud.tokens)}/${formatTokens(hud.window)}`
  const effort = hud.effort ? hud.effort.toUpperCase() : '—'
  const storm = (pct ?? 0) >= 85 ? ' · ⚠ sắp đầy, nên /compact' : ''
  return `◉ ${ctx} · Effort ${effort} · Flow ${formatFlow(hud.focusMin)} · Phiên #${hud.sessionsToday} hôm nay${storm}`
}

/** The SVG strip, 860 by 58. */
export function hudSvg(hud) {
  const cb = contextBandOf(hud.context)
  const storm = cb === 3
  const pct = hud.context == null ? 0 : Math.max(0, Math.min(100, hud.context))
  const vars = (mode, t) => {
    const a = AURORA[mode][cb]
    return `--a0:${a[0]};--a1:${a[1]};--a2:${a[2]};--t1:${t[0]};--t2:${t[1]};--t3:${t[2]};--tr:${t[3]}`
  }
  const light = vars('light', ['#0b1526', '#33435a', '#5a6a80', 'rgba(11,21,38,.13)'])
  const dark = vars('dark', ['#e6f1ff', '#b8c9e2', '#8ea2c0', 'rgba(230,241,255,.13)'])

  const C = 2 * Math.PI * 18
  const arc = `${(C * pct / 100).toFixed(1)} ${C.toFixed(1)}`
  const ctxText = hud.context == null ? '—' : `${hud.context}%`
  const tokText = hud.context == null ? 'chờ phản hồi đầu tiên' : `${formatTokens(hud.tokens)} / ${formatTokens(hud.window)} tokens`

  const el = typeof hud.effort === 'string' ? EFFORTS.indexOf(hud.effort) : -1
  let segs = ''
  for (let k = 0; k < 5; k++) segs += `<rect x="${428 + k * 15}" y="42" width="12" height="5" rx="2" class="${k <= el ? 'on' : 'off'}"/>`
  const stage = focusStageOf(hud.focusMin)
  let dots = ''
  for (let k = 0; k < 4; k++) dots += `<circle cx="${534 + k * 11}" cy="45" r="3.5" class="${k <= stage ? 'don' : 'off'}"/>`
  let sdots = ''
  const sn = Math.max(1, Math.min(8, hud.sessionsToday))
  for (let k = 0; k < sn; k++) sdots += `<circle cx="${630 + k * 11}" cy="45" r="3.5" class="son"/>`

  const right = storm
    ? `<g class="storm"><rect x="706" y="15" width="142" height="28" rx="9" fill="url(#sg)"/><text x="777" y="33.5" text-anchor="middle" class="sc">⚠ Sắp đầy · /compact</text></g>`
    : `<text x="848" y="23" text-anchor="end" class="lb">MODEL</text><text x="848" y="40" text-anchor="end" class="md">${esc((hud.model ?? '—').replace(/^claude-/, '').slice(0, 22))}</text>`

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 860 58" width="860" height="58" preserveAspectRatio="xMinYMid meet"><style>
svg{${light}}@media (prefers-color-scheme:dark){svg{${dark}}}
.lb{font:700 9.5px Consolas,"Cascadia Mono",monospace;letter-spacing:1.6px;fill:var(--t3)}
.v{font:600 13px Consolas,"Cascadia Mono",monospace;fill:var(--t1)}
.md{font:600 12px Consolas,"Cascadia Mono",monospace;fill:var(--t2)}
.pc{font:700 17px "Segoe UI",system-ui,sans-serif;fill:var(--a1)}
.tk{font:500 11.5px Consolas,"Cascadia Mono",monospace;fill:var(--t2)}
.gt{font:700 10.5px "Segoe UI",system-ui,sans-serif;fill:var(--t1)}
.s0{stop-color:var(--a0)}.s1{stop-color:var(--a1)}.s2{stop-color:var(--a2)}
.trk{fill:none;stroke:var(--tr);stroke-width:5}.arc{fill:none;stroke:var(--a1);stroke-width:5;stroke-linecap:round}.sep{stroke:var(--tr)}
.on{fill:var(--a1)}.off{fill:var(--tr)}.don{fill:var(--a0)}.son{fill:var(--a2)}
.sc{font:700 11.5px "Segoe UI",system-ui,sans-serif;fill:#fff}
.storm{animation:pz 1.1s ease-in-out infinite alternate}@keyframes pz{from{opacity:.72}to{opacity:1}}
@media (prefers-reduced-motion:reduce){.storm{animation:none}}
</style><defs>
<linearGradient id="bar" x1="0" x2="1"><stop offset="0" class="s0"/><stop offset=".5" class="s1"/><stop offset="1" class="s2"/></linearGradient>
<linearGradient id="sg" x1="0" x2="1"><stop offset="0" stop-color="#e11d74"/><stop offset="1" stop-color="#f43f5e"/></linearGradient>
<filter id="gw" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="2" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
</defs>
<circle cx="29" cy="29" r="18" class="trk"/>
${pct > 0 ? `<circle cx="29" cy="29" r="18" class="arc" stroke-dasharray="${arc}" transform="rotate(-90 29 29)" filter="url(#gw)"/>` : ''}
<text x="29" y="33" text-anchor="middle" class="gt">${hud.context == null ? '—' : `${hud.context}%`}</text>
<text x="62" y="18" class="lb">CONTEXT · PHIÊN NÀY</text>
<text x="62" y="36" class="pc" filter="url(#gw)">${ctxText}</text>
<text x="${62 + Math.round(ctxText.length * 11.5) + 10}" y="35" class="tk">${esc(tokText)}</text>
<rect x="62" y="43" width="330" height="5" rx="2.5" class="off"/>
${pct > 0 ? `<rect x="62" y="43" width="${(330 * pct / 100).toFixed(1)}" height="5" rx="2.5" fill="url(#bar)" filter="url(#gw)"/>` : ''}
<line x1="410" y1="10" x2="410" y2="48" class="sep"/>
<text x="428" y="18" class="lb">EFFORT</text><text x="428" y="35" class="v">${esc(hud.effort ? hud.effort.toUpperCase() : '—')}</text>${segs}
<text x="530" y="18" class="lb">FLOW</text><text x="530" y="35" class="v">${formatFlow(hud.focusMin)}</text>${dots}
<text x="626" y="18" class="lb">HÔM NAY</text><text x="626" y="35" class="v">Phiên #${hud.sessionsToday}</text>${sdots}
${right}
</svg>`
}
