interface Props {
  depth: number;
  onDepthChange: (v: number) => void;
  showLabels: boolean;
  onShowLabelsChange: (v: boolean) => void;
  onEditorToggle: () => void;
}

export function Controls({ depth, onDepthChange, showLabels, onShowLabelsChange, onEditorToggle }: Props) {
  return (
    <div id="controls">
      <div className="control-group">
        <label>
          Match depth
          <input
            type="range" min={1} max={8} value={depth} step={1}
            onChange={e => onDepthChange(+e.target.value)}
          />
          <span id="depth-label">{depth}</span>
        </label>
      </div>
      <div className="control-group">
        <label>
          <input
            type="checkbox" checked={showLabels}
            onChange={e => onShowLabelsChange(e.target.checked)}
          />
          Show labels
        </label>
      </div>
      <button id="editor-toggle" onClick={onEditorToggle}>+ Add / Edit Standard</button>
    </div>
  );
}
