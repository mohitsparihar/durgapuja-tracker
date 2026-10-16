/** Stable ids for sentences in lib/i18n.tsx. */
export type ErrorKey =
  | "err.quotaPandal"
  | "err.quotaPhoto"
  | "err.quotaPhotoPandal"
  | "err.quotaFlag"
  | "err.crowdRate"
  | "err.alreadyFlagged"
  | "err.notSignedIn"
  | "err.notFound"
  | "err.badImage"
  | "err.tooLarge"
  | "err.offline"
  | "err.permission"
  | "err.generic";

/** Codes raised by the database (see supabase/migrations) or the mock store. */
const KEYS: Record<string, ErrorKey> = {
  QUOTA_PANDAL: "err.quotaPandal",
  QUOTA_PHOTO: "err.quotaPhoto",
  QUOTA_PHOTO_PER_PANDAL: "err.quotaPhotoPandal",
  QUOTA_FLAG: "err.quotaFlag",
  CROWD_RATE: "err.crowdRate",
  ALREADY_FLAGGED: "err.alreadyFlagged",
  NOT_SIGNED_IN: "err.notSignedIn",
  NOT_FOUND: "err.notFound",
  BAD_IMAGE: "err.badImage",
  TOO_LARGE: "err.tooLarge",
  OFFLINE: "err.offline",
  PERMISSION: "err.permission",
};

const ENGLISH: Record<ErrorKey, string> = {
  "err.quotaPandal": "You've added 10 pandals today — that's the daily limit. Thank you! Try again tomorrow.",
  "err.quotaPhoto": "You've reached today's photo limit (40). Try again tomorrow.",
  "err.quotaPhotoPandal": "You've already added 10 photos to this pandal.",
  "err.quotaFlag": "You've sent a lot of reports today. Please try again tomorrow.",
  "err.crowdRate": "You reported this pandal's crowd in the last 10 minutes. Thanks — try again a little later.",
  "err.alreadyFlagged": "You've already reported this. We'll take a look.",
  "err.notSignedIn": "Please sign in first.",
  "err.notFound": "This pandal no longer exists.",
  "err.badImage": "Couldn't read this image. Try a JPEG or PNG photo.",
  "err.tooLarge": "This photo is too large even after compression.",
  "err.offline": "You're offline. Check your connection and try again.",
  "err.permission": "You don't have permission to do that.",
  "err.generic": "Something went wrong. Please try again.",
};

export class AppError extends Error {
  constructor(public code: string, message?: string) {
    super(message ?? ENGLISH[KEYS[code] ?? "err.generic"] ?? code);
  }
}

interface PgLikeError {
  code?: string;
  message?: string;
  statusCode?: string | number;
}

/** Id of the sentence to show. UI translates it; friendlyError is the English fallback. */
export function errorKey(err: unknown): ErrorKey {
  if (typeof navigator !== "undefined" && !navigator.onLine) return "err.offline";
  if (err instanceof AppError && KEYS[err.code]) return KEYS[err.code];
  const e = (err ?? {}) as PgLikeError;
  const msg = e.message ?? "";
  for (const code of Object.keys(KEYS)) {
    if (msg.includes(code)) return KEYS[code];
  }
  if (e.code === "23505") return "err.alreadyFlagged";
  if (e.code === "42501" || /row-level security|permission denied/i.test(msg)) return "err.permission";
  if (/mime type|invalid_mime/i.test(msg)) return "err.badImage";
  if (/exceeded the maximum allowed size|payload too large/i.test(msg) || e.statusCode === "413") return "err.tooLarge";
  if (/failed to fetch|network/i.test(msg)) return "err.offline";
  return "err.generic";
}

/** Turns any thrown value (Supabase/Postgres/network/AppError) into a friendly English sentence. */
export function friendlyError(err: unknown): string {
  return ENGLISH[errorKey(err)];
}
