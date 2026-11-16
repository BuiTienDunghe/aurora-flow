import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, ThemeSetArgs } from 'claude-code'

import type { Anim, Bands, Flow, Hud, Mode } from '../types'
import { TICK_MS, fail, leapClipMs, step } from './anim'
import { sceneBands, sceneFromBands } from './aurora-scene.js'
import { DESK_PX, bareBand, deskStrip } from './desk'
import { BAR_W, HUD_WINDOW_W, frameColor, hudFrom, hudRows, mood, windowEdges } from './hud'
import type { Hud as PetHud } from './hud'
import { contextBandOf, hudLine } from './hud-svg.js'
import { makeColors } from './make-colors.js'
import { minisOnScreen, reconcile } from './minis'
import type { Mini } from './minis'
import { BODY_W, FACES, HEIGHT, MAX_MINIS, compose, crop, encodeCells, trailWidth } from './pixels'
import type { Body } from './pixels'
import { previewPage } from './preview'
import { GROUND_H, drawBand, layScene, obstacleSpans } from './scene'
import type { SceneLayout } from './scene'
import { readSettings } from './settings'
import { lineColor, lineWidth, statusLine, targetOf, toolMode } from './status'
import type { ToolMode } from './status'
import { animate, readTheme, restingFrame } from './theme'

// Aurora Flow + Pixel Pet, for the Claude Desktop app first.
//   Backdrop: an aurora over a tech horizon. Context fill → hue, effort → motion, focus time → contrast,
//             sessions today → stars.
//   Band above the prompt: a pixel pet that acts out each tool call (from pixel-pet by halluqinate, MIT),
//             beside a pixel HUD window: HP (context left), MP (5-hour limit), ST (7-day limit), effort, flow,
//             today's session. On the desktop and mobile apps it is one SVG strip; on the terminal the pet's
//             own text-cell band and HUD.

const SCENE_NAME = 'aurora-flow'
const IDLE_MS = 10 * 60_000 // a gap longer than this ends a run of focus
const EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max']

// The pet's terminal layout, as pixel-pet lays it out.
const ROWS = 10 // a cell is two pixels tall, so the frames are 20 px high
const GROUND_ROWS = GROUND_H / 2
const STATUS_ROOM = 20 // columns kept free beside a running pet for its status line
const USAGE_EVERY_BEATS = 20 // 2 s
const AGENTS_EVERY_BEATS = 5
const FOCUS_EVERY_BEATS = 300 // 30 s
const SLOW_BEATS: Partial<Record<Mode, number>> = { idle: 2, sleep: 4 } // ticks per redraw while nothing moves fast

const THEME_KEY = 'theme' // in $.store: the pet theme set_theme last took
// /pet-off and /pet-on write this file beside the mod: `off` hides the pet in every session. A file, read from disk
// each time, so a session already open sees another session's switch; every PET_EVERY_BEATS it looks again.
const PET_FILE = '.pet-state'
const PET_EVERY_BEATS = 20 // 2 s
const OWN_TOOLS = 'mcp__aurora-flow__'
// Literals, so `claude plugin validate` can read the hooks' matchers.
const SET_THEME = 'mcp__aurora-flow__set_theme'
const PREVIEW_THEME = 'mcp__aurora-flow__preview_theme'
const GET_THEME = 'mcp__aurora-flow__get_theme'

const EMPTY_HUD: Hud = {
  context: null,
  tokens: null,
  window: null,
  effort: null,
  model: null,
  focusMin: 0,
  sessionsToday: 1,
}
const FIRST_BANDS: Bands = { contextBand: 0, effortLevel: 1, focusStage: 0, stars: 1 }

const hud = atom({ plugin: 'aurora-flow', key: 'hud' } as const, EMPTY_HUD)
const bands = atom({ plugin: 'aurora-flow', key: 'bands' } as const, FIRST_BANDS)
const flow = atom({ plugin: 'aurora-flow', key: 'flow' } as const, { start: 0, lastActive: 0 } as Flow)
const isHudHidden = atom({ plugin: 'aurora-flow', key: 'isHudHidden' } as const, false)
const isPetOff = atom({ plugin: 'aurora-flow', key: 'isPetOff' } as const, false)
const anim = atom({ plugin: 'aurora-flow', key: 'anim' } as const, {
  mode: 'idle',
  since: 0,
  x: 0,
  dir: 1,
  tick: 0,
  target: '',
  working: false,
} as Anim)

