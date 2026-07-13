#!/usr/bin/env node
// Scrapes chart data from https://realbook.site/ and converts to standards.json format.
// Usage: node scrape-realbook.js [--limit N] [--all]
// Output: public/scraped-standards.json (written incrementally; safe to interrupt and resume)
// By default only fetches songs whose title matches an entry in standards.json
// (case/punctuation-insensitive), since that's the only data the app needs.
// Pass --all to scrape every song on the site instead.
//
// The site's charts live under the "scores" custom post type (not "posts"), and
// each chart's file is linked in a `data-src="...musicxml"` attribute embedded in
// the post's rendered content. Despite the file extension, charts uploaded more
// recently are actually MEI XML (Verovio's export format, root element <mei>),
// while older charts are real MusicXML (root element <score-partwise>). Both are
// handled below (parseMusicXmlFormat / parseMeiFormat) since standards.json titles
// span both eras.
//
// Conversion notes (see parseScore and friends below):
//   1. Octave: instead of clamping individual notes up with `while (deg <= 0) deg += 12`,
//      we compute one whole-song octave shift (a multiple of 12) that maximizes how many
//      of the song's notes land naturally in the 1-13 range, then apply that single shift
//      to every note in the song.
//   2. Rests: represented explicitly as scale_degree = 0 (a rest sentinel) with their
//      real duration, instead of being silently dropped.
//   3. Tied notes: tie start/stop pairs (which may span a barline) have their durations
//      summed into one note instead of being emitted as two short notes.

import { XMLParser } from 'fast-xml-parser';
import { writeFileSync, readFileSync, existsSync } from 'fs';

const RATE_MS = 600;
const MAX_NOTES = 12;
const BASE_URL = 'https://realbook.site';
const OUT_FILE = 'public/scraped-standards.json';
const ARGS = process.argv.slice(2);
const LIMIT = ARGS.includes('--limit') ? parseInt(ARGS[ARGS.indexOf('--limit') + 1]) : Infinity;
const SCRAPE_ALL = ARGS.includes('--all');

const normalizeTitle = t => t.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

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

// ── MIDI / scale-degree conversion ──────────────────────────────────────────────

const STEP_SEMITONE = { C:0, D:2, E:4, F:5, G:7, A:9, B:11 };

function noteToMidi(step, alter, octave) {
  return (octave + 1) * 12 + STEP_SEMITONE[step.toUpperCase()] + Number(alter || 0);
}

// Raw scale degree, unclamped — may be <= 0 or > 13 depending on which
// octave the melody happens to be written in relative to the key's root.
function rawScaleDegree(midiNote, keyString) {
  const rootMidi = KEY_TO_MIDI_ROOT[keyString] ?? 60;
  const interval = midiNote - rootMidi;
  const pitchClass = ((interval % 12) + 12) % 12;
  const octaveShift = Math.round((interval - pitchClass) / 12);
  return (pitchClass + 1) + octaveShift * 12;
}

// Pick a single whole-song octave shift (multiple of 12) that maximizes how
// many raw degrees land in [1, 13], instead of clamping each note on its own
// (which distorts melodic contour by yanking individual notes up or down).
function bestOctaveShift(rawDegrees) {
  let bestShift = 0, bestCount = -1;
  for (let k = -4; k <= 4; k++) {
    const shift = k * 12;
    const count = rawDegrees.filter(d => d + shift >= 1 && d + shift <= 13).length;
    if (count > bestCount || (count === bestCount && Math.abs(shift) < Math.abs(bestShift))) {
      bestCount = count;
      bestShift = shift;
    }
  }
  return bestShift;
}

// ── Tie merging (shared by both XML formats) ────────────────────────────────────

// events: ordered array of { id, rest, midi?, durationQ }
// tiePairs: array of [startId, endId] — endId's note continues startId's note,
// possibly chained (endId is itself a startId of a further tie).
// Returns the first `limit` merged events, in order, with tied durations summed.
function mergeTiesAndLimit(events, tiePairs, limit) {
  const byId = new Map(events.map((e, i) => [e.id, i]));
  const tieMap = new Map(tiePairs);
  const consumed = new Set();
  const out = [];

  for (let i = 0; i < events.length && out.length < limit; i++) {
    const ev = events[i];
    if (consumed.has(ev.id)) continue;
    if (ev.rest) { out.push(ev); continue; }

    let totalDur = ev.durationQ;
    let nextId = tieMap.get(ev.id);
    while (nextId != null) {
      const idx = byId.get(nextId);
      if (idx === undefined) break;
      const target = events[idx];
      totalDur += target.durationQ;
      consumed.add(target.id);
      nextId = tieMap.get(target.id);
    }
    out.push({ id: ev.id, rest: false, midi: ev.midi, durationQ: totalDur });
  }
  return out;
}

// ── MusicXML (score-partwise) parsing ───────────────────────────────────────────

const xmlParser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' });

