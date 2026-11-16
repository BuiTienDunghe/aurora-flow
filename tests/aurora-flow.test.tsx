import type { On, SessionUsage, ThemeSetArgs } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'

const BAND = {
  plugin: 'aurora-flow',
  component: 'AbovePrompt',
  props: {
    hasSurvey: false,
    isCollapsed: false,
    isWorking: false,
    maxRows: 20,
    bodyColumns: 100,
    scroll: { offset: 0, bodyRows: 20 },
    view: {},
  },
} as const
const HINT = { plugin: 'aurora-flow', component: 'PromptHint', props: { isDraft: false, isWorking: false, hint: '⏵⏵ auto mode on' } } as const
const BACKDROP = {
  plugin: 'aurora-flow',
  component: 'Backdrop',
  props: { scene: 'aurora-flow', plugin: 'aurora-flow', glass: { blur: 3, opacity: 0.34 } },
} as const

const SLIME = {
  name: 'slime',
  scale: 0.8,
  sprite: ['...aaa...', '..afffa..', '.affffda.', 'afffffdda', '.aaaaaaa.'],
  palette: { a: '#1e3a8a', d: '#3d84f0', f: '#5aa9ff' },
  outline: 'a',
  eyes: [[2, 2], [6, 2]],
}
const CAT = { name: 'Mochi', sprite: ['k.....k', 'kkkkkkk', 'kwkkkwk', 'kkkkkkk'], palette: { k: '#e8a33d', w: '#fff4e0' }, eyes: [[0, 1], [4, 1]] }

const usage = (percent: number | undefined): SessionUsage => ({
  startedAt: 0,
  context: percent === undefined ? { window: 200_000 } : { window: 200_000, tokens: percent * 2000, percent },
  rateLimits: [{ kind: 'five_hour', percentUsed: 38 }],
  cost: { usd: 0 },
})

/** The engine beneath the mod: a clock, a store, a session whose context we set, and the engine's own drawing. */
function engine(on: On) {
  const clock = mock.clock(on, { now: new Date(2026, 10, 16, 9, 0).getTime() })
  mock.store(on)
  const looks: ThemeSetArgs[] = []
  const commands: string[] = []
  const state = { percent: undefined as number | undefined }

  on('theme.set', (_, e) => {
    looks.push(e)
    return { value: { isDrawn: true, requestId: 'look' } }
  })
  on('command.register', (_, e) => {
    commands.push(e.name)
    return { value: { command: e.name } }
  })
  on('session.id', () => ({ value: 'session-one' }))
  on('session.usage', () => ({ value: usage(state.percent) }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('prompt.submit', (_, e) => ({ text: e.text }))
  on('agent.list', () => ({ value: [] }))
  on('fs.read', () => ({ value: JSON.stringify(SLIME) }))
  on('ui.status', () => ({ value: undefined }))
  on('ui.toast', () => ({ value: undefined }))
  // the engine's own drawing, beneath the mod
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>engine</Text>
  })

  return { clock, looks, commands, state }
}

const DESK = { cwd: '/', surface: 'desktop', isInteractive: true } as const
const TERM = { cwd: '/', surface: 'terminal', isInteractive: true } as const

async function strip(mount: () => Promise<{ find: (q: { type: string }) => Promise<{ props: Record<string, unknown> } | undefined>; unmount: () => Promise<void> }>) {
  const ui = await mount()
  const source = String((await ui.find({ type: 'Svg' }))?.props.source)
  await ui.unmount()
  return source
}

