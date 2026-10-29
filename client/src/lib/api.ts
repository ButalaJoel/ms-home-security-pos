
const API_BASE = (
  import.meta.env.VITE_API_URL || "http://localhost:5000"
).replace(/\/+$/, "");

export function apiUrl(path: string): string {
  if (/^https?:\/\//i.test(path)) {
    return path;
  }

  return `${API_BASE}${path.startsWith("/") ? path : `/${path}`}`;
}

export function apiFetch(
  path: string,
  options: RequestInit = {},
): Promise<Response> {
  return fetch(apiUrl(path), {
    ...options,
    credentials: "include",
  });
}
