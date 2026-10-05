import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { InputError } from "./categories.js";

export const uploadDir = path.resolve(process.cwd(), "uploads");
const maxBytes = 1024 * 1024;

export function validateImageDataUrl(value: string) {
  const match = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
  if (!match) throw new InputError("PNG, JPEG veya WebP görsel seçin");
  const bytes = Buffer.from(match[2], "base64");
  if (!bytes.length || bytes.length > maxBytes) throw new InputError("Görsel en fazla 1 MB olabilir");
  const valid = match[1] === "png"
    ? bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    : match[1] === "jpeg"
      ? bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
      : bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP";
  if (!valid) throw new InputError("Görsel dosyasının biçimi geçersiz");
  return { bytes, extension: match[1] === "jpeg" ? "jpg" : match[1] };
}

export async function saveImage(dataUrl: string) {
  const { bytes, extension } = validateImageDataUrl(dataUrl);
  const name = `${randomUUID()}.${extension}`;
  await mkdir(path.join(uploadDir, "images"), { recursive: true });
  await writeFile(path.join(uploadDir, "images", name), bytes, { flag: "wx" });
  return `/uploads/images/${name}`;
}
