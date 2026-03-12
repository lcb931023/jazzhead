import { DEGREE_NAMES } from '../constants';
import { degreeColor } from '../lib/music';

export function Legend() {
  return (
    <div id="degree-legend">
      <span style={{ marginRight: 6, whiteSpace: 'nowrap' }}>Interval:</span>
      {Array.from({ length: 13 }, (_, i) => i + 1).map(i => (
        <span key={i} style={{ display: 'flex', alignItems: 'center', gap: 3, marginRight: 10, whiteSpace: 'nowrap' }}>
          <span className="legend-dot" style={{ background: degreeColor(i) }} />
          <span>{DEGREE_NAMES[i]}</span>
        </span>
      ))}
    </div>
  );
}
