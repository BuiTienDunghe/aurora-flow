// ── Aurora Flow ──

/** What the HUD shows of the session beside the pet's bars. */
export type Hud = {
  /** Context fill, 0 to 100; null until the first response of the live window. */
  context: number | null
  /** Input tokens the last response was answered over. */
  tokens: number | null
  /** The model's context window, in tokens. */
  window: number | null
  /** The effort of the last main-loop request: low … max, `custom`, or null. */
  effort: string | null
  /** The model of the last main-loop request. */
  model: string | null
  /** Minutes of continuous work (activity with no gap over 10 minutes). */
  focusMin: number
  /** Sessions started today, this one included. */
  sessionsToday: number
}

/** The bands the backdrop is drawn from. */
export type Bands = {
  /** 0: under 40%, 1: under 70%, 2: under 85%, 3: 85% and over. */
  contextBand: number
  /** 0 (low) to 4 (max). */
  effortLevel: number
  /** 0: under 15 minutes, 1: under 30, 2: under 45, 3: 45 and over. */
  focusStage: number
  /** Stars in today's constellation, 1 to 12. */
  stars: number
}

/** The run of continuous work, in `$.clock.now()` milliseconds. */
export type Flow = { start: number; lastActive: number }

// ── The pixel pet (from pixel-pet by halluqinate, MIT) ──

export type Mode =
  | 'idle'
  | 'sleep'
  | 'think'
  | 'read'
  | 'search'
  | 'edit'
  | 'bash'
  | 'web'
  | 'agent'
  | 'run'
  | 'jump'
  | 'cheer'
  | 'error'

export type Anim = {
  mode: Mode
  since: number
  x: number
  dir: 1 | -1
  tick: number
  target: string
  working: boolean // whether a turn was running at the last tick
  leap?: Leap // a running pet's leap over an obstacle, until it lands
}

/** A leap from column `from` to column `to`, begun at `since`. The pet plays its jump clip, slowed, on the way. */
export type Leap = { since: number; from: number; to: number }

declare module 'claude-code' {
  interface PluginState {
    'aurora-flow': { hud: Hud; bands: Bands; flow: Flow; isHudHidden: boolean; anim: Anim }
  }
}
