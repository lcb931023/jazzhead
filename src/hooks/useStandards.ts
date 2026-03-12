import { useState, useEffect, useRef } from 'react';
import type { Standard } from '../types';
import { loadStandards, saveCustomStandard, deleteCustomStandard } from '../lib/storage';

export function useStandards() {
  const [standards, setStandards] = useState<Standard[]>([]);
  const baseRef = useRef<Standard[]>([]);

  useEffect(() => {
    fetch('/standards.json')
      .then(r => r.json())
      .then(data => {
        baseRef.current = data.standards;
        setStandards(loadStandards(data.standards));
      });
  }, []);

  function refresh() {
    setStandards(loadStandards(baseRef.current));
  }

  function saveStandard(std: Standard) {
    saveCustomStandard(std);
    refresh();
  }

  function deleteStandard(id: string) {
    deleteCustomStandard(id);
    refresh();
  }

  return { standards, saveStandard, deleteStandard, reload: refresh };
}
