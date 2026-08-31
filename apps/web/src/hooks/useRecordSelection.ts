import { useEffect, useRef } from "react";
import { useSearchParams } from "react-router-dom";

export function focusRecordHeading(container: HTMLElement | null) {
  const heading = container?.querySelector<HTMLElement>("h2");
  heading?.focus({ preventScroll: true });
  heading?.scrollIntoView({ block: "nearest" });
}

/** Keep explicit selection independent of filters, including after a status mutation. */
export function useRecordSelection<T extends { id: string }>(
  name: string,
  records: T[],
  filtered: T[],
) {
  const [params, setParams] = useSearchParams();
  const requestedId = params.get(name);
  const selected =
    requestedId === null
      ? filtered[0]
      : records.find((item) => item.id === requestedId);
  const detailRef = useRef<HTMLElement>(null);
  const listRef = useRef<HTMLElement>(null);
  const automaticId = useRef<string | null>(null);
  const id = selected?.id;

  useEffect(() => {
    if (requestedId === null && id) {
      automaticId.current = id;
      setParams(
        (previous) => {
          const next = new URLSearchParams(previous);
          next.set(name, id);
          return next;
        },
        { replace: true },
      );
    }
  }, [id, name, requestedId, setParams]);

  useEffect(() => {
    if (!id || requestedId !== id || automaticId.current === id) return;
    const frame = window.requestAnimationFrame(() =>
      focusRecordHeading(detailRef.current),
    );
    return () => window.cancelAnimationFrame(frame);
  }, [id, requestedId]);

  return {
    selected,
    requestedId,
    detailRef,
    listRef,
    outsideFilter: Boolean(
      selected && !filtered.some((item) => item.id === selected.id),
    ),
    select: (nextId: string) => {
      automaticId.current = null;
      if (requestedId === nextId) focusRecordHeading(detailRef.current);
      else setParams({ [name]: nextId }, { replace: true });
    },
    reset: () => {
      automaticId.current = null;
      setParams({}, { replace: true });
    },
    backToList: () => focusRecordHeading(listRef.current),
  };
}
