/** Codes raised by the database (see supabase/migrations) or the mock store. */
const MESSAGES: Record<string, string> = {
  QUOTA_PANDAL: "You've added 10 pandals today — that's the daily limit. Thank you! Try again tomorrow.",
  QUOTA_PHOTO: "You've reached today's photo limit (40). Try again tomorrow.",
  QUOTA_PHOTO_PER_PANDAL: "You've already added 10 photos to this pandal.",
  QUOTA_FLAG: "You've sent a lot of reports today. Please try again tomorrow.",
  CROWD_RATE: "You reported this pandal's crowd in the last 10 minutes. Thanks — try again a little later.",
  ALREADY_FLAGGED: "You've already reported this. We'll take a look.",
  NOT_SIGNED_IN: "Please sign in first.",
  NOT_FOUND: "This pandal no longer exists.",
  BAD_IMAGE: "Couldn't read this image. Try a JPEG or PNG photo.",
  TOO_LARGE: "This photo is too large even after compression.",
  OFFLINE: "You're offline. Check your connection and try again.",
  PERMISSION: "You don't have permission to do that.",
};

export class AppError extends Error {
  constructor(public code: string, message?: string) {
    super(message ?? MESSAGES[code] ?? code);
  }
}

interface PgLikeError {
  code?: string;
  message?: string;
  statusCode?: string | number;
}

/** Turns any thrown value (Supabase/Postgres/network/AppError) into a friendly sentence. */
export function friendlyError(err: unknown): string {
  if (typeof navigator !== "undefined" && !navigator.onLine) return MESSAGES.OFFLINE;
  if (err instanceof AppError) return err.message;
  const e = (err ?? {}) as PgLikeError;
  const msg = e.message ?? "";
  for (const code of Object.keys(MESSAGES)) {
    if (msg.includes(code)) return MESSAGES[code];
  }
  if (e.code === "23505") return MESSAGES.ALREADY_FLAGGED;
  if (e.code === "42501" || /row-level security|permission denied/i.test(msg)) return MESSAGES.PERMISSION;
  if (/mime type|invalid_mime/i.test(msg)) return MESSAGES.BAD_IMAGE;
  if (/exceeded the maximum allowed size|payload too large/i.test(msg) || e.statusCode === "413")
    return MESSAGES.TOO_LARGE;
  if (/failed to fetch|network/i.test(msg)) return MESSAGES.OFFLINE;
  return "Something went wrong. Please try again.";
}
