"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";

const DEBOUNCE_MS = 300;

/**
 * A search box whose value lives in the URL rather than in component state, so
 * a refresh, the back button, or a shared link all land on the same results —
 * which matters on a phone that reloads the tab whenever it's backgrounded.
 *
 * The current value arrives as a prop from the server page, so nothing here
 * reads `useSearchParams` and no Suspense boundary is needed.
 *
 * `hrefFor` must be stable — wrap it in `useCallback`.
 */
export function useUrlSearch({
  query,
  hrefFor,
}: {
  query: string;
  hrefFor: (query: string) => string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [term, setTerm] = useState(query);

  // What the URL currently reflects, so the debounce can tell a local edit apart
  // from a value that arrived from the URL.
  const applied = useRef(query);

  const navigate = useCallback(
    (next: string) => {
      applied.current = next.trim();
      startTransition(() => {
        router.replace(hrefFor(next), { scroll: false });
      });
    },
    [hrefFor, router],
  );

  // Adopt a query that changed outside this input (a Clear button, back/forward).
  useEffect(() => {
    if (query !== applied.current) {
      applied.current = query;
      setTerm(query);
    }
  }, [query]);

  useEffect(() => {
    if (term.trim() === applied.current) return;

    const timer = setTimeout(() => navigate(term), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [term, navigate]);

  /** Apply a value immediately, skipping the debounce (Clear buttons, presets). */
  const setImmediately = useCallback(
    (next: string) => {
      setTerm(next);
      navigate(next);
    },
    [navigate],
  );

  return { term, setTerm, setImmediately, pending };
}