test('desktop: the aurora look, /aurora, and one strip with the pet beside the pixel HUD', async ($, on) => {
  const { looks, commands } = engine(on)
  await $.session.start(DESK)

  expect(looks.length).toBe(1)
  const backdrop = looks[0]!.backdrop as { scene: string; glass: { opacity: number } }
  expect(backdrop.scene).toBe('aurora-flow')
  expect(backdrop.glass.opacity).toBe(0.34)
  expect(Object.keys((looks[0]!.colors as { inputs: Record<string, unknown> }).inputs).sort()).toEqual(['dark', 'light'])
  expect(commands).toContain('aurora')

  const source = await strip(() => $.ui.mount({ ...BAND, surface: 'desktop' }))
  expect(source.startsWith('<svg')).toBe(true)
  expect(source).toContain('#5aa9ff') // the slime's pixels
  expect(source).toContain('♥ HP')
  expect(source).toContain('✦ MP') // the 5-hour limit, 62% left
  expect(source).toContain('62%')
  expect(source).toContain('chờ phản hồi')
  expect(source).toContain('✦#1')
  expect(source).toContain('@media (prefers-color-scheme:dark)')
})

test('a context past 85% storms the aurora and the HUD calls for /compact', async ($, on) => {
  const { clock, state } = engine(on)
  await $.session.start(DESK)

  const before = await strip(() => $.ui.mount({ ...BACKDROP, surface: 'desktop' }))
  expect(before).not.toContain('@keyframes st{')

  state.percent = 91
  await clock.advance(2_500) // the pet's tick reads usage every two seconds

  const after = await strip(() => $.ui.mount({ ...BACKDROP, surface: 'desktop' }))
  expect(after).toContain('@keyframes st{')
  expect(after.length < 131072).toBe(true)
  expect(after).not.toContain('style="')

  const band = await strip(() => $.ui.mount({ ...BAND, surface: 'desktop' }))
  expect(band).toContain('9%') // HP: the context left
  expect(band).toContain('182k/200k')
  expect(band).toContain('/compact')
  expect(band).toContain('#f43f5e') // the window's frame pulses red
})

test('a tool call sets the pet acting, with its status line in the strip', async ($, on) => {
  engine(on)
  on('tool.call', () => ({ result: {} }))
  await $.session.start(DESK)

  const call = $.tool.call({ tool: 'Read', file_path: '/repo/src/app.ts' })
  await call
  const band = await strip(() => $.ui.mount({ ...BAND, surface: 'desktop', props: { ...BAND.props, isWorking: true } }))
  expect(band).toContain('›')
})

test('set_theme puts another pet in the strip and keeps it', async ($, on) => {
  engine(on)
  await $.session.start(DESK)

  const set = await $.tool.call({ tool: 'mcp__aurora-flow__set_theme', theme: CAT })
  expect(set.deny).toBeUndefined()
  expect(String(set.result)).toContain('The Mochi theme is on screen now')

  const band = await strip(() => $.ui.mount({ ...BAND, surface: 'desktop' }))
  expect(band).toContain('#e8a33d')
})

test('the terminal keeps the pet’s text-cell band and HUD window; another plugin’s backdrop is left alone', async ($, on) => {
  engine(on)
  await $.session.start(TERM)

  const band = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(JSON.stringify(await band.drawn())).toContain('"key":"pet"')
  await band.unmount()

  const hint = await $.ui.mount({ ...HINT, surface: 'terminal' })
  expect(JSON.stringify(await hint.drawn())).toContain('♥ HP')
  await hint.unmount()

  const other = await $.ui.mount({ ...BACKDROP, props: { ...BACKDROP.props, scene: 'lagoon', plugin: 'someone-else' }, surface: 'desktop' })
  expect(await other.find({ type: 'Svg' })).toBeUndefined()
  expect((await other.find({ type: 'Text' }))?.text).toBe('engine')
  await other.unmount()
})

test('/aurora hides the strip and brings it back', async ($, on) => {
  engine(on)
  await $.session.start(DESK)

  const hidden = await $.command.run({ command: 'aurora', args: '' } as never)
  expect(String((hidden as { text?: string }).text)).toContain('Đã ẩn')
  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect(await ui.find({ type: 'Svg' })).toBeUndefined()
  await ui.unmount()
})
