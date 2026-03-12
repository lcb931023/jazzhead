import { useState, useMemo } from 'react';
import type { Standard } from './types';
import { buildEdges } from './lib/music';
import { useStandards } from './hooks/useStandards';
import { useAudio } from './hooks/useAudio';
import { Controls } from './components/Controls';
import { GraphView } from './components/GraphView';
import { DetailPanel } from './components/DetailPanel';
import { EditorPanel } from './components/EditorPanel';
import { Legend } from './components/Legend';

export function App() {
  const { standards, saveStandard, deleteStandard, reload } = useStandards();
  const { playingId, playMelody, stopMelody } = useAudio();
  const allEdges = useMemo(() => buildEdges(standards), [standards]);

  const [depth, setDepth] = useState(1);
  const [showLabels, setShowLabels] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);

  const selected = standards.find(s => s.id === selectedId) ?? null;

  function handleSelectNode(s: Standard | null) {
    setSelectedId(s?.id ?? null);
  }

  function handleSave(std: Standard, prevId?: string) {
    if (prevId && prevId !== std.id) deleteStandard(prevId);
    saveStandard(std);
  }

  return (
    <div id="app">
      <header>
        <h1>Jazz Standard Head Connections</h1>
        <p className="subtitle">Melodies that share the same starting notes</p>
      </header>

      <Controls
        depth={depth}
        onDepthChange={setDepth}
        showLabels={showLabels}
        onShowLabelsChange={setShowLabels}
        onEditorToggle={() => setEditorOpen(o => !o)}
      />

      <GraphView
        standards={standards}
        allEdges={allEdges}
        depth={depth}
        showLabels={showLabels}
        selectedId={selectedId}
        onSelectNode={handleSelectNode}
      />

      {selected && (
        <DetailPanel
          standard={selected}
          allEdges={allEdges}
          allStandards={standards}
          playingId={playingId}
          onPlay={playMelody}
          onStop={stopMelody}
          onClose={() => setSelectedId(null)}
          onSelectById={setSelectedId}
        />
      )}

      {editorOpen && (
        <EditorPanel
          standards={standards}
          onSave={handleSave}
          onDelete={deleteStandard}
          onReload={reload}
          playingId={playingId}
          onPlay={playMelody}
          onStop={stopMelody}
          onClose={() => setEditorOpen(false)}
        />
      )}

      <Legend />
    </div>
  );
}