// Teal accent, lime strings, violet literals, amber variables, rose names.
const palette = (contrast?: 'more') =>
  makeColors({
    label: 'Aurora Flow',
    contrast,
    roles: { accent: '#2dd4bf', danger: '#fb7185', success: '#a3e635', warning: '#fbbf24', pro: '#a78bfa' },
    light: {
      gray: {
        anchors: {
          'surface-0': '#e8eef8',
          'surface-1': '#eff4fa',
          'surface-2': '#f8fafd',
          'text-primary': '#0b1526',
          'text-secondary': '#33435a',
          'text-muted': '#4a5a70',
        },
      },
    },
    dark: {
      gray: {
        anchors: {
          'surface-0': '#060b16',
          'surface-1': '#0a1120',
          'surface-2': '#0e172a',
          'surface-3': '#111b31',
          'text-primary': '#e6f1ff',
          'text-secondary': '#b8c9e2',
          'text-muted': '#8ea2c0',
        },
      },
    },
  })
const calm = palette()
const focused = palette('more')

const lookFor = (isFocused: boolean): ThemeSetArgs => ({
  colors: (isFocused ? focused : calm).theme,
  // A light frost, so the aurora reads through the panels.
  backdrop: { scene: SCENE_NAME, glass: { blur: 3, opacity: 0.34 } },
})

const sameBands = (a: Bands, b: Bands) =>
  a.contextBand === b.contextBand && a.effortLevel === b.effortLevel && a.focusStage === b.focusStage && a.stars === b.stars

// ── the session's figures and the backdrop's bands ──

/** Moves the backdrop to the bands the figures fall in; a no-op inside a band. */
async function syncBands($: EngineInterface, cur: Hud): Promise<void> {
  const effort = cur.effort === null ? 'medium' : EFFORTS.includes(cur.effort) ? cur.effort : 'high'
  const next = sceneBands({ context: cur.context ?? 0, effort, focusMin: cur.focusMin, sessionsToday: cur.sessionsToday })
  const current = await read($, bands)

  if (sameBands(current, next)) {
    return
  }
  await update($, bands, () => next)

  // 45 minutes of focus: the UI takes the design system's stronger contrast too.
  if ((next.focusStage === 3) !== (current.focusStage === 3)) {
    await $.theme.set(lookFor(next.focusStage === 3))
  }
}

/** Marks activity; a gap over IDLE_MS starts a new run of focus. */
async function touch($: EngineInterface): Promise<void> {
  const now = await $.clock.now()

  await update($, flow, f =>
    f.start === 0 || now - f.lastActive > IDLE_MS ? { start: now, lastActive: now } : { start: f.start, lastActive: now },
  )
}

async function focusMinutes($: EngineInterface): Promise<number> {
  const now = await $.clock.now()
  const f = await read($, flow)

  if (f.start === 0 || now - f.lastActive > IDLE_MS) {
    return 0
  }

  return Math.floor((now - f.start) / 60_000)
}

/** The pet's HP, MP and ST from fresh usage, and the context figures into the session's HUD; `last` when the call fails. */
async function readUsage($: EngineInterface, now: number, last: PetHud | undefined): Promise<PetHud | undefined> {
  try {
    const usage = await $.session.usage()
    const context = usage.context.percent ?? null
    const tokens = usage.context.tokens ?? null
    const window = usage.context.window
    const cur = await read($, hud)

    if (cur.context !== context || cur.tokens !== tokens || cur.window !== window) {
      await syncBands($, await update($, hud, prev => ({ ...prev, context, tokens, window })))
    }

    return hudFrom(usage, now)
  } catch {
    return last
  }
}

/** The focus clock into the session's HUD, then the bands. */
async function refreshFocus($: EngineInterface): Promise<void> {
  const focusMin = await focusMinutes($)
  const cur = await read($, hud)

  if (cur.focusMin !== focusMin) {
    await syncBands($, await update($, hud, prev => ({ ...prev, focusMin })))
  }
}

