#!/usr/bin/env node
// Scrapes MusicXML from https://realbook.site/ and converts to standards.json format.
// Usage: node scrape-realbook.js [--limit N]
// Output: public/scraped-standards.json (written incrementally; safe to interrupt and resume)
//
// TODO before re-running at full scale:
//   1. Octave: find best root octave so most notes fall in [1–13] naturally,
//      instead of clamping individual notes up with `while (deg <= 0) deg += 12`.
//   2. Rests: include rests in the output (e.g. as duration 0 or negative sentinel)
//      so phrasing is preserved; currently rests are silently skipped.
//   3. Tied notes: detect <tie type="start/stop"> and sum durations across the tie,
//      otherwise tied notes appear as two short notes instead of one long one.

import { XMLParser } from 'fast-xml-parser';
import { writeFileSync, readFileSync, existsSync } from 'fs';

const RATE_MS = 600;
const MAX_NOTES = 12;
const BASE_URL = 'https://realbook.site';
const OUT_FILE = 'public/scraped-standards.json';
const ARGS = process.argv.slice(2);
const LIMIT = ARGS.includes('--limit') ? parseInt(ARGS[ARGS.indexOf('--limit') + 1]) : Infinity;

const sleep = ms => new Promise(r => setTimeout(r, ms));

// ── Key mapping ───────────────────────────────────────────────────────────────

const FIFTHS_TO_MAJOR = {
  '-7':'Cb', '-6':'Gb', '-5':'Db', '-4':'Ab', '-3':'Eb',
  '-2':'Bb', '-1':'F',  '0':'C',  '1':'G',  '2':'D',
  '3':'A',   '4':'E',  '5':'B',  '6':'F#', '7':'C#',
};
const FIFTHS_TO_MINOR = {
  '-7':'Abm', '-6':'Ebm', '-5':'Bbm', '-4':'Fm', '-3':'Cm',
  '-2':'Gm',  '-1':'Dm',  '0':'Am',   '1':'Em',  '2':'Bm',
  '3':'F#m',  '4':'C#m',  '5':'G#m',  '6':'D#m', '7':'A#m',
};

// Maps key string → MIDI root (C4=60 based). Extends app's KEY_TO_MIDI_ROOT
// with minor keys that may appear in scrape results.
const KEY_TO_MIDI_ROOT = {
  C:60, 'C#':61, Db:61, D:62, 'D#':63, Eb:63,
  E:64, F:65, 'F#':66, Gb:66, G:67, 'G#':68,
  Ab:68, A:69, 'A#':70, Bb:70, B:71,
  Cm:60, Dm:62, Em:64, Fm:65, Gm:67,
  Am:69, Bm:71, 'C#m':61, Ebm:63, 'F#m':66,
  // Additional minor keys from scrape
  Abm:68, Bbm:70, 'G#m':68, 'D#m':63, 'A#m':70,
};

function resolveKey(fifths, mode) {
  const f = String(fifths);
  return mode === 'minor' ? (FIFTHS_TO_MINOR[f] ?? 'Am') : (FIFTHS_TO_MAJOR[f] ?? 'C');
}

// ── MIDI conversion ───────────────────────────────────────────────────────────

const STEP_SEMITONE = { C:0, D:2, E:4, F:5, G:7, A:9, B:11 };

function noteToMidi(step, alter, octave) {
  return (octave + 1) * 12 + STEP_SEMITONE[step] + Number(alter || 0);
}

function midiToScaleDegree(midiNote, keyString) {
  const rootMidi = KEY_TO_MIDI_ROOT[keyString] ?? 60;
  const interval = midiNote - rootMidi;
  const pitchClass = ((interval % 12) + 12) % 12;
  const octaveShift = Math.round((interval - pitchClass) / 12);
  let deg = (pitchClass + 1) + octaveShift * 12;
  // Normalize: degrees must be >= 1 (no notes below the root)
  while (deg <= 0) deg += 12;
  return deg;
}

// ── XML parsing ───────────────────────────────────────────────────────────────

const xmlParser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' });

