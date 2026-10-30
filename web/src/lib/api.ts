const rawApiUrl = (import.meta.env.VITE_API_URL || 'http://localhost:3000').replace(/\/$/, '')
const API = rawApiUrl.endsWith('/api/v1') ? rawApiUrl : `${rawApiUrl}/api/v1`

type ErrorBody = { errors?: string[]; code?: string; latest_work_order?: unknown; invalid?: Array<{ index: number; errors: string[] }> }

export class ApiError extends Error {
  status: number | null
  body: ErrorBody | null
  constructor(message: string, status: number | null, body: ErrorBody | null = null) { super(message); this.name = 'ApiError'; this.status = status; this.body = body }
}
let getAuthToken: (() => Promise<string | null>) | null = null

export function setAuthTokenGetter(getter: () => Promise<string | null>) {
  getAuthToken = getter
}

async function errorMessage(res: Response) {
  const errorJson = await res.json().catch(() => null) as ErrorBody | null
  return new ApiError(errorJson?.errors?.join(', ') || `${res.status} ${res.statusText}`, res.status, errorJson)
}

async function requestJson<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers)
  if (options.body) headers.set('Content-Type', 'application/json')

  const token = await getAuthToken?.()
  if (token) headers.set('Authorization', `Bearer ${token}`)

  let res: Response
  try { res = await fetch(`${API}${path}`, { ...options, headers }) }
  catch { throw new ApiError('The connection was interrupted.', null) }
  if (!res.ok) throw await errorMessage(res)
  if (res.status === 204) return undefined as T
  try { return await res.json() }
  catch { throw new ApiError('The server response could not be read.', null) }
}

async function requestForm<T>(path: string, body: FormData): Promise<T> {
  const headers = new Headers()
  const token = await getAuthToken?.()
  if (token) headers.set('Authorization', `Bearer ${token}`)

  const res = await fetch(`${API}${path}`, { method: 'POST', body, headers })
  if (!res.ok) throw await errorMessage(res)
  return res.json()
}

async function requestBlob(path: string): Promise<Blob> {
  const headers = new Headers()
  const token = await getAuthToken?.()
  if (token) headers.set('Authorization', `Bearer ${token}`)

  const res = await fetch(`${API}${path}`, { headers })
  if (!res.ok) throw await errorMessage(res)
  return res.blob()
}

export async function getJson<T>(path: string): Promise<T> {
  return requestJson<T>(path)
}

export async function patchJson<T>(path: string, body: unknown): Promise<T> {
  return requestJson<T>(path, {
    method: 'PATCH',
    body: JSON.stringify(body),
  })
}

export async function postJson<T>(path: string, body: unknown): Promise<T> {
  return requestJson<T>(path, {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

export async function deleteJson<T>(path: string): Promise<T> {
  return requestJson<T>(path, { method: 'DELETE' })
}

export async function postForm<T>(path: string, body: FormData): Promise<T> {
  return requestForm<T>(path, body)
}

export async function getBlob(path: string): Promise<Blob> {
  return requestBlob(path)
}
