# Aurora Flow

A mod for the Claude Desktop app (it also draws in the Claude mobile app and, more simply, in the terminal):

- **Behind the chat**, a live aurora over a tech horizon that answers the session.
- **Above the prompt**, a pixel pet that acts out what Claude is doing, beside a pixel HUD window.

The pixel pet, its themes, its HUD bars and the pet skill come from [pixel-pet](https://github.com/Namenomeaning/pixel-pet) by halluqinate (MIT, see `LICENSE-pixel-pet`). pixel-pet was built for the terminal: on the desktop it drew only the pet, with no scene and no HUD. Aurora Flow draws the whole band for the desktop as one SVG strip.

## Install

At the prompt of a terminal session:

```
/plugin install aurora-flow --marketplace BuiTienDunghe/aurora-flow
```

Answer `y` to add the marketplace, then pick a scope: the user scope loads the mod in every session after.

From a shell:

```bash
claude plugin install aurora-flow --marketplace BuiTienDunghe/aurora-flow
```

In the desktop app, where `/plugin` does not run: click + next to the prompt box, then Plugins, Add marketplace with `BuiTienDunghe/aurora-flow`, then Add plugin. A mod installed from a terminal at the user scope also loads in the desktop app's sessions.

## The backdrop

| Signal | What the aurora does |
|---|---|
| **Context fill** | Changes color: under 40% green; to 70% cyan and violet; to 85% violet and magenta; from 85% a red-magenta "storm" with a pulsing horizon |
| **Effort** (low … max) | Moves faster: curtains, ray shimmer and rising data particles, ×1 to ×2.8 |
| **Focus time** | Raises contrast at 15, 30 and 45 minutes of continuous work (a deeper vignette, a brighter aurora; at 45 the interface takes the stronger contrast). A break over 10 minutes starts over. |
| **Sessions today** | One star per session in a constellation; the current one pulses |

The scene redraws only when one of these bands changes.

## The band above the prompt (desktop and mobile)

One SVG strip, 860 × 96, light and dark:

- **The pet** (the slime by default) acts out each tool call: reads a book for `Read`, sweeps a magnifier for `Grep`/`Glob`, writes for `Edit`/`Write`, types in a terminal for `Bash`, spins a globe for web tools, jumps when a turn starts, runs between calls, cheers when a turn ends, shows `x x` eyes when a call fails, and sleeps when idle. A mini follows it for each running subagent. Its theme's scene (ground, sky, obstacles it leaps, drifting decor) draws in the strip; without one it runs on a neon ground in the aurora's colors.
- **The status line** names what the pet is doing: `› reading app.ts`, `› $ npm test`.
- **The HUD window**: ♥ HP (the context left, with tokens / window), ✦ MP (the 5-hour limit left, with its reset), ◆ ST (the 7-day limit left), then effort, flow time with its stage, and today's session number with the model. The frame takes the aurora's color and pulses red from 85% context, with `/compact`.

The pet's face follows the HUD: it sweats at 50% HP or less, gets `x x` eyes at 25% or less, and looks tired under 20% MP or ST.

On the terminal the band is pixel-pet's own text-cell band, and the HUD is its window below the prompt.

## Make it yours

Ask Claude to change the pet (the `aurora-flow:pixel-pet` skill): "make the pet a rubber duck", "a UFO tablet when it reads", "a moon surface with rocks to jump over". Claude previews the theme in your browser first, then sets it with the mod's `set_theme` tool; the theme is kept for later sessions. `assets/duck.json` and `assets/alien.json` are examples; `skills/pixel-pet/FORMAT.md` documents the format.

`/aurora` hides or shows the band in this session and prints the session's figures.

`/pet-off` turns the pet and HUD off in every session: the ones open now hide within two seconds, and new ones start with it off. A hidden pet costs nothing: the mod stops stepping and drawing it. `/pet-on` turns it back on everywhere. The aurora behind the chat stays either way. The switch is kept in a `.pet-state` file in the mod's folder.

## Settings

As pixel-pet's: speed (`slow`, `normal`, `fast`), sleep after (seconds), HUD on or off, status line on or off, naming files and commands on or off, subagent minis on or off.

## What it touches

It reads its own assets and theme, polls the session's usage and its list of subagents, registers three tools for the pet's theme (`get_theme`, `preview_theme` writes an HTML preview to the path Claude gives it, `set_theme`), and draws. It makes no network requests and starts no processes. The status line shows the first line of a `Bash` command, cut short; the "Name files and commands" setting turns that off.

## Files

`hooks/register.tsx` wires the events; `hooks/aurora-scene.js` draws the backdrop; `hooks/desk.ts` draws the desktop strip; `hooks/anim.ts`, `pixels.ts`, `theme.ts`, `scene.ts`, `hud.ts`, `status.ts`, `minis.ts`, `settings.ts` and `preview.ts` are pixel-pet's modules, each with its test; `tests/aurora-flow.test.tsx` tests the mod as a whole.
