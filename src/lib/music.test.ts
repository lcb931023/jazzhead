import { describe, it, expect } from 'vitest';
import { sharedPrefixLength } from './music';
import type { ScaleDegree, Standard } from '../types';

function makeStandard(id: string, scale_degrees: ScaleDegree[]): Standard {
  return {
    id,
    title: id,
    key: 'C',
    time_signature: '4/4',
    tempo: 120,
    scale_degrees,
  };
}

describe('sharedPrefixLength', () => {
  it('ignores a rest in the middle of the shorter match', () => {
    const a = makeStandard('a', [1, 2, '-', 3]);
    const b = makeStandard('b', [1, 2, 3]);
    expect(sharedPrefixLength(a, b)).toBe(3);
  });

  it('filters rests independently on both sides before comparing positionally', () => {
    // a's real notes: [1, 2, 3]; b's real notes: [1, 2, 4] -> match on 1, 2; diverge at 3 vs 4
    const a = makeStandard('a', [1, '-', 2, 3]);
    const b = makeStandard('b', ['-', 1, 2, 4]);
    expect(sharedPrefixLength(a, b)).toBe(2);
  });

  it('computes a plain prefix match length when there are no rests', () => {
    const a = makeStandard('a', [1, 2, 3, 4]);
    const b = makeStandard('b', [1, 2, 3, 9]);
    expect(sharedPrefixLength(a, b)).toBe(3);
  });

  it('does not let a rest before a mismatch inflate or deflate the count', () => {
    const a = makeStandard('a', [1, '-', 2, 5]);
    const b = makeStandard('b', [1, 2, 9]);
    expect(sharedPrefixLength(a, b)).toBe(2);
  });

  it('returns 0 when the first real notes differ, even surrounded by rests', () => {
    const a = makeStandard('a', ['-', 5, 6, 7]);
    const b = makeStandard('b', [1, 5, 6, 7]);
    expect(sharedPrefixLength(a, b)).toBe(0);
  });
});