function parseMusicXmlFormat(doc) {
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

  function tieTypes(note) {
    if (!note.tie) return [];
    return [note.tie].flat().map(t => t['@_type']);
  }

  // Flatten to an ordered event list with synthetic ids, and record tie
  // start→stop pairs by pairing each tie-start note with the very next
  // pitched note (rests can't participate in a tie).
  const events = [];
  const tiePairs = [];
  let lastTieStartId = null;
  let seq = 0;

  outer: for (const measure of measures) {
    const noteList = [measure.note].flat().filter(Boolean);
    for (const note of noteList) {
      if (!note || note.grace !== undefined) continue;
      const id = `n${seq++}`;
      const durationQ = Number(note.duration) / divisions;

      if (note.rest !== undefined) {
        events.push({ id, rest: true, durationQ });
        if (events.length >= MAX_NOTES * 4) break outer; // generous cap before tie-merge
        continue;
      }
      if (!note.pitch) continue;
      const { step, octave, alter } = note.pitch;
      if (!step) continue;
      const midi = noteToMidi(step, alter, Number(octave));
      events.push({ id, rest: false, midi, durationQ });

      const types = tieTypes(note);
      if (lastTieStartId != null) {
        tiePairs.push([lastTieStartId, id]);
        lastTieStartId = types.includes('start') ? id : null;
      } else if (types.includes('start')) {
        lastTieStartId = id;
      }
      if (events.length >= MAX_NOTES * 4) break outer;
    }
  }

  const notes = mergeTiesAndLimit(events, tiePairs, MAX_NOTES);
  if (notes.length === 0) return null;

  return { key, time_signature, composer, notes };
}

// ── MEI parsing ──────────────────────────────────────────────────────────────
//
// Newer realbook.site charts are MEI (root <mei>), which encodes ties as
// standalone <tie startid="#a" endid="#b"/> elements (not nested in notes),
// and accidentals as a nested <accid accid.ges="s"/> or an @accid attribute
// rather than MusicXML's <alter>. We scan the raw text sequentially instead
// of building a DOM, since MEI's <beam>-wrapped notes and dotted attribute
// names (dur.ppq, key.sig, ...) make a full object walk more trouble than
// it's worth for a linear melody extraction.

const ACCID_MAP = { s: 1, f: -1, n: 0, ss: 2, x: 2, ff: -2 };
const SHARP_ORDER = ['f', 'c', 'g', 'd', 'a', 'e', 'b'];
const FLAT_ORDER = ['b', 'e', 'a', 'd', 'g', 'c', 'f'];

function keySigAlterations(fifths) {
  const m = {};
  if (fifths > 0) SHARP_ORDER.slice(0, fifths).forEach(p => { m[p] = 1; });
  else if (fifths < 0) FLAT_ORDER.slice(0, -fifths).forEach(p => { m[p] = -1; });
  return m;
}

// MEI key.sig values look like "1s" (1 sharp), "2f" (2 flats), "0" (none).
function parseMeiSig(sig) {
  const m = /^(\d+)([sf]?)$/.exec(sig || '0');
  if (!m) return 0;
  const n = Number(m[1]);
  return m[2] === 'f' ? -n : n;
}

function parseMeiFormat(xmlText) {
  if (!/<mei[\s>]/.test(xmlText)) return null;

  const ppqM = xmlText.match(/<staffDef\b[^>]*\bppq="(\d+)"/);
  const ppq = ppqM ? Number(ppqM[1]) : 24;

  const keySigM = xmlText.match(/<keySig\b[^>]*\/>/);
  let fifths = 0, mode = 'major';
  if (keySigM) {
    const sigM = keySigM[0].match(/\bsig="([^"]*)"/);
    const modeM = keySigM[0].match(/\bmode="([^"]*)"/);
    fifths = parseMeiSig(sigM ? sigM[1] : '0');
    mode = modeM ? modeM[1] : 'major';
  }
  const keyAlts = keySigAlterations(fifths);
  const key = resolveKey(fifths, mode);

  const meterM = xmlText.match(/<meterSig\b[^>]*\/>/);
  let beats = 4, beatType = 4;
  if (meterM) {
    const countM = meterM[0].match(/\bcount="(\d+)"/);
    const unitM = meterM[0].match(/\bunit="(\d+)"/);
    beats = countM ? Number(countM[1]) : 4;
    beatType = unitM ? Number(unitM[1]) : 4;
  }
  const time_signature = `${beats}/${beatType}`;

  const composerM = xmlText.match(/<persName[^>]*\brole="composer"[^>]*>([^<]*)<\/persName>/)
    ?? xmlText.match(/<composer>([^<]*)<\/composer>/);
  const composer = composerM ? composerM[1].trim() : '';

  // Sequential scan for note / rest / tie tags, in document (= musical) order.
  const tagRe = /<note\b[^>]*\/>|<note\b[^>]*>.*?<\/note>|<rest\b[^>]*\/>|<tie\b[^>]*\/>/gs;
  const events = [];
  const tiePairs = [];
  let match;
  while ((match = tagRe.exec(xmlText)) && events.length < MAX_NOTES * 4) {
    const block = match[0];

    if (block.startsWith('<tie')) {
      const s = block.match(/\bstartid="#?([^"]*)"/);
      const e = block.match(/\bendid="#?([^"]*)"/);
      if (s && e) tiePairs.push([s[1], e[1]]);
      continue;
    }

    const idM = block.match(/\bxml:id="([^"]*)"/);
    const id = idM ? idM[1] : `e${events.length}`;
    if (/\bgrace="/.test(block)) continue;

    const durM = block.match(/\bdur\.ppq="(\d+)"/);
    const durationQ = durM ? Number(durM[1]) / ppq : 0;

    if (block.startsWith('<rest')) {
      events.push({ id, rest: true, durationQ });
      continue;
    }

    const pnameM = block.match(/\bpname="([a-g])"/);
    const octM = block.match(/\boct="(-?\d+)"/);
    if (!pnameM || !octM) continue;
    const pname = pnameM[1];

    const gesM = block.match(/\baccid\.ges="([a-z]+)"/);
    const accM = block.match(/\baccid="([a-z]+)"/);
    const accidCode = gesM ? gesM[1] : (accM ? accM[1] : null);
    const alter = accidCode != null ? (ACCID_MAP[accidCode] ?? 0) : (keyAlts[pname] ?? 0);

    const midi = noteToMidi(pname, alter, Number(octM[1]));
    events.push({ id, rest: false, midi, durationQ });
  }

  const notes = mergeTiesAndLimit(events, tiePairs, MAX_NOTES);
  if (notes.length === 0) return null;

  return { key, time_signature, composer, notes };
}

