#!/usr/bin/env node
// One-off: apply freshly re-scraped ground-truth data (public/scraped-standards.json,
// produced by the fixed scrape-realbook.js which distinguishes real notes from rests
// via the parser's `rest` flag, not by numeric value) onto standards.json and
// public/standards.json. Only overwrites fields the scraper produces
// (key, time_signature, tempo, scale_degrees, durations, composer if present);
// leaves ids and any other existing fields alone. Reports which standards.json
// entries had no matching scraped id.
import { readFileSync, writeFileSync } from 'fs';

const scraped = JSON.parse(readFileSync('public/scraped-standards.json', 'utf8')).standards;
const scrapedById = new Map(scraped.map(s => [s.id, s]));

const FILES = ['standards.json', 'public/standards.json'];
let unmatched = [];

for (const file of FILES) {
  const data = JSON.parse(readFileSync(file, 'utf8'));
  let updated = 0;
  for (const standard of data.standards) {
    const fresh = scrapedById.get(standard.id);
    if (!fresh) {
      if (file === FILES[0]) unmatched.push(standard.title);
      continue;
    }
    standard.key = fresh.key;
    standard.time_signature = fresh.time_signature;
    standard.scale_degrees = fresh.scale_degrees;
    standard.durations = fresh.durations;
    if (fresh.composer) standard.composer = fresh.composer;
    updated++;
  }
  writeFileSync(file, JSON.stringify(data, null, 2) + '\n');
  console.log(`${file}: updated ${updated}/${data.standards.length}`);
}

console.log(`\nUnmatched (no fresh scrape, need fallback handling): ${unmatched.length}`);
unmatched.forEach(t => console.log(`  - ${t}`));
