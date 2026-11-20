---
inclusion: always
---

# Visual style (Phase 3)

This is the look of GhostNote. **Implement it in Phase 3**, after gameplay and scoring already work. Do not let this theme block or rewrite Phase 2 behaviour. Flat or minimalist design is forbidden.

Authoritative direction from Ilias: a **Frutiger Aero / Aqua Gloss** (circa 2004–2009) base mixed with a **2000s arcade rhythm-game HUD**, plus only subtle ghost / resurrection touches.

The full token, shader, and fallback notes below are the source of truth when theming CSS, Canvas, or WebGL.

## Core aesthetic

- Frutiger Aero and Aqua Gloss: glossy glass, bubble-like buttons, skeuomorphic depth, bright sky/water reflections, friendly late-2000s sheen (Windows Aero, Aqua, early web 2.0).
- 2000s arcade rhythm-game HUD: chunky note highways, glowing lanes, a prominent "now" line, big scores, a slightly over-the-top but readable overlay, in the spirit of UltraStar / Pump It Up / early arcade rhythm cabinets — not a flat "modern SaaS" dashboard.
- Resurrection / Halloween stays subtle: ghostly green glows on notes, faint ectoplasm or mist in the shader, no gore, no jump scares, no decoration that hides lyrics or the score.

## Background — GLSL / MilkDrop

- The page background is a **GLSL fragment shader** drawn with WebGL, in the style of a Winamp MilkDrop preset: soft fractals, slow-evolving plasma, and translucent geometric forms that drift and fold.
- Prefer a fullscreen canvas or `WebGLRenderer` behind the UI, not a static CSS gradient as the final look.
- Colours may lean aqua, sky, lime-ghost green, and soft highlights. Motion should feel liquid, not aggressive.
- Keep contrast under the HUD high enough that scores and lyrics stay readable. If needed, add a darkening veil immediately behind panels, not over the whole stage.

## Bars and buttons — glossy 3D capsules

- Bars (note bars, primary actions, score capsules) and buttons are **glossy 3D capsules**, not flat rectangles.
- Each capsule has a **semi-transparent white reflection** cut across the **top 45%** of its face (a hard-ish Aqua highlight, not a soft Material-style ripple).
- Add a visible **bevel** and an **inset `box-shadow`** so the control feels pressed into, or proud of, the glass surface.
- Hover/active states may intensify the highlight and inner glow, but typography must remain sharp.

## Light effects — additive particles and flares

- Use **particles and lens flares** with **additive blending**:
  - Canvas 2D: `globalCompositeOperation = 'lighter'`
  - WebGL / three.js-style: `AdditiveBlending` (or the GLSL equivalent)
- Flares can kiss the "now" line, golden notes, and score pops. Particles may drift like bubbles or motes of light.
- Additive effects must never blow out the lyric line or make the current syllable unreadable.

## Audio and HUD

- Draw **real-time audio waveforms** from a Web Audio `AnalyserNode` (time-domain and/or frequency bars) in or around the sing HUD — a classic visualizer sitting with the highway, not a separate "settings toy".
- HUD panels are **semi-transparent black `rgba` surfaces** with a **thin bright top border** (glass plates over the shader).
- Use **classic sans-serif** faces (for example a clean Arial / Verdana / Tahoma-like or a close webfont) for scores and labels, with a **hard black outline** (or a tight 1–2px text-shadow ring) so type survives sitting on a busy shader.
- Note names and monospace lyrics may keep a monospaced companion face, still outlined when they sit on the stage.

## Performance fallbacks (required)

The shader-and-particles look is the default on capable devices. THE UI MUST remain playable on a low-end phone:

- Detect reduced capability (low GPU / low FPS / `navigator.hardwareConcurrency`, or a user/debug toggle) and **drop shader quality**: lower resolution, simpler fractal, fewer octaves, paused or static background.
- Honour **`prefers-reduced-motion`**: no or minimal shader motion, no particle bursts, no pulsing flares. Static Aero glass and the HUD must still look on-theme and remain fully playable.
- If WebGL is unavailable, fall back to a CSS Aero gradient plus static gloss; do not crash or block singing.
- The gameplay thread (timing, pitch, scoring) must not hitch because of the visualizer. If frame time is tight, drop visual quality before dropping score accuracy.

## What this is not

- Not flat, not "clean minimal", not typography-only Material or Vercel-style marketing UI.
- Not a horror game. Ghost cues are atmospheric only.
- Not a reason to ship heavy new UI frameworks. Prefer a dedicated shader canvas, a particle/flare canvas, and CSS for the Aero chrome.
