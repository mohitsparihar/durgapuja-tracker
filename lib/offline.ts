import type { PandalSummary } from "./types";

/** Last successfully loaded list, kept for the offline banner/page. */
export const LAST_LIST_KEY = "pandal-hop:last-list";
export interface CachedList {
  title: string;
  items: PandalSummary[];
  savedAt: string;
}
