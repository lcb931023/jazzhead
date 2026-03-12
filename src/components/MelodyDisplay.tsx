import { DEGREE_NAMES } from '../constants';
import { degreeColor } from '../lib/music';
import type { Standard } from '../types';

const GUIDE_DEGREES = [1, 5, 8, 13];

interface Props {
  standard: Standard;
  W?: number;
  H?: number;
}

export function MelodyDisplay({ standard, W = 272, H = 60 }: Props) {
  const degs = standard.scale_degrees;
  const n = degs.length;
  if (n === 0) return null;

  const spacing = (W - 24) / Math.max(n - 1, 1);
  const x0 = 12;

  function yOf(deg: number) {
    return H - 8 - ((deg - 1) / 12) * (H - 16);
  }

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ overflow: 'visible', width: '100%' }}>
      {GUIDE_DEGREES.map(deg => {
        const y = yOf(deg);
        return (
          <g key={deg}>
            <line x1={0} y1={y} x2={W} y2={y} stroke="rgba(255,255,255,0.06)" strokeWidth={1} />
            <text x={0} y={y - 2} fontSize={7} fill="rgba(255,255,255,0.2)">{DEGREE_NAMES[deg]}</text>
          </g>
        );
      })}
      {degs.slice(0, -1).map((deg, i) => (
        <line
          key={i}
          x1={x0 + i * spacing} y1={yOf(deg)}
          x2={x0 + (i + 1) * spacing} y2={yOf(degs[i + 1])}
          stroke={degreeColor(deg)} strokeWidth={1.5} opacity={0.4}
        />
      ))}
      {degs.map((deg, i) => {
        const x = x0 + i * spacing;
        const y = yOf(deg);
        return (
          <g key={i}>
            <circle cx={x} cy={y} r={5} fill={degreeColor(deg)} opacity={0.9} />
            <text x={x} y={y + 14} textAnchor="middle" fontSize={8} fill={degreeColor(deg)} opacity={0.8}>
              {DEGREE_NAMES[deg] ?? deg}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
