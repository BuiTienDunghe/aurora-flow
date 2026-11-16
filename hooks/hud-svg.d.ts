import type { Hud } from '../types'

/** 0: under 40%, 1: under 70%, 2: under 85%, 3: 85% and over. */
export declare function contextBandOf(percent: number | null): number

/** 92000 → "92.0k", 200000 → "200k", 1000000 → "1M", null → "—". */
export declare function formatTokens(n: number | null): string

/** Minutes as h:mm. */
export declare function formatFlow(min: number): string

/** The HUD as one line of text, for the terminal. */
export declare function hudLine(hud: Hud): string

/** The HUD as an 860 by 58 SVG strip, for the desktop and mobile apps. */
export declare function hudSvg(hud: Hud): string
