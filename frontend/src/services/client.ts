const API_BASE_URL = import.meta.env.VITE_API_BASE_URL as string | undefined;

/** True when no backend base URL is configured — UI runs on mock data. */
export const isMockMode = !API_BASE_URL;

export class ApiError extends Error {
  status?: number;
  detail?: string;
  constructor(message: string, status?: number, detail?: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.detail = detail;
  }
}

/** FastAPI's HTTPException bodies look like `{"detail": "..."}`. Best-effort —
 * a non-JSON or differently-shaped error body just leaves `detail` unset. */
async function readErrorDetail(res: Response): Promise<string | undefined> {
  try {
    const body = await res.clone().json();
    return typeof body?.detail === "string" ? body.detail : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Clerk's `getToken()` is only available inside React via `useAuth()`, but
 * `apiFetch`/`apiUpload` are plain functions called from anywhere. `<AuthTokenBridge>`
 * (mounted once inside `<ClerkProvider>`, see App.tsx) pushes the latest
 * `getToken` here so every request can attach it without threading auth
 * through every service function's call sites.
 */
let getAuthToken: (() => Promise<string | null>) | null = null;

export function setAuthTokenGetter(getter: (() => Promise<string | null>) | null) {
  getAuthToken = getter;
}

async function authHeaders(): Promise<HeadersInit> {
  const token = getAuthToken ? await getAuthToken() : null;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  if (!API_BASE_URL) {
    throw new ApiError("VITE_API_BASE_URL is not configured");
  }
  const res = await fetch(`${API_BASE_URL}${path}`, {
    headers: { "Content-Type": "application/json", ...(await authHeaders()) },
    ...init,
  });
  if (!res.ok) {
    throw new ApiError(`Request to ${path} failed`, res.status, await readErrorDetail(res));
  }
  if (res.status === 204) {
    return undefined as T;
  }
  return res.json() as Promise<T>;
}

/** For multipart uploads — no forced Content-Type, browser sets the boundary. */
export async function apiUpload<T>(path: string, formData: FormData): Promise<T> {
  if (!API_BASE_URL) {
    throw new ApiError("VITE_API_BASE_URL is not configured");
  }
  const res = await fetch(`${API_BASE_URL}${path}`, {
    method: "POST",
    headers: await authHeaders(),
    body: formData,
  });
  if (!res.ok) {
    throw new ApiError(`Upload to ${path} failed`, res.status);
  }
  return res.json() as Promise<T>;
}

/** Simulates network latency for mock data so loading states are visible. */
export function mockDelay<T>(value: T, ms = 400): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), ms));
}
