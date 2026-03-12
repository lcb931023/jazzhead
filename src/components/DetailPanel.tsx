import type { Standard, Edge } from '../types';
import { DEGREE_NAMES } from '../constants';
import { MelodyDisplay } from './MelodyDisplay';

interface Props {
  standard: Standard;
  allEdges: Edge[];
  allStandards: Standard[];
  playingId: string | null;
  onPlay: (s: Standard, id: string) => void;
  onStop: () => void;
  onClose: () => void;
  onSelectById: (id: string) => void;
}

export function DetailPanel({ standard, allEdges, allStandards, playingId, onPlay, onStop, onClose, onSelectById }: Props) {
  const isPlaying = playingId === standard.id;

  const connections = allEdges
    .filter(e => e.source === standard.id || e.target === standard.id)
    .map(e => ({ id: e.source === standard.id ? e.target : e.source, shared: e.shared }))
    .sort((a, b) => b.shared - a.shared);

  function handlePlay() {
    if (isPlaying) { onStop(); return; }
    onPlay(standard, standard.id);
  }

  return (
    <div id="detail-panel">
      <button id="close-detail" onClick={onClose}>×</button>
      <div id="detail-title">{standard.title}</div>
      <div id="detail-meta">
        {standard.composer || '?'} · Key: {standard.key} · {standard.time_signature} · ♩={standard.tempo}
      </div>
      <div id="detail-melody">
        <MelodyDisplay standard={standard} />
      </div>
      <div id="detail-connections">
        {connections.length === 0 ? (
          <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>No shared starting notes found.</p>
        ) : (
          <>
            <h3>Shares starting notes with</h3>
            {connections.map(({ id, shared }) => {
              const s = allStandards.find(x => x.id === id);
              if (!s) return null;
              const degreeDots = s.scale_degrees.slice(0, shared)
                .map(deg => DEGREE_NAMES[deg] ?? deg).join(', ');
              return (
                <div
                  key={id}
                  className="connection-item"
                  title={`Shared: ${degreeDots}`}
                  onClick={() => onSelectById(id)}
                >
                  <span>{s.title}</span>
                  <span className="connection-count">{shared}</span>
                </div>
              );
            })}
          </>
        )}
      </div>
      <button id="play-btn" className={isPlaying ? 'playing' : ''} onClick={handlePlay}>
        {isPlaying ? '■ Stop' : '▶ Play Melody'}
      </button>
    </div>
  );
}
