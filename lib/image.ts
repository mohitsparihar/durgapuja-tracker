"use client";

import { LIMITS } from "./config";
import { AppError } from "./errors";

const OK_TYPES = ["image/jpeg", "image/png", "image/webp"];

/**
 * Compress in the browser before upload (~300 KB, max 1600 px). Output is always JPEG so
 * it matches the bucket's allowed MIME types, whatever the camera produced.
 */
export async function compressPhoto(file: File): Promise<Blob> {
  if (!file.type.startsWith("image/")) throw new AppError("BAD_IMAGE");
  const { default: imageCompression } = await import("browser-image-compression");
  let out: Blob;
  try {
    out = await imageCompression(file, {
      maxSizeMB: 0.3,
      maxWidthOrHeight: 1600,
      useWebWorker: true,
      fileType: "image/jpeg",
      initialQuality: 0.8,
    });
  } catch {
    // e.g. HEIC on browsers that can't decode it
    throw new AppError("BAD_IMAGE");
  }
  if (!OK_TYPES.includes(out.type)) throw new AppError("BAD_IMAGE");
  if (out.size > LIMITS.maxPhotoBytes) throw new AppError("TOO_LARGE");
  return out;
}
