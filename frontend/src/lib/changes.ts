import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { routes } from "@openhivemind/shared";
import { api } from "../api";
const POLL_MS = 30000;
/**
 * Polls the changes feed while the tab is visible, invalidates only the sessions
 * it names and reports whether the watched session is among them, so the reader
 * can offer a control instead of moving the page.
 */
export function useChanges(watch?: string) {
  const client = useQueryClient();
  const cursor = useRef<string | undefined>(undefined);
  const anchored = useRef(false);
  const [changed, setChanged] = useState(false);
  const query = useQuery({
    queryKey: ["changes"],
    queryFn: () => api(routes.changes, { query: { since: cursor.current, limit: 100 } }),
    refetchInterval: POLL_MS,
    refetchIntervalInBackground: false,
    staleTime: POLL_MS,
    retry: false,
  });
  const page = query.data;
  useEffect(() => {
    if (!page) return;
    cursor.current = page.cursor ?? cursor.current;
    if (!anchored.current) {
      anchored.current = true;
      return;
    }
    const ids = page.items.map((item) => item.id);
    if (!ids.length) return;
    for (const id of ids)
      if (id !== watch) void client.invalidateQueries({ queryKey: ["session", id] });
    void client.invalidateQueries({ queryKey: ["sessions"] });
    if (watch && ids.includes(watch)) setChanged(true);
  }, [page, client, watch]);
  return { changed, clear: useCallback(() => setChanged(false), []) };
}
