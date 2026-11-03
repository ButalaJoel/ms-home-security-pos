import { apiFetch } from "./api";

/** An API error that keeps the server's full response (e.g. a list of rejected rows). */
export class ApiError extends Error {
  readonly status: number;
  readonly data: Record<string, unknown>;
  constructor(message: string, status: number, data: Record<string, unknown>) {
    super(message);
    this.status = status;
    this.data = data;
  }
}

/**
 * Calls the API and returns the parsed JSON.
 * Throws an Error carrying the server's message when the request fails,
 * so pages can show it directly.
 */
export async function apiJson<T = Record<string, unknown>>(
  path: string,
  options: RequestInit & { json?: unknown } = {},
): Promise<T> {
  const { json, headers, ...rest } = options;
  let response: Response;
  try {
    response = await apiFetch(path, {
      ...rest,
      headers: json !== undefined ? { "Content-Type": "application/json", ...(headers ?? {}) } : headers,
      body: json !== undefined ? JSON.stringify(json) : rest.body,
    });
  } catch {
    throw new Error("Could not reach the server. Check your internet connection and try again.");
  }

  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  const body = (payload ?? {}) as { success?: boolean; message?: string } & Record<string, unknown>;
  if (!response.ok || body.success === false) {
    if (response.status === 401) throw new ApiError("Your session has ended. Sign in again.", 401, body);
    throw new ApiError(body.message || `Request failed (${response.status}).`, response.status, body);
  }
  return payload as T;
}
