// Aurora Flow backdrop: aurora curtains over a tech horizon, drawn from the session's state.
//   context  0..100     → aurora hue: calm green → cyan/violet → magenta → storm (≥85)
//   effort   low..max   → motion energy: curtain speed, ray shimmer, rising data particles
//   focusMin minutes    → focus stage 0..3: deeper vignette, brighter aurora core (more contrast)
//   sessions today      → a constellation: one star per session, the newest one pulsing
// One SVG serves both modes: light by default, prefers-color-scheme: dark swaps the variables.
// CSS animation only, timing in classes, no script; stays well under 131,072 characters.

const EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max']

function rng(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const n1 = v => Math.round(v * 10) / 10

/** Bands the scene redraws on: a change inside a band redraws nothing. */
export function sceneBands(state) {
  const ctx = state.context ?? 0
  const contextBand = ctx >= 85 ? 3 : ctx >= 70 ? 2 : ctx >= 40 ? 1 : 0
  const effortLevel = Math.max(0, EFFORTS.indexOf(typeof state.effort === 'string' ? state.effort : 'medium'))
  const m = state.focusMin ?? 0
  const focusStage = m >= 45 ? 3 : m >= 30 ? 2 : m >= 15 ? 1 : 0
  const stars = Math.max(1, Math.min(12, state.sessionsToday ?? 1))
  return { contextBand, effortLevel, focusStage, stars }
}

// aurora colors per context band: [low curtain, mid curtain, crown]
export const AURORA = {
  dark: [
    ['#27f59a', '#1de9d0', '#58b8ff'],
    ['#1de9d0', '#4aa8ff', '#9a7bff'],
    ['#5aa0ff', '#a86bff', '#ff5fd0'],
    ['#b45cff', '#ff4fa3', '#ff5a5a'],
  ],
  light: [
    ['#10c48a', '#14b3d6', '#6d8dff'],
    ['#12b5c9', '#3d7bff', '#9b6bff'],
    ['#4f7dff', '#9a5cff', '#ec4fb5'],
    ['#9a55ff', '#ec4f95', '#f25555'],
  ],
}

export function buildScene(state) {
  const { contextBand: cb, effortLevel: el, focusStage: fs, stars } = sceneBands(state)
  const r = rng(2026)
  const speed = 1 + el * 0.45 // effort → energy
  const D = s => `${n1(s / speed)}s`

  // ── curtains: partial arcs with a soft bright lower edge, irregular rays fading upward,
  //    colored by altitude (green low, violet/red high) ──
  const ribbons = [
    { x0: -250, x1: 1150, base: 470, slope: -0.1, amp: 55, f: 0.004, ph: 0.3, w: 30, sway: 19 },
    { x0: 450, x1: 1850, base: 420, slope: 0.07, amp: 75, f: 0.003, ph: 2.0, w: 36, sway: 24 },
    { x0: -300, x1: 950, base: 320, slope: 0.05, amp: 40, f: 0.006, ph: 4.1, w: 22, sway: 16 },
    { x0: 850, x1: 1900, base: 560, slope: -0.04, amp: 45, f: 0.005, ph: 5.2, w: 26, sway: 28 },
    { x0: 150, x1: 1450, base: 610, slope: 0, amp: 28, f: 0.007, ph: 1.1, w: 16, sway: 22 },
  ]
  let defs = '', body = ''
  ribbons.forEach((rb, k) => {
    const pts = []
    for (let x = rb.x0; x <= rb.x1; x += 45) {
      const y = rb.base + rb.slope * (x - 800) + rb.amp * Math.sin(x * rb.f + rb.ph) + rb.amp * 0.3 * Math.sin(x * rb.f * 2.7 + rb.ph * 2)
      pts.push([x, Math.round(y)])
    }
    const curve = pts.map(([x, y], j) => `${j ? 'L' : 'M'}${x} ${y}`).join('')
    const last = pts[pts.length - 1][0]
    const above = pts.map(([x, y], j) => `${j ? 'L' : 'M'}${x} ${y + 6}`).join('') + `L${last} -300L${rb.x0} -300Z`
    defs += `<path id="e${k}" d="${curve}"/>`
      + `<linearGradient id="h${k}" gradientUnits="userSpaceOnUse" x1="${rb.x0}" y1="0" x2="${last}" y2="0"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".25" stop-color="#fff"/><stop offset=".75" stop-color="#fff"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>`
      + `<clipPath id="c${k}"><path d="${above}"/></clipPath>`
      + `<mask id="m${k}" maskUnits="userSpaceOnUse" x="-500" y="-400" width="2600" height="1700"><use href="#e${k}" fill="none" stroke="url(#h${k})" stroke-width="${rb.w}" filter="url(#vb)" transform="translate(0 -85)"/><use href="#e${k}" fill="none" stroke="url(#h${k})" stroke-width="12" filter="url(#eb)"/><rect class="ray" x="-500" y="-400" width="2600" height="1700" fill="url(#gaps)"/></mask>`
    body += `<g class="sw w${k}"><g class="br b${k}">`
      + `<g clip-path="url(#c${k})"><g mask="url(#m${k})" class="fl f${k % 4}"><rect x="-500" y="-400" width="2600" height="1500" fill="url(#alt)"/></g></g>`
      + `</g></g>`
  })
  // irregular ray texture
  let rayLines = ''
  for (let k = 0; k < 16; k++) rayLines += `<rect x="${Math.round(r() * 154)}" width="${n1(2 + r() * 6)}" height="1700" fill="#000" opacity="${n1(0.15 + r() * 0.4)}"/>`

  // ── mountain silhouette at the horizon, rim-lit by the aurora ──
  let ridge = 'M-50 822'
  for (let x = -50; x <= 1650; x += 40) {
    const y = 770 - 38 * Math.abs(Math.sin(x * 0.0042 + 1.3)) - 22 * Math.abs(Math.sin(x * 0.011 + 0.4)) - 10 * Math.sin(x * 0.031)
    ridge += `L${x} ${Math.round(y)}`
  }
  ridge += 'L1650 822Z'

  // ── stars (night only) and today's constellation ──
  let starDots = ''
  for (let k = 0; k < 90; k++) {
    starDots += `<circle class="tw t${k % 5}" cx="${Math.round(r() * 1600)}" cy="${Math.round(r() * 430)}" r="${n1(0.5 + r() * 1.2)}"/>`
  }
  let con = '', conLine = ''
  for (let k = 0; k < stars; k++) {
    const t = stars === 1 ? 0.5 : k / (stars - 1)
    const x = Math.round(980 + t * 520 + (k % 2 ? 18 : -12))
    const y = Math.round(150 - Math.sin(t * Math.PI) * 70 + (k % 3) * 14)
    conLine += `${k ? 'L' : 'M'}${x} ${y}`
    const newest = k === stars - 1
    con += `<circle class="cs" cx="${x}" cy="${y}" r="${newest ? 4.2 : 2.8}"/>`
      + (newest ? `<circle class="cr" cx="${x}" cy="${y}" r="16"/><text class="cl" x="${x + 12}" y="${y - 12}">SESSION ${String(stars).padStart(2, '0')}</text>` : '')
  }

  // ── tech horizon: perspective grid and rising data particles ──
  const H = 820
  let grid = ''
  for (let k = -14; k <= 14; k++) grid += `<line x1="${800 + k * 14}" y1="${H}" x2="${800 + k * 150}" y2="1000"/>`
  let hl = ''
  for (let k = 0; k < 7; k++) hl += `<line class="gl h${k}" x1="0" y1="${H}" x2="1600" y2="${H}"/>`
  let parts = ''
  const pc = 6 + el * 7
  for (let k = 0; k < pc; k++) {
    parts += `<circle class="pt p${k % 4} d${k % 6}" cx="${Math.round(r() * 1600)}" cy="${Math.round(H + 10 + r() * 160)}" r="${n1(1 + r() * 1.6)}"/>`
  }

  const storm = cb === 3
  const vig = [0, 0.22, 0.38, 0.55][fs]
  const glow = [0.78, 0.86, 0.94, 1][fs]
  const A = AURORA
  const varsFor = mode => {
    const a = A[mode][cb]
    const base = mode === 'dark'
      ? { mt: '#020611', sky0: '#01030a', sky1: '#030b1f', sky2: '#071733', star: '.9', grid: '#3fd6ff', go: '.28', vig: '#000208', blend: 'screen', hz: storm ? '#ff4f8b' : a[0] }
      : { mt: '#cfd8ee', sky0: '#f6f4ff', sky1: '#e9eefc', sky2: '#dfe8f8', star: '0', grid: '#3b82f6', go: '.22', vig: '#2a2f5a', blend: 'normal', hz: storm ? '#e8457f' : a[1] }
    return `--a0:${a[0]};--a1:${a[1]};--a2:${a[2]};--sky0:${base.sky0};--sky1:${base.sky1};--sky2:${base.sky2};--star:${base.star};--grid:${base.grid};--go:${base.go};--vig:${base.vig};--hz:${base.hz};--blend:${base.blend};--mt:${base.mt}`
  }
  const lightAuroraOpacity = n1(glow * 0.8)

  const style = `svg{${varsFor('light')};--ao:${lightAuroraOpacity}}
@media (prefers-color-scheme:dark){svg{${varsFor('dark')};--ao:${glow}}}
.s0{stop-color:var(--sky0)}.s1{stop-color:var(--sky1)}.s2{stop-color:var(--sky2)}
.a0{stop-color:var(--a0)}.a1{stop-color:var(--a1)}.a2{stop-color:var(--a2)}
.au{opacity:var(--ao);mix-blend-mode:var(--blend)}
.sw{animation:sw 20s ease-in-out infinite alternate}
${ribbons.map((rb, k) => `.w${k}{animation-duration:${D(rb.sway)};animation-delay:-${k * 3}s}`).join('')}
${[0, 1, 2, 3, 4, 5, 6].map(k => `.h${k}{animation-delay:-${n1(k * 9 / speed / 7)}s}`).join('')}
${[0, 1, 2, 3, 4, 5].map(k => `.d${k}{animation-delay:-${n1(k * 7 / speed / 6)}s}`).join('')}
@keyframes sw{from{transform:translateX(-70px) skewX(-5deg)}to{transform:translateX(90px) skewX(6deg)}}
.br{transform-box:fill-box;transform-origin:50% 100%;animation:br ${D(7)} ease-in-out infinite alternate}
.b1{animation-duration:${D(9)}}.b2{animation-duration:${D(6)}}.b3{animation-duration:${D(11)}}
@keyframes br{from{transform:scaleY(.9)}to{transform:scaleY(1.08)}}
.fl{animation:fl ${D(4.5)} ease-in-out infinite alternate}.f1{animation-delay:-1.5s}.f2{animation-delay:-3s}.f3{animation-delay:-2.2s}
@keyframes fl{from{opacity:.7}to{opacity:1}}
.ray{animation:ry ${D(6)} linear infinite}@keyframes ry{to{transform:translateX(-160px)}}
.mt{fill:var(--mt)}.rim{fill:none;stroke:var(--a0);stroke-width:1.4;opacity:.45}
.tw{fill:#fff;opacity:var(--star);animation:tw 3.6s ease-in-out infinite alternate}
.t1{animation-delay:-.7s}.t2{animation-delay:-1.4s}.t3{animation-delay:-2.1s}.t4{animation-delay:-2.8s}
@keyframes tw{from{opacity:calc(var(--star) * .15)}to{opacity:var(--star)}}
.con path{fill:none;stroke:var(--a2);stroke-width:1;opacity:.55;stroke-dasharray:3 5}
.cs{fill:var(--a1)}
.cr{fill:none;stroke:var(--a1);stroke-width:1.5;transform-box:fill-box;transform-origin:center;animation:cr 2.4s ease-out infinite}
@keyframes cr{from{transform:scale(.3);opacity:.9}to{transform:scale(1.6);opacity:0}}
.cl{font:600 11px/1 Consolas,"Cascadia Mono",monospace;fill:var(--a1);letter-spacing:2px;opacity:.75}
.gr line{stroke:var(--grid);stroke-width:1;opacity:var(--go)}
.gl{stroke:var(--grid);stroke-width:1.2;opacity:0;animation:gm ${D(9)} cubic-bezier(.6,0,1,.5) infinite}
@keyframes gm{0%{transform:translateY(0);opacity:0}15%{opacity:.5}100%{transform:translateY(180px);opacity:.6}}
.hz{fill:var(--hz)}${storm ? '.hz{animation:st .9s ease-in-out infinite alternate}@keyframes st{from{opacity:.35}to{opacity:1}}' : ''}
.pt{fill:var(--a0);animation:pt ${D(7)} linear infinite}.p1{fill:var(--a1)}.p2{fill:var(--a2)}.p3{fill:#fff}
@keyframes pt{0%{transform:translateY(0);opacity:0}15%{opacity:.9}100%{transform:translateY(-420px);opacity:0}}
.vg{opacity:${vig}}.v0{stop-color:var(--vig);stop-opacity:0}.v1{stop-color:var(--vig)}
@media (prefers-reduced-motion:reduce){*{animation:none!important}}`

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 1000" preserveAspectRatio="xMidYMid slice" width="100%" height="100%"><style>${style}</style><defs>`
    + `<linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" class="s0"/><stop offset=".55" class="s1"/><stop offset=".82" class="s2"/></linearGradient>`
    + ``
    + `<pattern id="gaps" width="160" height="1700" patternUnits="userSpaceOnUse" y="-400">${rayLines}</pattern>`
    + `<filter id="vb" filterUnits="userSpaceOnUse" x="-500" y="-400" width="2600" height="1700"><feGaussianBlur stdDeviation="4 85"/><feComponentTransfer><feFuncA type="linear" slope="4"/></feComponentTransfer></filter><filter id="eb" filterUnits="userSpaceOnUse" x="-500" y="-400" width="2600" height="1700"><feGaussianBlur stdDeviation="3 10"/></filter><linearGradient id="alt" gradientUnits="userSpaceOnUse" x1="0" y1="820" x2="0" y2="0"><stop offset="0" class="a0"/><stop offset=".3" class="a0"/><stop offset=".55" class="a1"/><stop offset=".8" class="a2" stop-opacity=".7"/><stop offset="1" class="a2" stop-opacity="0"/></linearGradient>`
    + `<filter id="gl" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="3" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>`
    + `<radialGradient id="vig" cx=".5" cy=".45" r=".75"><stop offset=".45" class="v0"/><stop offset="1" class="v1"/></radialGradient>`
    + `<linearGradient id="hzg" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".5" stop-color="#fff"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>`
    + `<mask id="hzm"><rect y="${H - 6}" width="1600" height="12" fill="url(#hzg)"/></mask>`
    + defs + `</defs>`
    + `<rect width="1600" height="1000" fill="url(#sky)"/>`
    + `<g>${starDots}</g>`
    + `<g class="au">${body}</g>`
    + `<path class="mt" d="${ridge}"/><path class="rim" d="${ridge.replace(/L1650 822Z$/, '').replace(/^M-50 822/, 'M-50 800')}" filter="url(#gl)"/>`
    + `<g class="con" filter="url(#gl)"><path d="${conLine}"/>${con}</g>`
    + `<g class="gr">${grid}${hl}</g>`
    + `<rect class="hz" y="${H - 3}" width="1600" height="6" mask="url(#hzm)" filter="url(#gl)"/>`
    + `<g filter="url(#gl)">${parts}</g>`
    + `<rect class="vg" width="1600" height="1000" fill="url(#vig)"/>`
    + `</svg>`
}

/** The scene for a set of bands: what the backdrop redraws from. */
export function sceneFromBands(bands) {
  return buildScene({
    context: [10, 50, 75, 90][bands.contextBand] ?? 10,
    effort: EFFORTS[bands.effortLevel] ?? 'medium',
    focusMin: [0, 15, 30, 45][bands.focusStage] ?? 0,
    sessionsToday: bands.stars,
  })
}
