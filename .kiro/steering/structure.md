---
inclusion: always
---

# Project Structure

```
.kiro/
  steering/          Product, stack, structure, and visual-style (Phase 3)
  specs/             Feature specs: requirements.md, design.md, tasks.md
  hooks/             Agent hooks (JSON, schema version v1)
public/
  songs/             Demo UltraStar .txt files served as static assets
  manifest.webmanifest
  favicon.svg
src/
  config/            Brand constants (`APP_NAME`)
  i18n/              English / Spanish dictionaries and provider
  parser/            UltraStar file format types, parser, tests
  pitch/             YIN detector, note math, mic hook, tests
  game/              Timing engine, scoring, simulated singer, tests
  audio/             Guide-melody hook (Phase 2 stand-in for missing audio)
  ui/                Presentational React components
  songs/             Source copy of demo songs (kept in sync with public/songs)
  App.tsx            Phase shell and composition
  main.tsx           React entry
  App.css / index.css
screenshots/         Manual visual evidence per phase (not required at runtime)
```

## Conventions

- One concern per folder. Parsing and pitch detection stay pure and UI-free so they are easy to test.
- Filename style: camelCase for modules (`parseUltraStar.ts`), PascalCase for React components (`SongPanel.tsx`), kebab-case for hooks JSON and static assets.
- Export public APIs from folder `index.ts` files where it helps the UI import a stable surface.
- Colocate unit tests as `*.test.ts` next to the code.
- Keep the official Kiro artifacts only under `.kiro/` at the repository root. Do not nest a second `.kiro` directory.

## Implementation order

Work the phases listed in `.kiro/specs/resurrection-karaoke/tasks.md`. Do not start Phase N+1 until Phase N builds, its tests pass, and the UI for that phase can be demonstrated.

When adding a feature, update the matching requirement, then the design if the architecture changes, then the task checkbox.

## Git

The project is a local git repository. Do not add a remote or push until Ilias confirms the GitHub repository name and visibility.