function parseMusicXml(xmlText) {
  let doc;
  try { doc = xmlParser.parse(xmlText); } catch { return null; }

  const root = doc['score-partwise'];
  if (!root) return null;

  // Handle score with multiple parts — use first part
  const partRaw = root.part;
  const part = Array.isArray(partRaw) ? partRaw[0] : partRaw;
  if (!part) return null;

  const measuresRaw = part.measure;
  const measures = Array.isArray(measuresRaw) ? measuresRaw : [measuresRaw].filter(Boolean);

  // Read global attributes (usually in measure 1)
  let divisions = 256, fifths = 0, mode = 'major', beats = 4, beatType = 4;
  let composer = '';

  // Composer from <identification>
  const identification = root.identification;
  if (identification) {
    const creators = [identification.creator].flat().filter(Boolean);
    const composerEl = creators.find(c => c['@_type'] === 'composer');
    if (composerEl) {
      const raw = typeof composerEl === 'object' ? composerEl['#text'] : composerEl;
      composer = String(raw ?? '').replace(/^\d{4}\s*[-–]\s*/, '').trim();
    }
  }

  for (const measure of measures) {
    const attrs = measure.attributes;
    if (!attrs) continue;
    divisions = attrs.divisions ?? divisions;
    if (attrs.key) {
      fifths = Number(attrs.key.fifths ?? 0);
      mode = attrs.key.mode ?? 'major';
    }
    if (attrs.time) {
      beats = Number(attrs.time.beats ?? 4);
      beatType = Number(attrs.time['beat-type'] ?? 4);
    }
    break; // first attributes block is enough
  }

  const key = resolveKey(fifths, mode);
  const time_signature = `${beats}/${beatType}`;

  // Extract first MAX_NOTES pitched notes
  const notesOut = [];
  outer: for (const measure of measures) {
    const noteList = [measure.note].flat().filter(Boolean);
    for (const note of noteList) {
      if (!note || note.rest !== undefined || note.grace !== undefined) continue;
      if (!note.pitch) continue;
      const { step, octave, alter } = note.pitch;
      if (!step) continue;
      const midi = noteToMidi(step, alter, Number(octave));
      const durationQ = Number(note.duration) / divisions;
      notesOut.push({ midi, durationQ });
      if (notesOut.length >= MAX_NOTES) break outer;
    }
  }

  if (notesOut.length === 0) return null;

  return { key, time_signature, composer, notes: notesOut };
}

// ── Web fetching ──────────────────────────────────────────────────────────────

async function fetchText(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.text();
}

async function getAllSongs() {
  const songs = [];
  let page = 1;
  while (true) {
    const url = `${BASE_URL}/wp-json/wp/v2/posts?per_page=100&page=${page}&_fields=slug,title`;
    let res;
    try { res = await fetch(url); } catch (e) { console.error(`Page ${page} failed:`, e.message); break; }
    if (!res.ok) break;
    const data = await res.json();
    if (!Array.isArray(data) || data.length === 0) break;
    for (const post of data) {
      songs.push({ slug: post.slug, title: post.title?.rendered?.replace(/&#8217;/g, "'").replace(/&amp;/g, '&') ?? post.slug });
    }
    const totalPages = parseInt(res.headers.get('X-WP-TotalPages') ?? '1');
    if (page >= totalPages) break;
    page++;
    await sleep(RATE_MS);
  }
  return songs;
}

async function getMusicXmlUrl(slug) {
  const html = await fetchText(`${BASE_URL}/${slug}/`);
  // The plugin embeds: url: "https://realbook.site/wp-content/uploads/.../Foo.musicxml"
  const match = html.match(/['"](https:\/\/realbook\.site\/wp-content\/uploads\/[^'"]+\.(?:xml|musicxml))['"]/i);
  return match ? match[1] : null;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('Fetching song list...');
  const allSongs = await getAllSongs();
  const songs = LIMIT < Infinity ? allSongs.slice(0, LIMIT) : allSongs;
  console.log(`Found ${allSongs.length} songs, processing ${songs.length}`);

  // Load existing results to support resuming
  const existing = existsSync(OUT_FILE)
    ? JSON.parse(readFileSync(OUT_FILE, 'utf8')).standards ?? []
    : [];
  const done = new Set(existing.map(s => s.id));
  const results = [...existing];
  console.log(`Resuming from ${done.size} already scraped`);

  let ok = 0, skip = 0;

  for (let i = 0; i < songs.length; i++) {
    const { slug, title } = songs[i];
    if (done.has(slug)) continue; // already scraped

    process.stdout.write(`[${i + 1}/${songs.length}] ${title.slice(0, 40).padEnd(40)} `);

    try {
      const xmlUrl = await getMusicXmlUrl(slug);
      if (!xmlUrl) { console.log('no XML url, skipping'); skip++; continue; }
      await sleep(RATE_MS / 2);

      const xmlText = await fetchText(xmlUrl);
      const parsed = parseMusicXml(xmlText);
      if (!parsed || parsed.notes.length < 3) { console.log('parse failed or too few notes, skipping'); skip++; continue; }

      const scale_degrees = parsed.notes.map(n => midiToScaleDegree(n.midi, parsed.key));
      const durations = parsed.notes.map(n => Math.round(n.durationQ * 1000) / 1000);

      results.push({
        id: slug,
        title,
        composer: parsed.composer || undefined,
        key: parsed.key,
        time_signature: parsed.time_signature,
        tempo: 120,
        scale_degrees,
        durations,
      });
      console.log(`✓ ${parsed.key} [${scale_degrees.slice(0, 5).join(',')}...]`);
      ok++;

      // Write after every song so progress is never lost
      writeFileSync(OUT_FILE, JSON.stringify({ standards: results }, null, 2));
    } catch (e) {
      console.log(`error: ${e.message}`);
      skip++;
    }

    await sleep(RATE_MS);
  }

  console.log(`\nDone: ${ok} new, ${skip} skipped, ${results.length} total → ${OUT_FILE}`);
}

main().catch(console.error);
