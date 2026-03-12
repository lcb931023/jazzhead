import { useState, useEffect, useRef } from 'react';
import type { Standard } from '../types';
import { exportCustom, importCustom } from '../lib/storage';
import { MelodyDisplay } from './MelodyDisplay';

interface FormState {
  title: string;
  composer: string;
  key: string;
  time_signature: string;
  tempo: string;
  scale_degrees: string;
  durations: string;
}

function emptyForm(): FormState {
  return { title: '', composer: '', key: 'C', time_signature: '4/4', tempo: '120', scale_degrees: '', durations: '' };
}

function toFormState(s: Standard): FormState {
  return {
    title: s.title,
    composer: s.composer || '',
    key: s.key || 'C',
    time_signature: s.time_signature || '4/4',
    tempo: String(s.tempo || 120),
    scale_degrees: s.scale_degrees.join(', '),
    durations: s.durations ? s.durations.join(', ') : '',
  };
}

function parseStandard(form: FormState): Standard | null {
  const title = form.title.trim();
  if (!title) return null;
  const scale_degrees = form.scale_degrees.split(',').map(x => parseInt(x.trim())).filter(n => !isNaN(n));
  if (scale_degrees.length === 0) return null;
  const durations = form.durations.split(',').map(x => parseFloat(x.trim())).filter(n => !isNaN(n));
  return {
    id: title.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
    title,
    composer: form.composer,
    key: form.key || 'C',
    time_signature: form.time_signature || '4/4',
    tempo: parseInt(form.tempo) || 120,
    scale_degrees,
    durations: durations.length ? durations : undefined,
  };
}

interface Props {
  standards: Standard[];
  onSave: (std: Standard, prevId?: string) => void;
  onDelete: (id: string) => void;
  onReload: () => void;
  playingId: string | null;
  onPlay: (s: Standard, id: string) => void;
  onStop: () => void;
  onClose: () => void;
}

export function EditorPanel({ standards, onSave, onDelete, onReload, playingId, onPlay, onStop, onClose }: Props) {
  const [form, setForm] = useState<FormState>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const importRef = useRef<HTMLInputElement>(null);
  const formTopRef = useRef<HTMLDivElement>(null);

  // Clear editingId if the standard was deleted from outside
  useEffect(() => {
    if (editingId && !standards.find(s => s.id === editingId)) {
      setEditingId(null);
      setForm(emptyForm());
    }
  }, [standards, editingId]);

  const preview = parseStandard(form);
  const isPreviewPlaying = playingId === 'preview';

  function set(field: keyof FormState, value: string) {
    setForm(f => ({ ...f, [field]: value }));
  }

  function loadIntoForm(s: Standard) {
    setForm(toFormState(s));
    setEditingId(s.id);
    formTopRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function handleCancel() {
    setEditingId(null);
    setForm(emptyForm());
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const std = parseStandard(form);
    if (!std) return;
    onSave(std, editingId || undefined);
    setEditingId(null);
    setForm(emptyForm());
  }

  function handleDelete(id: string) {
    if (id === editingId) handleCancel();
    onDelete(id);
  }

  function handlePreviewPlay() {
    if (!preview) return;
    if (isPreviewPlaying) { onStop(); return; }
    onPlay(preview, 'preview');
  }

  function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    importCustom(file, onReload);
    e.target.value = '';
  }

  const inputProps = (field: keyof FormState) => ({
    value: form[field],
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => set(field, e.target.value),
  });

  return (
    <div id="editor-panel">
      <h2>Add / Edit Standard</h2>
      <button id="close-editor" onClick={onClose}>×</button>

      <div ref={formTopRef} />

      <form id="editor-form" onSubmit={handleSubmit}>
        <label>
          Title
          <input type="text" required {...inputProps('title')} />
        </label>
        <label>
          Composer
          <input type="text" {...inputProps('composer')} />
        </label>
        <label>
          Key
          <input type="text" placeholder="e.g. C, Bb, Am" {...inputProps('key')} />
        </label>
        <label>
          Time Signature
          <input type="text" placeholder="e.g. 4/4" {...inputProps('time_signature')} />
        </label>
        <label>
          Tempo (BPM)
          <input type="number" min={40} max={400} {...inputProps('tempo')} />
        </label>
        <label>
          Scale Degrees (comma-separated)
          <input type="text" placeholder="e.g. 8,7,6,5,4,3,2,1" required {...inputProps('scale_degrees')} />
          <small>Semitone-based: 1=Root, 2=♭2, 3=2nd, 4=♭3, 5=3rd, 6=4th, 7=♭5, 8=5th, 9=♭6, 10=6th, 11=♭7, 12=7th, 13=Oct</small>
        </label>
        <label>
          Note Durations (comma-separated, optional)
          <input type="text" placeholder="e.g. 1,0.5,0.5,1,2" {...inputProps('durations')} />
        </label>
        <div className="form-actions">
          <button type="submit" id="editor-submit-btn">{editingId ? 'Update' : 'Save'}</button>
          {editingId && <button type="button" id="cancel-edit-btn" onClick={handleCancel}>Cancel</button>}
          <button type="button" onClick={exportCustom}>Export JSON</button>
          <button type="button" onClick={() => importRef.current?.click()}>Import JSON</button>
          <input ref={importRef} type="file" accept=".json" style={{ display: 'none' }} onChange={handleImport} />
        </div>
      </form>

      {preview && (
        <div id="editor-preview">
          <div id="editor-melody">
            <MelodyDisplay standard={preview} />
          </div>
          <button
            type="button"
            id="preview-play-btn"
            className={isPreviewPlaying ? 'playing' : ''}
            onClick={handlePreviewPlay}
          >
            {isPreviewPlaying ? '■ Stop' : '▶ Preview'}
          </button>
        </div>
      )}

      <div id="standards-list">
        <h3>All Standards ({standards.length})</h3>
        {standards.map(s => (
          <div
            key={s.id}
            className={`std-item${s.id === editingId ? ' editing' : ''}`}
            data-id={s.id}
            onClick={() => loadIntoForm(s)}
          >
            <span>{s.title}</span>
            <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>{s.key}</span>
            <button onClick={e => { e.stopPropagation(); handleDelete(s.id); }}>✕</button>
          </div>
        ))}
      </div>
    </div>
  );
}
