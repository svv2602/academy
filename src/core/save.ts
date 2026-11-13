/** Versioned local save. Bump `v` and migrate in load() when the shape changes. */
export interface Save {
  v: 1;
  stage: number;          // quest stage of world 1 (see game/quest.ts)
  stars: number;
  starsTaken: number[];   // ids of collected world stars
  chestOpen: boolean;
  pos: [number, number] | null;
  dress: string;
  hair: string;
  hairStyle: 'long' | 'buns' | 'simpleparted';
  wings: boolean;
  played: boolean;
  name: string;           // how the cat addresses the child; never leaves the device
}

const KEY = 'amw-save';

export function defaultSave(): Save {
  return { v: 1, stage: 0, stars: 0, starsTaken: [], chestOpen: false, pos: null, dress: '#ff7eb6', hair: '#8a5a3a', hairStyle: 'long', wings: true, played: false, name: '' };
}

export function loadSave(): Save {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const s = JSON.parse(raw);
      if (s && s.v === 1) return { ...defaultSave(), ...s };
    }
  } catch { /* private mode or corrupted data: start fresh */ }
  return defaultSave();
}

export function storeSave(s: Save) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* storage unavailable */ }
}

export function clearSave() {
  try { localStorage.removeItem(KEY); } catch { /* storage unavailable */ }
}
