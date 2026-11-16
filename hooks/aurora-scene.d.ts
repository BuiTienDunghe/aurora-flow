import type { Bands } from '../types'

/** What the scene is drawn from. */
export type SceneState = {
  /** Context fill, 0 to 100. */
  context?: number
  /** `low`, `medium`, `high`, `xhigh` or `max`. */
  effort?: string | null
  /** Minutes of continuous work. */
  focusMin?: number
  /** Sessions started today, this one included. */
  sessionsToday?: number
}

/** The bands a state falls in: the scene redraws only when one changes. */
export declare function sceneBands(state: SceneState): Bands

/** The backdrop SVG for a state: both modes in one, under 131,072 characters. `moving` false holds it still. */
export declare function buildScene(state: SceneState, moving?: boolean): string

/** The backdrop SVG for a set of bands; `moving` false holds it still, all but a storm's pulsing horizon. */
export declare function sceneFromBands(bands: Bands, moving?: boolean): string

/** Aurora colors per mode and context band: [low curtain, mid curtain, crown]. */
export declare const AURORA: { dark: string[][]; light: string[][] }
