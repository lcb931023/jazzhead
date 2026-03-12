import { useState, useRef } from 'react';
import * as Tone from 'tone';
import type { Standard } from '../types';
import { degreeToMidi, midiToToneNote } from '../lib/music';

export function useAudio() {
  const synthRef = useRef<Tone.Synth | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [playingId, setPlayingId] = useState<string | null>(null);

  async function playMelody(standard: Standard, callerId: string) {
    // Stop anything currently playing
    if (timerRef.current) clearTimeout(timerRef.current);
    Tone.getTransport().stop();
    Tone.getTransport().cancel();
    setPlayingId(null);

    if (synthRef.current === null) {
      await Tone.start();
      synthRef.current = new Tone.Synth({
        oscillator: { type: 'triangle' },
        envelope: { attack: 0.02, decay: 0.1, sustain: 0.4, release: 0.8 },
      }).toDestination();
    }

    const bpm = standard.tempo || 120;
    const quarterSec = 60 / bpm;
    let t = Tone.now() + 0.05;

    standard.scale_degrees.forEach((deg, i) => {
      const dur = standard.durations?.[i] ?? 1;
      const note = midiToToneNote(degreeToMidi(deg, standard.key));
      synthRef.current!.triggerAttackRelease(note, Math.max(0.1, dur * quarterSec * 0.85), t);
      t += dur * quarterSec;
    });

    setPlayingId(callerId);
    timerRef.current = setTimeout(() => setPlayingId(null), (t - Tone.now()) * 1000 + 200);
  }

  function stopMelody() {
    if (timerRef.current) clearTimeout(timerRef.current);
    Tone.getTransport().stop();
    Tone.getTransport().cancel();
    setPlayingId(null);
  }

  return { playingId, playMelody, stopMelody };
}
