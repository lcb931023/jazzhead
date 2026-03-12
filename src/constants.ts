export const DEGREE_NAMES: Record<number, string> = {
  1: 'Root', 2: '♭2',  3: '2nd',  4: '♭3', 5: '3rd',
  6: '4th',  7: '♭5',  8: '5th',  9: '♭6', 10: '6th',
  11: '♭7',  12: '7th', 13: 'Oct', 14: '♭9', 15: '9th',
};

export const KEY_TO_MIDI_ROOT: Record<string, number> = {
  C: 60, 'C#': 61, Db: 61, D: 62, 'D#': 63, Eb: 63,
  E: 64, F: 65, 'F#': 66, Gb: 66, G: 67, 'G#': 68,
  Ab: 68, A: 69, 'A#': 70, Bb: 70, B: 71,
  Cm: 60, Dm: 62, Em: 64, Fm: 65, Gm: 67,
  Am: 69, Bm: 71, 'C#m': 61, Ebm: 63, 'F#m': 66,
};

export const NODE_R = 28;
export const MELODY_H = 14;