/** Counts this session among today's, once per session id, in the cross-session store. */
async function countSession($: EngineInterface): Promise<number> {
  const d = new Date(await $.clock.now())
  const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  const id = await $.session.id()
  const saved = (await $.store.get('days')) as { date?: string; ids?: string[] } | undefined
  const ids = saved?.date === today && Array.isArray(saved.ids) ? saved.ids : []
  const next = ids.includes(id) ? ids : [...ids, id].slice(-50)

  await $.store.set('days', { date: today, ids: next })

  return next.length
}

// ── the pet ──

/** Whether /pet-off, from any session, has the pet off: the shared file says `off`. No file, or none readable, is on. */
async function petOffOnDisk($: EngineInterface): Promise<boolean> {
  try {
    return (await $.fs.read(`${$.plugin.root}/${PET_FILE}`)).trim() === 'off'
  } catch {
    return false
  }
}

/** Brings this session's isPetOff in line with the shared file; returns it. */
async function syncPetOff($: EngineInterface): Promise<boolean> {
  const off = await petOffOnDisk($)
  if ((await read($, isPetOff)) !== off) {
    await update($, isPetOff, () => off)
  }

  return off
}

/** /pet-off and /pet-on: the shared file for every session, and this one at once. */
async function switchPet($: EngineInterface, off: boolean): Promise<string> {
  try {
    await $.fs.write(`${$.plugin.root}/${PET_FILE}`, off ? 'off\n' : 'on\n')
  } catch (err) {
    return `Không ghi được trạng thái pet chung (${err instanceof Error ? err.message : String(err)}), nên chỉ phiên này ${off ? 'tắt' : 'bật'} pet.`
  }
  await update($, isPetOff, () => off)
  if (!off) {
    await update($, isHudHidden, () => false)
  }

  return off
    ? 'Đã tắt pet và HUD ở mọi phiên. Các phiên đang mở ẩn trong vòng 2 giây, phiên mới mở cũng tắt sẵn. Nền cực quang vẫn chạy. Gõ /pet-on để bật lại.'
    : 'Đã bật pet và HUD ở mọi phiên. Các phiên đang mở hiện lại trong vòng 2 giây. Gõ /pet-off để tắt.'
}

/** The minis after a fresh look at the session's agents, or `last` when the list call fails. */
async function minisOr($: EngineInterface, now: number, last: Mini[]) {
  try {
    return reconcile(last, await $.agent.list(), now)
  } catch {
    return last
  }
}

/** What preview_theme and set_theme tell Claude about a theme's pet: the clips and faces made, the resting frame, and readTheme's notes. */
function themeReport(pet: Body, notes: string[]) {
  const made = `${Object.keys(pet.clips).join(', ')}, and ${FACES.length} faces`
  const noted = notes.length > 0 ? `\n\nNotes, to act on or leave as drawn:\n- ${notes.join('\n- ')}` : ''

  return `The mod made every clip and face from the sprite: ${made}.\n\nResting frame (@ is a pupil, * a cheek):\n${restingFrame(pet)}${noted}`
}

/** The default slime theme, from the plugin's own file. */
async function slimeBody($: EngineInterface) {
  const theme = readTheme(JSON.parse(await $.fs.read(`${$.plugin.root}/assets/slime.json`)))
  if (theme.errors) {
    throw new Error(`assets/slime.json: ${theme.errors.join(' ')}`)
  }

  return animate(theme.theme)
}

/** The theme set_theme kept in an earlier session, else the slime. A kept theme this version cannot read gives way to the slime, with a toast. */
async function keptBody($: EngineInterface) {
  const kept = await $.store.get(THEME_KEY)
  if (kept !== undefined) {
    const theme = readTheme(kept)
    if (!theme.errors) {
      return animate(theme.theme)
    }
    $.ui.toast(`Aurora Flow: your pet theme no longer reads (${theme.errors[0]}). Showing the slime.`)
  }

  return slimeBody($)
}

