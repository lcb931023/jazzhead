---
name: project current state
description: Current state of the Jazz Standard Branching project — what exists, what works, what's next
type: project
---

The app has been fully rewritten from vanilla JS to React + TypeScript + Vite.

**To run:** `npm run dev` (entry: `src/main.tsx`, data: `public/standards.json`)

**Stack:** React 19, TypeScript, Vite, D3 v7, Tone.js v15, fast-xml-parser

**Key files:**
- `src/App.tsx` — root; owns depth, selectedId, showLabels, editorOpen state
- `src/components/GraphView.tsx` — D3 force graph; D3 owns the SVG DOM imperatively via refs
- `src/components/EditorPanel.tsx` — add/edit standards; controlled form with live MelodyDisplay preview
- `src/components/DetailPanel.tsx` — selected standard info + play
- `src/hooks/useStandards.ts` — fetches `/scraped-standards.json`, merges localStorage custom standards
- `src/hooks/useAudio.ts` — singleton Tone.js synth, shared playingId state
- `public/standards.json` — canonical base data (backed up as `public/standards.backup.json`)
- `public/scraped-standards.json` — partial scrape from realbook.site (23/846 songs); **NOT production-ready**
- `scrape-realbook.js` — MusicXML scraper with incremental writes and resume support

**What works:** The full React app works. Editor click-to-edit, live preview, D3 scrub interactions, play buttons.

**What's pending:**
- `useStandards.ts` currently fetches `/scraped-standards.json` (23 songs, partial). Should be switched back to `/standards.json` for the full dataset until scraper issues are fixed.
- Scraper needs 3 fixes before re-running (see `memory/project_scraper_improvements.md`): octave normalization, rest handling, tied note durations.

**Why:** The scraper was stopped early after identifying quality issues with the MusicXML→degree conversion.
