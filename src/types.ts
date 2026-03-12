export interface Standard {
  id: string;
  title: string;
  composer?: string;
  key: string;
  time_signature: string;
  tempo: number;
  scale_degrees: number[];
  durations?: number[];
}

export interface Edge {
  source: string;
  target: string;
  shared: number;
}

// D3 augments node data with simulation properties
export type SimNode = Standard & {
  x?: number;
  y?: number;
  vx?: number;
  vy?: number;
  fx?: number | null;
  fy?: number | null;
};

export interface TooltipData {
  x: number;
  y: number;
  standard: Standard;
  depth: number;
  matches: Standard[];
}
