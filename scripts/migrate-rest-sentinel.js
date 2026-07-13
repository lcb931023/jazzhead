#!/usr/bin/env node
// One-off migration: replaces literal 0 (old rest sentinel) with "-" in
// standards[].scale_degrees across the given JSON files. Real notes are
// never 0 (see scrape-realbook.js rawScaleDegree), so this is unambiguous.
import { readFileSync, writeFileSync } from 'fs';

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
