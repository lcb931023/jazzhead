---
name: scraper MusicXML conversion improvements needed
description: Known issues with the realbook.site MusicXML → Standard conversion that need fixing before the scraped data is usable
type: project
---

The MusicXML-to-Standard conversion in `scrape-realbook.js` is a first pass and has three known problems:

1. **Wrong octave.** Notes below the root get clamped up by +12 semitones (`while (deg <= 0) deg += 12`), which distorts the melody contour. The fix should instead find the best root octave so that the majority of melody notes fall naturally in the [1–13] degree range, rather than forcing individual notes up.

2. **Stops / rests not handled musically.** Rests are silently skipped, so the degree and duration arrays don't reflect silence. The app's `durations` field could represent a rest with a negative duration (convention TBD), or rests could be included as a sentinel value (e.g. `0`). Either way, skipping rests loses phrasing information.

3. **Duration accuracy.** The current rounding (`Math.round(durationQ * 1000) / 1000`) is fine, but tied notes across barlines are not detected — MusicXML encodes ties via `<tie type="start/stop">` and the two `<duration>` values should be summed. Without this, tied notes appear as two short notes instead of one long one.

**How to apply:** Before re-running the full scrape, address these three issues in `scrape-realbook.js`. The `parseMusicXml` function is where all three are handled. Cross-check output against known standards (e.g. "All of Me" in C should start [13, 8, 5, ...]).

**Why:** The scraper was intentionally stopped early (only ~23/846 songs saved to `public/scraped-standards.json`) pending these fixes. The partial file is safe to discard or overwrite.