export const register: Register = (on, options) => {
  const settings = readSettings(options)
  let isWorking = false
  let lastToolAt = 0
  let activeTools = 0
  let activeMode: ToolMode = 'bash'
  let activeTarget = ''
  let bodyColumns = 80
  let onDesk = false // a desktop or mobile band was drawn: the pet runs in the strip's DESK_PX
  let beat = 0
  let showsError = false
  let body: Body | undefined
  let petHud: PetHud | undefined
  let minis: Mini[] = []
  let previewed: unknown // the last theme preview_theme drew, for set_theme to apply without resending it
  let layout: SceneLayout | undefined // the scene of `layoutOf` on a band `bandWidth()` wide
  let layoutOf: Body | undefined

  // The terminal band leaves the last column free, so a full row never wraps. The strip is DESK_PX wide.
  const bandWidth = () => (onDesk ? DESK_PX : Math.max(BODY_W, bodyColumns - 1))
  /** The layout of the pet's scene on the band as wide as it is now, or undefined for a pet with no scene. */
  const sceneLayout = (pet: Body) => {
    if (!pet.scene) {
      return undefined
    }
    if (layout?.width !== bandWidth() || layoutOf !== pet) {
      layout = layScene(pet.scene, bandWidth())
      layoutOf = pet
    }
    return layout
  }

  on('session.start', async ($, e, next) => {
    // While building: the one line that would stop Desktop painting the look.
    const unpainted = calm.problems.find(line => line.startsWith("Desktop won't paint"))
    if (unpainted !== undefined) {
      $.ui.toast(unpainted)
    }

    const now = await $.clock.now()
    const sessionsToday = await countSession($)
    await update($, hud, cur => ({ ...cur, sessionsToday }))
    await touch($)
    await update($, anim, () => ({ mode: 'idle', since: now, x: 0, dir: 1, tick: 0, target: '', working: false }))

    const set = await $.theme.set(lookFor((await read($, bands)).focusStage === 3))
    if (!set.isDrawn) {
      $.ui.status(set.reason)
    }
    await $.command.register({
      name: 'aurora',
      description: 'Aurora Flow: show or hide the pet and HUD band in this session, and read its figures',
    })
    await $.command.register({ name: 'pet-off', description: 'Aurora Flow: turn the pet and HUD off in every session' })
    await $.command.register({ name: 'pet-on', description: 'Aurora Flow: turn the pet and HUD back on in every session' })
    await syncPetOff($)
    try {
      await $.tool.register({
        name: 'preview_theme',
        description:
          'Writes the preview of an Aurora Flow pet theme to `path`: an HTML page with every motion, face, status line, and HUD look of its pet, and the pet running through its scene. It does not change what is on screen. `theme` is in the format the `aurora-flow:pixel-pet` skill describes. Returns the resting frame and notes on anything repaired.',
        inputSchema: {
          type: 'object',
          properties: {
            theme: { type: 'object', description: 'The theme as a JSON object, in the format FORMAT.md documents.' },
            path: { type: 'string', description: 'Absolute path of the HTML file to write, such as one in the temp folder.' },
          },
          required: ['theme', 'path'],
        },
      })
      await $.tool.register({
        name: 'set_theme',
        description:
          'Sets the Aurora Flow pet theme: the pet, its props, minis, status lines, HUD look, and scene, at once, kept for later sessions. `theme` is in the format the `aurora-flow:pixel-pet` skill describes, or null for the default slime. Leave `theme` out to set the last theme preview_theme drew in this session. Returns the resting frame and notes on anything repaired.',
        inputSchema: {
          type: 'object',
          properties: { theme: { type: ['object', 'null'], description: 'The theme as a JSON object, null for the default slime, or left out for the last preview.' } },
        },
      })
      await $.tool.register({
        name: 'get_theme',
        description:
          "Returns the Aurora Flow pet theme on screen: the one set_theme kept, or the default slime's. Start a change from it, so set_theme keeps everything the change leaves alone.",
        inputSchema: { type: 'object', properties: {} },
      })
    } catch {
      // Without the tools the pet still draws; only changing its theme is missing.
    }
    petHud = await readUsage($, now, undefined)
    await refreshFocus($)

    $.clock.every(TICK_MS, async () => {
      const t = await $.clock.now()
      beat += 1
      if (beat % USAGE_EVERY_BEATS === 0) {
        petHud = await readUsage($, t, petHud)
      }
      if (beat % FOCUS_EVERY_BEATS === 0) {
        await refreshFocus($)
      }
      const off = beat % PET_EVERY_BEATS === 0 ? await syncPetOff($) : await read($, isPetOff)
      // A hidden pet costs nothing: no agent polling, no steps, no redraws. The backdrop's figures above still run.
      if (off || (await read($, isHudHidden))) {
        return
      }
      if (settings.minis && beat % AGENTS_EVERY_BEATS === 0) {
        minis = await minisOr($, t, minis)
      }

      const trail = trailWidth(minis.length)
      const room = onDesk
        ? Math.max(0, DESK_PX - BODY_W - trail)
        : Math.max(0, bodyColumns - BODY_W - trail - STATUS_ROOM)
      const scene = body && sceneLayout(body)
      const obstacles = scene ? obstacleSpans(scene) : []
      await update($, anim, a => {
        const moved = step(a, { isWorking, activeTools, activeMode, activeTarget, lastToolAt, room, obstacles, trail }, t, settings)
        // Minis hop on every tick, so they keep the redraw rate up while the pet idles.
        const slowBeat = minis.length > 0 ? undefined : SLOW_BEATS[moved.mode]
        return slowBeat !== undefined && moved.mode === a.mode && beat % slowBeat !== 0 ? a : moved
      })
    })

    return next(e)
  })

  on('prompt.submit', async ($, e, next) => {
    await touch($)

    return next(e)
  })

  // Each main-loop request names its model and effort. turn.step streams, so the
  // hook is an async generator that forwards the stream beneath untouched.
  on('turn.step', async function* ($, e, next) {
    if (e.agentId === undefined) {
      const effort = typeof e.effort === 'string' ? e.effort : typeof e.effort === 'number' ? 'custom' : null
      const cur = await read($, hud)

      if (cur.effort !== effort || cur.model !== e.model) {
        await syncBands($, await update($, hud, prev => ({ ...prev, effort, model: e.model })))
      }
      await touch($)
    }

    return yield* next(e)
  })

  on('turn.complete', async ($, e, next) => {
    const result = await next(e)

    await touch($)
    petHud = await readUsage($, await $.clock.now(), petHud)
    await refreshFocus($)

    return result
  })

  on('command.run', { command: 'aurora' }, async $ => {
    const cur = await read($, hud)
    if (await syncPetOff($)) {
      return { text: `Pet đang tắt ở mọi phiên (/pet-off). Gõ /pet-on để bật lại. ${hudLine(cur)}` }
    }
    const hidden = await update($, isHudHidden, v => !v)

    return { text: `${hidden ? 'Đã ẩn' : 'Đã hiện'} pet và HUD của Aurora Flow trong phiên này. ${hudLine(cur)}` }
  })

  on('command.run', { command: 'pet-off' }, async $ => ({ text: await switchPet($, true) }))
  on('command.run', { command: 'pet-on' }, async $ => ({ text: await switchPet($, false) }))

  // ── the pet's tools, and what tool calls make it do ──

  on('tool.call', async ($, e, next) => {
    if (e.tool.startsWith(OWN_TOOLS)) {
      return next(e)
    }
    const t = await $.clock.now()
    activeTools += 1
    activeMode = toolMode(e.tool)
    const input = e as unknown as Record<string, unknown>
    activeTarget = settings.targets ? targetOf(e.tool, input) : ''
    lastToolAt = t

    let result: Awaited<ReturnType<typeof next>>
    try {
      result = await next(e)
    } finally {
      activeTools = Math.max(0, activeTools - 1)
      lastToolAt = await $.clock.now()
    }
    if ('deny' in result || ('isError' in result && result.isError)) {
      await update($, anim, a => fail(a, lastToolAt))
    }

    return result
  })

  on('tool.call', { tool: PREVIEW_THEME }, async ($, e) => {
    const { theme, path } = e as unknown as { theme?: unknown; path?: unknown }
    const got = readTheme(theme)
    if (got.errors) {
      return { deny: `No preview was written: ${got.errors.join(' ')}` }
    }
    if (typeof path !== 'string' || path === '') {
      return { deny: 'No preview was written: `path` is the HTML file to write.' }
    }
    const preview = animate(got.theme)
    await $.fs.write(path, previewPage(preview, got.notes))
    previewed = theme

    return { result: `Wrote the preview of ${got.theme.name} to ${path}. What is on screen has not changed.\n\n${themeReport(preview, got.notes)}` }
  })

  on('tool.call', { tool: GET_THEME }, async $ => {
    const kept = await $.store.get(THEME_KEY)
    if (kept === undefined) {
      return { result: `No theme is kept, so the slime is on screen. Its theme:\n\n${await $.fs.read(`${$.plugin.root}/assets/slime.json`)}` }
    }

    return { result: `The theme set_theme kept:\n\n${JSON.stringify(kept, null, 2)}` }
  })

  on('tool.call', { tool: SET_THEME }, async ($, e) => {
    const given = (e as unknown as { theme?: unknown }).theme
    if (given === undefined && previewed === undefined) {
      return { deny: 'The theme was not set: no preview_theme call in this session to apply. Pass `theme`.' }
    }
    const value = given === undefined ? previewed : given
    if (value === null) {
      await $.store.delete(THEME_KEY)
      body = await slimeBody($)
      $.ui.invalidate('ui.render')

      return { result: 'The slime is back, for this session and later ones.' }
    }
    const got = readTheme(value)
    if (got.errors) {
      return { deny: `The theme was not set: ${got.errors.join(' ')}` }
    }
    await $.store.set(THEME_KEY, value)
    body = animate(got.theme)
    $.ui.invalidate('ui.render')

    return { result: `The ${got.theme.name} theme is on screen now, for this session and later ones.\n\n${themeReport(body, got.notes)}` }
  })

  // ── drawing ──

  on('ui.render', { component: 'Backdrop' }, async ($, e, next) => {
    if ((e.surface !== 'desktop' && e.surface !== 'mobile') || e.props.scene !== SCENE_NAME) {
      return next(e)
    }
    // Reads the bands alone, so the scene redraws only when one changes.
    const b = await read($, bands)
    const { Svg } = $.ui.resolve(e)

    return (
      <Svg
        source={sceneFromBands(b)}
        alt="Aurora curtains over a glowing tech horizon, colored by how full the context is"
        isInteractive
      />
    )
  })

  // The terminal's HUD window below the prompt, as pixel-pet draws it.
  on('ui.render', { component: 'PromptHint' }, async ($, e, next) => {
    if (!settings.hud || !petHud || e.surface !== 'terminal' || (await read($, isHudHidden)) || (await read($, isPetOff))) {
      return next(e)
    }
    if (!body) {
      body = await keptBody($)
    }
    const rows = hudRows(petHud, body.look.hud)
    if (rows.length === 0) {
      return next(e)
    }
    const { Box, Raster, Text } = $.ui.resolve(e)
    const edges = windowEdges(HUD_WINDOW_W)
    const frame = frameColor(body.look.hud)

    return (
      <Box flexDirection="column">
        {await next(e)}
        <Box flexDirection="column" marginLeft={1}>
          <Text color={frame}>{edges.top}</Text>
          {rows.map(r => (
            <Box key={r.key}>
              <Text color={frame}>{edges.side}</Text>
              <Box width={HUD_WINDOW_W - 2} paddingLeft={1}>
                <Text color={r.color}>{r.label} </Text>
                <Raster key={`bar-${r.key}`} columns={BAR_W} rows={1} cells={r.cells} />
                {r.parts.map((p, k) => (
                  <Text key={String(k)} color={p.color} bold={p.bold} wrap="truncate">
                    {p.text}
                  </Text>
                ))}
              </Box>
              <Text color={frame}>{edges.side}</Text>
            </Box>
          ))}
          <Text color={frame}>{edges.bottom}</Text>
        </Box>
      </Box>
    )
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    try {
      if (e.props.hasSurvey || (await read($, isHudHidden)) || (await read($, isPetOff))) {
        return next(e)
      }
      isWorking = e.props.isWorking
      bodyColumns = e.props.bodyColumns

      if (!body) {
        body = await keptBody($)
      }
      const a = await read($, anim)
      const now = await $.clock.now()
      const elapsed = now - a.since
      const views = minisOnScreen(minis, now)
      // A leap is the run mode playing the jump clip, slowed, while the pet travels.
      const drawn = a.leap ? { mode: 'jump' as const, ms: leapClipMs((now - a.leap.since) * settings.pace) } : { mode: a.mode, ms: elapsed * settings.pace }
      const picture = compose(body, drawn.mode, drawn.ms, a.dir, petHud ? mood(petHud) : 'ok', views)
      const extra = views.length > MAX_MINIS ? ` (+${views.length - MAX_MINIS} minis)` : ''
      const line = settings.statusLine ? statusLine(a.mode, a.since, elapsed, a.target, body.look.lines[a.mode]) + extra : ''
      if (showsError) {
        showsError = false
        $.ui.status(undefined)
      }

      // Desktop and mobile: one SVG strip, the pet in its scene beside the pixel HUD window.
      if (e.surface === 'desktop' || e.surface === 'mobile') {
        onDesk = true
        const { Svg } = $.ui.resolve(e)
        const session = await read($, hud)
        const scene = sceneLayout(body)
        const left = Math.max(0, Math.min(Math.round(a.x), DESK_PX - picture.w))
        const band = scene && body.scene ? drawBand(body, body.scene, scene, picture, left, now) : bareBand(picture, left)
        const source = deskStrip({
          band,
          hasGround: Boolean(body.scene?.ground),
          line,
          lineColor: lineColor(a.mode, body.look.lineColors),
          pet: settings.hud ? petHud : undefined,
          look: body.look.hud,
          session,
          contextBand: contextBandOf(session.context),
        })
        const hp = petHud ? `HP ${petHud.hp}%` : 'HP —'

        return <Svg source={source} alt={`${body.name}: ${line || a.mode}. ${hp}`} />
      }

      // The terminal: pixel-pet's text-cell band.
      const scene = sceneLayout(body)
      if (e.surface === 'terminal' && scene && body.scene) {
        const { Box, Raster, Text } = $.ui.resolve(e)
        const width = scene.width
        const textW = line ? lineWidth(line) + 3 : 0
        const left = Math.max(0, Math.min(Math.round(a.x), width - picture.w - textW))
        const band = drawBand(body, body.scene, scene, picture, left, now)
        const cells = (x: number, y: number, w: number, h: number) => encodeCells(crop(band, x, y, w, h))
        // The status line cuts a hole in the band; the band shows above, below, and right of it.
        const textAt = left + picture.w
        const shown = Math.min(textW, width - textAt)
        const rest = width - textAt - shown

        return (
          <Box flexDirection="column" height={ROWS + GROUND_ROWS}>
            <Box height={ROWS}>
              <Raster key="pet" columns={textAt} rows={ROWS} cells={cells(0, 0, textAt, HEIGHT)} />
              {shown > 0 && (
                <Box key="line" flexDirection="column" width={shown}>
                  <Raster key="above" columns={shown} rows={ROWS - 2} cells={cells(textAt, 0, shown, HEIGHT - 4)} />
                  <Text color={lineColor(a.mode, body.look.lineColors)} bold wrap="truncate">
                    {` › ${line}`}
                  </Text>
                  <Raster key="below" columns={shown} rows={1} cells={cells(textAt, HEIGHT - 2, shown, 2)} />
                </Box>
              )}
              {rest > 0 && <Raster key="rest" columns={rest} rows={ROWS} cells={cells(textAt + shown, 0, rest, HEIGHT)} />}
            </Box>
            <Raster key="ground" columns={width} rows={GROUND_ROWS} cells={cells(0, HEIGHT, width, GROUND_H)} />
          </Box>
        )
      }
      if (e.surface === 'terminal') {
        const { Box, Raster, Text } = $.ui.resolve(e)
        const room = Math.max(0, bodyColumns - picture.w - line.length - 4)

        return (
          <Box height={ROWS}>
            <Box marginLeft={Math.min(Math.round(a.x), room)} alignItems="flex-end">
              <Raster key="pet" columns={picture.w} rows={ROWS} cells={encodeCells(picture)} />
              {line && (
                <Box marginBottom={1} marginLeft={1}>
                  <Text color={lineColor(a.mode, body.look.lineColors)} bold>
                    › {line}
                  </Text>
                </Box>
              )}
            </Box>
          </Box>
        )
      }

      return next(e)
    } catch (err) {
      showsError = true
      $.ui.status(`Aurora Flow: ${String(err)}`)

      return next(e)
    }
  })
}
