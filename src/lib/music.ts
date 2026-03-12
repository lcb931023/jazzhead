import type { Standard, Edge } from '../types';
import { KEY_TO_MIDI_ROOT } from '../constants';

export function degreeColor(deg: number): string {
  const hue = Math.round(((deg - 1) % 12) / 12 * 360);
  return `hsl(${hue}, 70%, 60%)`;
}

export function sharedPrefixLength(a: Standard, b: Standard): number {
  let n = 0;
  const len = Math.min(a.scale_degrees.length, b.scale_degrees.length);
  for (let i = 0; i < len; i++) {
    if (a.scale_degrees[i] === b.scale_degrees[i]) n++;
    else break;
  }
  return n;
}

export function buildEdges(standards: Standard[]): Edge[] {
  const edges: Edge[] = [];
  for (let i = 0; i < standards.length; i++) {
    for (let j = i + 1; j < standards.length; j++) {
      const shared = sharedPrefixLength(standards[i], standards[j]);
      if (shared >= 1) edges.push({ source: standards[i].id, target: standards[j].id, shared });
    }
  }
  return edges;
}

export function degreeToMidi(deg: number, key: string): number {
  return (KEY_TO_MIDI_ROOT[key] ?? 60) + (deg - 1);
}

export function midiToToneNote(midi: number): string {
  const notes = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  return `${notes[midi % 12]}${Math.floor(midi / 12) - 1}`;
}

export function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}
