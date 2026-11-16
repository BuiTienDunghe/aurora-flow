// The desktop and mobile band: one SVG strip with the pet acting in its scene on a neon ground, its status
// line, and a pixel HUD window (HP, MP, ST, plus effort, flow and today's session). Light and dark by
// prefers-color-scheme. Pure: register.tsx hands it what to draw.
import type { Hud } from '../types'
import { AURORA } from './aurora-scene.js'
import { BAR_W, barCanvas, hudRows } from './hud'
import type { Hud as PetHud, HudLook } from './hud'
import { HEIGHT, canvas, encodeSvg, overlay } from './pixels'
import type { Canvas } from './pixels'
import { GROUND_H } from './scene'
import { formatFlow, formatTokens } from './hud-svg.js'

/** The pet area's width, in pet pixels; each is DESK_SCALE CSS pixels on screen. */
export const DESK_PX = 120
export const DESK_SCALE = 4
export const DESK_W = 860
export const DESK_H = 96

const EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max']
const PET_TOP = 4
const HUD_X = DESK_PX * DESK_SCALE + 12

const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] as string)

/** The `<path>`s of a canvas, without the `<svg>` around them. */
export function pixelPaths(c: Canvas) {
  return encodeSvg(c).replace(/^<svg[^>]*>/, '').replace(/<\/svg>$/, '')
}

/** A band with no scene: the pet alone on an empty canvas DESK_PX wide, from column `left`. */
export function bareBand(picture: Canvas, left: number): Canvas {
  const c = canvas(DESK_PX, HEIGHT + GROUND_H)
  overlay(c, picture, left)

  return c
}

type Pair = [number, number]
const GREEN: Pair = [0x166534, 0x4ade80]
const YELLOW: Pair = [0xa16207, 0xfacc15]
const RED: Pair = [0x991b1b, 0xf87171]
const BLUE: Pair = [0x3b5bdb, 0xa78bfa]
const GOLD: Pair = [0xb45309, 0xfbbf24]
const pairOf = (fill: [string, string] | undefined, fallback: Pair): Pair =>
  fill ? [parseInt(fill[0].slice(1), 16), parseInt(fill[1].slice(1), 16)] : fallback

/** A bar's fill, as hud.ts picks it: the warning colors win over the pet's own. */
export function barFill(key: string, pet: PetHud, look: HudLook): Pair {
  if (key === 'hp') {
    return pet.hp > 50 ? pairOf(look.hp ? look.hp.fill : undefined, GREEN) : pet.hp > 25 ? YELLOW : RED
  }
  if (key === 'mp') {
    return (pet.mp ?? 100) < 15 ? RED : pairOf(look.mp ? look.mp.fill : undefined, BLUE)
  }

  return (pet.st ?? 100) < 15 ? RED : pairOf(look.st ? look.st.fill : undefined, GOLD)
}

export type DeskInput = {
  /** The pet in its scene (or bare), DESK_PX wide and HEIGHT + GROUND_H tall. */
  band: Canvas
  /** Whether the pet's theme drew its own ground; without one the strip draws a neon line. */
  hasGround: boolean
  /** The status line, or '' for none. */
  line: string
  lineColor: string
  /** HP, MP and ST, absent before the first usage reading. */
  pet: PetHud | undefined
  look: HudLook
  /** The session's figures: tokens, effort, flow, sessions today, model. */
  session: Hud
  /** 0 to 3, as the backdrop's context band: tints the frame and the ground. */
  contextBand: number
}

