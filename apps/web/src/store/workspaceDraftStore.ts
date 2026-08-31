import { create } from "zustand";

interface DraftEntry {
  baseline: Record<string, unknown>;
  changes: Record<string, unknown>;
}

interface DraftState {
  entries: Record<string, DraftEntry>;
  update: (key: string, saved: object, changes: object) => void;
  clear: (key: string) => void;
  clearAll: () => void;
}

/** Unsubmitted input belongs to this tab, never the shared/committed DB document. */
export const useWorkspaceDraftStore = create<DraftState>((set) => ({
  entries: {},
  update: (key, saved, changes) =>
    set((state) => {
      const previous = state.entries[key];
      const entry: DraftEntry = {
        baseline: { ...previous?.baseline },
        changes: { ...previous?.changes },
      };
      const current = saved as Record<string, unknown>;
      for (const [field, value] of Object.entries(changes)) {
        if (Object.is(current[field], value)) {
          delete entry.baseline[field];
          delete entry.changes[field];
        } else {
          if (!Object.hasOwn(entry.changes, field))
            entry.baseline[field] = current[field];
          entry.changes[field] = value;
        }
      }
      const entries = { ...state.entries };
      if (Object.keys(entry.changes).length) entries[key] = entry;
      else delete entries[key];
      return { entries };
    }),
  clear: (key) =>
    set((state) => {
      if (!state.entries[key]) return state;
      const entries = { ...state.entries };
      delete entries[key];
      return { entries };
    }),
  clearAll: () => set({ entries: {} }),
}));
