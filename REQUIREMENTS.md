# Jazz Standard Head Connections — Requirements

## Purpose

A web app that lets users explore how jazz standards' melodies ("heads") relate to each other through shared starting notes. Two standards are connected when their opening melody notes share the same scale degrees (relative to each song's own key).

## Data

- ~100 jazz standards from the Real Book, prioritized by popularity.
- Each standard stores: title, composer, key, time signature, tempo, and the opening melody as an array of **scale degrees** (1–8, relative to the song's key, where 8 = the octave).
- Storage format is human-editable JSON (`standards.json`).
- Users can add, edit, and delete standards via an in-app editor. Custom entries persist in `localStorage` and can be exported/imported as JSON.

## Graph View

- A **force-directed network graph** where each node represents a jazz standard.
- **Edges** connect standards that share the same starting scale degrees.
- A **match depth slider** (1–8) controls how many consecutive starting notes must match for an edge to appear. At depth 1, all standards sharing the same first note are connected; at depth 2, the first two notes must match; and so on.

## Node Melody Display

- Each node contains a **mini melody strip**: a small piano-roll–style visualization showing the opening notes as dots, positioned vertically by scale degree and colored by degree.
- The melody strip supports **scrubbing**: hovering across it moves a cursor note by note. At each scrub position:
  - Nodes that share all notes up to the cursor position are highlighted (full match).
  - Nodes that share fewer notes are shown as partial matches.
  - Edges update live to reflect the current scrub depth.
  - A tooltip shows how many other standards match and lists their titles.

## Detail Panel

- Clicking a node opens a detail panel showing:
  - Title, composer, key, time signature, and tempo.
  - A larger melody visualization with scale degree labels.
  - A sorted list of all connected standards with their shared-note count, clickable to navigate.
  - A **play button** that plays the melody through a synthesizer (Tone.js), using the scale degrees and durations to reconstruct pitches relative to the song's key.

## Editor

- A slide-out panel for adding or editing a standard, with fields for all data properties.
- Custom standards are saved to `localStorage` and merged with the base dataset on load.
- **Export**: download custom standards as JSON.
- **Import**: load a JSON file of standards to bulk-add entries.

## Controls

- **Match depth slider**: sets the minimum shared-note prefix length required to draw an edge.
- **Show labels toggle**: hides/shows standard titles on nodes.
- Pan and zoom on the graph canvas.
