import { useWorkspaceDraftStore } from "../store/workspaceDraftStore";

export function useWorkspaceDraft<T extends object>(
  key: string,
  saved: T,
  editable = true,
) {
  const entry = useWorkspaceDraftStore((state) => state.entries[key]);
  const clear = () => useWorkspaceDraftStore.getState().clear(key);
  const current = saved as Record<string, unknown>;
  const conflicting = entry
    ? Object.keys(entry.changes).filter(
        (field) =>
          !Object.is(current[field], entry.baseline[field]) &&
          !Object.is(current[field], entry.changes[field]),
      )
    : [];
  return {
    // Another tab can close or remove the record. Only an explicit save/discard owns this draft.
    value: { ...saved, ...entry?.changes } as T,
    baseline: (entry?.baseline ?? {}) as Partial<T>,
    dirty: Boolean(entry),
    conflicting,
    update: (changes: Partial<T>) => {
      if (editable)
        useWorkspaceDraftStore.getState().update(key, saved, changes);
    },
    clear,
  };
}
