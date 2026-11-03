/**
 * Base URL for the backend API.
 *
 * - Production (Vercel): leave VITE_API_URL unset. Requests go to the same
 *   site (/api/...) and vercel.json forwards them to the Render server, so
 *   login cookies are first-party and work in every browser.
 * - Local development: client/.env sets VITE_API_URL=http://localhost:5000.
 */
export const API_BASE = (import.meta.env.VITE_API_URL ?? "").replace(/\/+$/, "");

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
