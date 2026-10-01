// ==========================================================
// API CLIENT (fetch wrapper)
// ----------------------------------------------------------
// - Base URL configurable vía VITE_API_URL.
// - Timeout con AbortController.
// - Errores normalizados en ApiError.
// - JSON in / JSON out.
// ==========================================================

const DEFAULT_BASE = 'http://127.0.0.1:8001'
const DEFAULT_TIMEOUT_MS = 20000

function resolveBaseUrl(): string {
  // Vite expone import.meta.env.VITE_* en build y dev.
  // Si no está definida, caemos al default local.
  const fromEnv =
    typeof import.meta !== 'undefined' && (import.meta as any).env
      ? (import.meta as any).env.VITE_API_URL
      : undefined
  return (fromEnv && String(fromEnv).trim()) || DEFAULT_BASE
}

export class ApiError extends Error {
  status: number
  body?: unknown
  constructor(message: string, status: number, body?: unknown) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.body = body
  }
}

interface RequestOptions {
  timeoutMs?: number
  signal?: AbortSignal
  headers?: Record<string, string>
}

async function request<T>(
  method: 'GET' | 'POST',
  path: string,
  body: unknown | undefined,
  options: RequestOptions = {},
): Promise<T> {
  const base = resolveBaseUrl()
  const url = path.startsWith('http') ? path : `${base}${path}`
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS

  // Timeout combinado con señal externa (si la hay).
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  const onExternalAbort = () => ctrl.abort()
  if (options.signal) {
    if (options.signal.aborted) ctrl.abort()
    else options.signal.addEventListener('abort', onExternalAbort, { once: true })
  }

  try {
    const res = await fetch(url, {
      method,
      signal: ctrl.signal,
      headers: {
        Accept: 'application/json',
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(options.headers || {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    })

    const text = await res.text()
    const data = text ? safeJson(text) : undefined

    if (!res.ok) {
      throw new ApiError(
        `HTTP ${res.status} ${res.statusText}`,
        res.status,
        data,
      )
    }
    return data as T
  } catch (err: any) {
    if (err?.name === 'AbortError') {
      throw new ApiError('Request timeout', 0)
    }
    if (err instanceof ApiError) throw err
    throw new ApiError(err?.message || 'Network error', 0, err)
  } finally {
    clearTimeout(timer)
    if (options.signal) {
      options.signal.removeEventListener('abort', onExternalAbort)
    }
  }
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

export const api = {
  get: <T>(path: string, options?: RequestOptions) =>
    request<T>('GET', path, undefined, options),
  post: <T>(path: string, body: unknown, options?: RequestOptions) =>
    request<T>('POST', path, body, options),
  baseUrl: resolveBaseUrl,
}