/** The strip, DESK_W by DESK_H. */
export function deskStrip(i: DeskInput): string {
  const cb = Math.max(0, Math.min(3, i.contextBand))
  const storm = cb === 3
  const tint = (mode: 'light' | 'dark', t: string[]) => {
    const a = AURORA[mode][cb] as string[]
    return `--a0:${a[0]};--a1:${a[1]};--a2:${a[2]};--t1:${t[0]};--t2:${t[1]};--t3:${t[2]};--panel:${t[3]};--halo:${t[4]};--tr:${t[5]}`
  }
  const light = tint('light', ['#0b1526', '#33435a', '#5a6a80', '#f8fafd', 'rgba(255,255,255,.9)', 'rgba(11,21,38,.14)'])
  const dark = tint('dark', ['#e6f1ff', '#b8c9e2', '#8ea2c0', '#0b1222', 'rgba(3,6,14,.85)', 'rgba(230,241,255,.14)'])
  const frame = i.look.frame

  // the pet
  const pet = `<g transform="translate(0 ${PET_TOP}) scale(${DESK_SCALE})" shape-rendering="crispEdges">${pixelPaths(i.band)}</g>`
  const groundY = PET_TOP + HEIGHT * DESK_SCALE + 2
  let ticks = ''
  for (let x = 8; x < DESK_PX * DESK_SCALE; x += 32) {
    ticks += `<rect x="${x}" y="${groundY + 5}" width="12" height="1.5" class="tick"/>`
  }
  const ground = i.hasGround ? '' : `<rect x="0" y="${groundY}" width="${DESK_PX * DESK_SCALE}" height="2.5" rx="1.2" fill="url(#gr)" filter="url(#gw)"/>${ticks}`
  const shown = i.line.length > 58 ? `${i.line.slice(0, 57)}…` : i.line
  const line = shown ? `<text x="6" y="17" class="ln" style="fill:${esc(i.lineColor)}">› ${esc(shown)}</text>` : ''

  // the HUD window's bars
  const rows = i.pet ? hudRows(i.pet, i.look) : []
  const rowH = 20
  const top = 12 + (3 - Math.max(1, rows.length)) * (rowH / 2)
  let bars = ''
  rows.forEach((r, k) => {
    const y = top + k * rowH
    const pct = r.key === 'hp' ? (i.pet as PetHud).hp : r.key === 'mp' ? ((i.pet as PetHud).mp ?? 0) : ((i.pet as PetHud).st ?? 0)
    const bar = barCanvas(pct, barFill(r.key, i.pet as PetHud, i.look))
    const reading = r.parts.find(p => p.bold)
    const details = r.parts.filter(p => p !== reading).map(p => p.text.trim()).filter(Boolean)
    if (r.key === 'hp') {
      if (i.session.context === null) {
        details.unshift('chờ phản hồi')
      } else if (i.session.tokens !== null) {
        details.unshift(`${formatTokens(i.session.tokens)}/${formatTokens(i.session.window)}`)
      }
      if (storm && !details.includes('/compact')) {
        details.push('/compact')
      }
    }
    bars += `<text x="${HUD_X + 12}" y="${y + 13}" class="lb" style="fill:${esc(r.color)}">${esc(r.label.trim())}</text>`
      + `<g transform="translate(${HUD_X + 62} ${y + 4}) scale(${128 / BAR_W} 5)" shape-rendering="crispEdges">${pixelPaths(bar)}</g>`
      + (reading ? `<text x="${HUD_X + 198}" y="${y + 13}" class="rd" style="fill:${esc(reading.color)}">${esc(reading.text.trim())}</text>` : '')
      + (details.length ? `<text x="${HUD_X + 240}" y="${y + 13}" class="dt">${esc(details.join(' · '))}</text>` : '')
  })
  if (rows.length === 0) {
    bars = `<text x="${HUD_X + 12}" y="${top + 13}" class="lb" style="fill:#f87171">♥ HP</text><text x="${HUD_X + 62}" y="${top + 13}" class="dt">chờ phản hồi</text>`
  }

  // effort, flow, today's session, model
  const el = typeof i.session.effort === 'string' ? EFFORTS.indexOf(i.session.effort) : -1
  const infoY = DESK_H - 12
  let segs = ''
  for (let k = 0; k < 5; k++) segs += `<rect x="${HUD_X + 64 + k * 9}" y="${infoY - 7}" width="7" height="7" class="${k <= el ? 'on' : 'off'}"/>`
  const stage = i.session.focusMin >= 45 ? 3 : i.session.focusMin >= 30 ? 2 : i.session.focusMin >= 15 ? 1 : 0
  let dots = ''
  for (let k = 0; k < 4; k++) dots += `<rect x="${HUD_X + 176 + k * 8}" y="${infoY - 6}" width="5" height="5" class="${k <= stage ? 'don' : 'off'}"/>`
  const model = (i.session.model ?? '').replace(/^claude-/, '').slice(0, 14)
  const info = `<text x="${HUD_X + 12}" y="${infoY}" class="ik">⚡${esc(i.session.effort ? i.session.effort.toUpperCase() : '—')}</text>${segs}`
    + `<text x="${HUD_X + 118}" y="${infoY}" class="ik">⏱${formatFlow(i.session.focusMin)}</text>${dots}`
    + `<text x="${HUD_X + 214}" y="${infoY}" class="ik">✦#${i.session.sessionsToday}</text>`
    + (model ? `<text x="${DESK_W - 10}" y="${infoY}" text-anchor="end" class="md">${esc(model)}</text>` : '')

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${DESK_W} ${DESK_H}" width="${DESK_W}" height="${DESK_H}"><style>
svg{${light}}@media (prefers-color-scheme:dark){svg{${dark}}}
.s0{stop-color:var(--a0)}.s1{stop-color:var(--a1)}.s2{stop-color:var(--a2)}
.tick{fill:var(--a1);opacity:.35}
.ln{font:700 12.5px Consolas,"Cascadia Mono",monospace;paint-order:stroke;stroke:var(--halo);stroke-width:3px;stroke-linejoin:round}
.win{fill:var(--panel);fill-opacity:.82;stroke:${frame ? esc(frame) : 'var(--a1)'};stroke-width:2}
.lb{font:700 12px Consolas,"Cascadia Mono",monospace}
.rd{font:700 12px Consolas,"Cascadia Mono",monospace}
.dt{font:500 10.5px Consolas,"Cascadia Mono",monospace;fill:var(--t3)}
.ik{font:700 10.5px Consolas,"Cascadia Mono",monospace;fill:var(--t2)}
.md{font:600 10.5px Consolas,"Cascadia Mono",monospace;fill:var(--t3)}
.sep{stroke:var(--tr)}
.on{fill:var(--a1)}.don{fill:var(--a0)}.off{fill:var(--tr)}
${storm ? '.win{stroke:#f43f5e;animation:pz 1s ease-in-out infinite alternate}@keyframes pz{from{stroke-opacity:.45}to{stroke-opacity:1}}' : ''}
@media (prefers-reduced-motion:reduce){*{animation:none!important}}
</style><defs>
<linearGradient id="gr" x1="0" x2="1"><stop offset="0" class="s0" stop-opacity="0"/><stop offset=".25" class="s0"/><stop offset=".7" class="s1"/><stop offset="1" class="s2" stop-opacity="0"/></linearGradient>
<filter id="gw" x="-10%" y="-200%" width="120%" height="500%"><feGaussianBlur stdDeviation="2.5" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
</defs>
${ground}${pet}${line}
<rect x="${HUD_X}" y="3" width="${DESK_W - HUD_X - 3}" height="${DESK_H - 6}" rx="7" class="win"/>
${bars}
<line x1="${HUD_X + 10}" y1="${infoY - 15}" x2="${DESK_W - 10}" y2="${infoY - 15}" class="sep"/>
${info}
</svg>`
}

