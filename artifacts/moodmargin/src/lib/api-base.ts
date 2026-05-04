function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

export function getApiBaseUrl(): string | null {
  const configured = import.meta.env.VITE_API_BASE_URL;
  if (typeof configured !== "string") return null;
  const trimmed = configured.trim();
  if (!trimmed) return null;
  return trimTrailingSlash(trimmed);
}

export function getApiPath(path: string): string {
  const apiBase = getApiBaseUrl();
  if (!apiBase) return path;
  if (!path.startsWith("/")) return `${apiBase}/${path}`;
  return `${apiBase}${path}`;
}
