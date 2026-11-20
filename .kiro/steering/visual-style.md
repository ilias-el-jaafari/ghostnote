---
inclusion: always
---

# Visual style (Phase 3b)

This is the look of GhostNote. **Implemented in Phase 3b** as four switchable visual themes. Do not let a theme rewrite Phase 2 gameplay or scoring. Flat or minimalist design is forbidden.

Authoritative direction from Ilias: the Phase 3 Frutiger Aero / Aqua Gloss draft was a good first pass, but the 2000s had the feeling of **trying hard to be modern and futuristic** — everything much more colorful, with a unique character that now feels nostalgic. The moodboard (local only, not in git) is the reference: highly saturated cabinet HUDs, MilkDrop kaleidoscopes, Guitar Hero neon lanes, Aqua bubbles, laser grids.

## Themes

GhostNote ships four named looks, selectable in library settings and randomizable per song:

| Id | Name | Background | Highway |
| --- | --- | --- | --- |
| `kaleido` | Kaleido | Psychedelic / kaleidoscope / fractal MilkDrop in vivid magenta, cyan, lime, and purple, with translucent low-poly shards | Flat glossy pitch lanes |
| `aqua` | Aqua Bubble | Saturated glassy Aqua swirls, caustics, and bubbles (richer than the Phase 3 sky/water draft) | Flat glossy pitch lanes |
| `galaxy` | Neon Galaxy | Starfield and spiral-arm nebula | Neon perspective note lanes (Guitar Hero flavour) while time still scrolls left to right |
| `laser` | Laser Grid | Perspective laser grid / Tron tunnel in magenta, cyan, and lime | Same neon perspective lanes |

The stored preference is `kaleido | aqua | galaxy | laser | random` in `localStorage` under `ghostnote-theme`. `random` picks a theme when a song starts (avoiding a repeat of the last one when possible). The library uses a stable Kaleido preview until a song begins. `?theme=` locks the theme for screenshots and debugging.

All four themes share one WebGL1 fragment shader (`u_mode` 0–3). CSS `data-theme` on `<html>` carries the matching tokens and fallback gradients.

## Shared 2000s HUD (every theme)

- **Audio spectrum bars at the top** of the sing screen, drawn from a Web Audio `AnalyserNode` (frequency bars in saturated player colours).
- **Multicolor score capsules** per statistic, with digital / tabular numerals: Notes blue, Bonus green, Total magenta, Accuracy yellow. Capsule frames are glossy 3D pills, not empty player slots.
- A **colored player square** (P1) on the left of the highway.
- A **TIME progress bar** at the bottom, with a clock.
- A **lyric glass box** with **bold, hard-outlined** classic sans (Tahoma / Verdana / Arial-like).
- **Chunky glossy note pills**, tinted by pitch class (player palette), goldens staying gold.
- **Big additive lens flares** (8-point starbursts) on hits and golden notes.

HUD panels remain semi-transparent dark surfaces with a thin bright top border, sitting over the shader.

## Bars and buttons — glossy 3D capsules

- Bars (note bars, primary actions, score capsules) and buttons are **glossy 3D capsules**, not flat rectangles.
- Each capsule has a **semi-transparent white reflection** cut across the **top 45%** of its face (a hard-ish Aqua highlight, not a soft Material-style ripple).
- Add a visible **bevel** and an **inset `box-shadow`** so the control feels pressed into, or proud of, the glass surface.
- Hover/active states may intensify the highlight and inner glow, but typography must remain sharp.

## Light effects — additive particles and flares

- Use **particles and lens flares** with **additive blending**:
  - Canvas 2D: `globalCompositeOperation = 'lighter'`
  - WebGL: additive equivalent in the shader highlights
- Flares can kiss the "now" line, golden notes, and score pops. Particles may drift like bubbles or motes of light.
- Additive effects must never blow out the lyric line or make the current syllable unreadable.

## Background — GLSL / MilkDrop

- The page background is a **GLSL fragment shader** drawn with WebGL, in the style of a Winamp MilkDrop preset.
- Prefer a fullscreen canvas behind the UI, not a static CSS gradient as the final look.
- Keep contrast under the HUD high enough that scores and lyrics stay readable. If needed, add a darkening veil immediately behind panels, not over the whole stage.
- Resurrection / Halloween stays subtle: no gore, no jump scares, no decoration that hides lyrics or the score.

## Highway timing

- Time still runs **left to right**. Galaxy and Laser may add perspective / neon lane *styling*, never a new scroll axis.

## Performance fallbacks (required)

The shader-and-particles look is the default on capable devices. THE UI MUST remain playable on a low-end phone:

- Detect reduced capability (low GPU / low FPS / `navigator.hardwareConcurrency`, or a user/debug toggle) and **drop shader quality**: lower resolution, simpler fractal, fewer octaves, paused or static background.
- Honour **`prefers-reduced-motion`**: no or minimal shader motion, no particle bursts, no pulsing flares. Static glass and the HUD must still look on-theme (the active theme's colours and fallback gradient) and remain fully playable.
- If WebGL is unavailable, fall back to a **theme-specific CSS gradient** plus static gloss; do not crash or block singing.
- The gameplay thread (timing, pitch, scoring) must not hitch because of the visualizer. If frame time is tight, drop visual quality before dropping score accuracy.

Quality tiers remain `high | medium | low | static`, overridable with `?visual=`.

## What this is not

- Not flat, not "clean minimal", not typography-only Material or Vercel-style marketing UI.
- Not a timid, desaturated Aero wash — saturation and character are the point.
- Not a horror game. Ghost cues are atmospheric only.
- Not a reason to ship heavy new UI frameworks. Prefer a dedicated shader canvas, a particle/flare canvas, and CSS for the chrome.
