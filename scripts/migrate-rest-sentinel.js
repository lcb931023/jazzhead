#!/usr/bin/env node
//
// DO NOT RUN THIS SCRIPT. It is kept only as a record of the bug that
// corrupted scale_degrees data (see git commit fixing "data corruption from
// blind 0->'-' rest migration").
//
// This script's premise is FALSE: "real notes are never 0" is wrong.
// rawScaleDegree() in scrape-realbook.js can legitimately return 0 for a
// pitched note (e.g. rawScaleDegree(59, 60) === 0 — a major 7th below the
// root). A literal 0 in scale_degrees is therefore ambiguous between "rest"
// and "real note landing on degree 0" and can NOT be disambiguated by value
// alone. Blindly replacing every 0 with '-' (as this script did) silently
// turns real notes into rests.
//
// The correct fix is to distinguish rests at the source, using the parser's
// `rest` boolean from the MusicXML/MEI, not by inspecting the numeric value
// after the fact (see scrape-realbook.js: `n.rest ? '-' : rawScaleDegree(...)`).
// If scale_degrees data ever needs to be regenerated, re-run the scraper
// (node scrape-realbook.js) against source XML instead of transforming
// already-written JSON.
import { readFileSync, writeFileSync } from 'fs';

throw new Error(
  'migrate-rest-sentinel.js is unsafe and must not be run: 0 is a valid ' +
  'scale degree, not just a rest sentinel. See the comment at the top of ' +
  'this file. Re-scrape from source instead.'
);

// eslint-disable-next-line no-unreachable
const FILES = ['standards.json', 'public/standards.json'];

for (const file of FILES) {
  const data = JSON.parse(readFileSync(file, 'utf8'));
  let changed = 0;
  for (const standard of data.standards) {
    standard.scale_degrees = standard.scale_degrees.map(d => {
      if (d === 0) { changed++; return '-'; }
      return d;
    });
  }
  writeFileSync(file, JSON.stringify(data, null, 2) + '\n');
  console.log(`${file}: replaced ${changed} rest(s)`);
}
