import { useState, useCallback } from 'react';

const KEY = 'activity_renames';

function load(): Record<string, string> {
  try { return JSON.parse(localStorage.getItem(KEY) || '{}'); }
  catch { return {}; }
}

export function useRenames() {
  const [renames, setRenames] = useState<Record<string, string>>(() =>
    typeof window !== 'undefined' ? load() : {}
  );

  const rename = useCallback((id: string, name: string) => {
    setRenames(prev => {
      const next = { ...prev };
      const trimmed = name.trim();
      if (trimmed) next[id] = trimmed;
      else delete next[id];
      try { localStorage.setItem(KEY, JSON.stringify(next)); } catch {}
      return next;
    });
  }, []);

  return { renames, rename };
}