// ── Dispatch ─────────────────────────────────────────────────────────────────

function parseScore(xmlText) {
  let doc;
  try { doc = xmlParser.parse(xmlText); } catch { doc = null; }

  if (doc && doc['score-partwise']) return parseMusicXmlFormat(doc);
  return parseMeiFormat(xmlText);
}

// ── Web fetching ──────────────────────────────────────────────────────────────

async function fetchText(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.text();
}

// realbook.site charts live under the "scores" custom post type. Each page's
// content.rendered embeds the chart's musicxml/MEI file URL in a data-src
// attribute, so we can discover it here without a separate per-song fetch.
async function getAllSongs() {
  const songs = [];
  let page = 1;
  while (true) {
    const url = `${BASE_URL}/wp-json/wp/v2/scores?per_page=100&page=${page}&_fields=slug,yoast_head_json.og_title,content.rendered`;
    let res;
    try { res = await fetch(url); } catch (e) { console.error(`Page ${page} failed:`, e.message); break; }
    if (!res.ok) break;
    const data = await res.json();
    if (!Array.isArray(data) || data.length === 0) break;
    for (const post of data) {
      const rawTitle = post.yoast_head_json?.og_title ?? post.slug;
      const title = rawTitle
        .replace(/\s*[–-]\s*Free Sheet Music.*$/i, '')
        .replace(/&#8217;/g, "'").replace(/&amp;/g, '&')
        .trim();
      const xmlMatch = post.content?.rendered?.match(/data-src="([^"]+\.(?:xml|musicxml))"/i);
      if (!xmlMatch) continue;
      songs.push({ slug: post.slug, title, xmlUrl: xmlMatch[1] });
    }
    const totalPages = parseInt(res.headers.get('X-WP-TotalPages') ?? '1');
    if (page >= totalPages) break;
    page++;
    await sleep(RATE_MS);
  }
  return songs;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('Fetching song list...');
  const allSongs = await getAllSongs();

  let songs = allSongs;
  if (!SCRAPE_ALL) {
    const wanted = new Set(
      JSON.parse(readFileSync('standards.json', 'utf8')).standards.map(s => normalizeTitle(s.title))
    );
    songs = allSongs.filter(s => wanted.has(normalizeTitle(s.title)));
    console.log(`Matched ${songs.length}/${wanted.size} standards.json titles against ${allSongs.length} site songs`);
  }
  songs = LIMIT < Infinity ? songs.slice(0, LIMIT) : songs;
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
    const { slug, title, xmlUrl } = songs[i];
    if (done.has(slug)) continue; // already scraped

    process.stdout.write(`[${i + 1}/${songs.length}] ${title.slice(0, 40).padEnd(40)} `);

    try {
      const xmlText = await fetchText(xmlUrl);
      const parsed = parseScore(xmlText);
      if (!parsed || parsed.notes.length < 3) { console.log('parse failed or too few notes, skipping'); skip++; continue; }

      const pitchedRaw = parsed.notes.filter(n => !n.rest).map(n => rawScaleDegree(n.midi, parsed.key));
      const shift = bestOctaveShift(pitchedRaw);
      const scale_degrees = parsed.notes.map(n => n.rest ? 0 : rawScaleDegree(n.midi, parsed.key) + shift);
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
