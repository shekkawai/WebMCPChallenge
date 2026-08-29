export const MAX_IMAGE_URL_LENGTH = 12 * 1024 * 1024;

export function localDateISO(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function safeImageUrl(value: unknown): string | undefined {
  if (typeof value !== "string" || value.length === 0 || value.length > MAX_IMAGE_URL_LENGTH) return undefined;
  if (/^data:image\/(?:png|jpe?g|webp|gif|avif|svg\+xml)[;,]/i.test(value)) return value;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && value.length <= 4096 ? value : undefined;
  } catch {
    return undefined;
  }
}

export function safeCssColor(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const color = value.trim();
  if (!color || color.length > 64 || /[;{}]/.test(color)) return undefined;
  if (typeof CSS !== "undefined" && typeof CSS.supports === "function") {
    return CSS.supports("color", color) ? color : undefined;
  }
  return /^(?:#[\da-f]{3,8}|(?:rgb|hsl)a?\([^)]{1,48}\)|[a-z]+)$/i.test(color) ? color : undefined;
}
