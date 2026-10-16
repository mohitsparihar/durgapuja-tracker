const KEY = "pandal-hop:celebrate";

/** Dev Strict Mode runs the read effect twice; remember a claim for that remount only. */
let claimed: { id: string; at: number } | null = null;

/** Remember that arriving on this pandal should celebrate. New pandals only. */
export function markCelebrate(id: string): void {
  try {
    sessionStorage.setItem(KEY, id);
  } catch {
    /* private mode or storage disabled */
  }
}

/**
 * True once, when this pandal id was just created. Clears storage immediately
 * so a refresh does not celebrate again.
 */
export function takeCelebrate(id: string): boolean {
  const now = Date.now();
  try {
    if (sessionStorage.getItem(KEY) === id) {
      sessionStorage.removeItem(KEY);
      claimed = { id, at: now };
      return true;
    }
  } catch {
    /* ignore */
  }
  if (claimed && claimed.id === id && now - claimed.at < 1000) return true;
  return false;
}
