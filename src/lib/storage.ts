import type { Standard } from '../types';

const LS_KEY = 'jazz-standards-custom';

export function loadStandards(base: Standard[]): Standard[] {
  try {
    const custom: Standard[] = JSON.parse(localStorage.getItem(LS_KEY) || '[]');
    const byId = new Map(base.map(s => [s.id, s]));
    custom.forEach(s => byId.set(s.id, s));
    return Array.from(byId.values());
  } catch { return base; }
}

export function saveCustomStandard(std: Standard): void {
  const custom: Standard[] = JSON.parse(localStorage.getItem(LS_KEY) || '[]');
  const idx = custom.findIndex(s => s.id === std.id);
  if (idx >= 0) custom[idx] = std; else custom.push(std);
  localStorage.setItem(LS_KEY, JSON.stringify(custom));
}

export function deleteCustomStandard(id: string): void {
  const custom: Standard[] = JSON.parse(localStorage.getItem(LS_KEY) || '[]');
  localStorage.setItem(LS_KEY, JSON.stringify(custom.filter(s => s.id !== id)));
}

export function exportCustom(): void {
  const custom = JSON.parse(localStorage.getItem(LS_KEY) || '[]');
  const blob = new Blob([JSON.stringify({ custom_standards: custom }, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'jazz-standards-custom.json';
  a.click();
}

export function importCustom(file: File, onDone: () => void): void {
  const reader = new FileReader();
  reader.onload = ev => {
    try {
      const data = JSON.parse(ev.target!.result as string);
      const arr: Standard[] = data.custom_standards || data.standards || [];
      arr.forEach(s => saveCustomStandard(s));
      onDone();
    } catch { alert('Invalid JSON file.'); }
  };
  reader.readAsText(file);
}
