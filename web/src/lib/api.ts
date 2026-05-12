const API = '/api/v1'

type ErrorBody = { errors?: string[] }
let getAuthToken: (() => Promise<string | null>) | null = null

export function setAuthTokenGetter(getter: () => Promise<string | null>) {
  getAuthToken = getter
}

async function errorMessage(res: Response) {
  const errorJson = await res.json().catch(() => null) as ErrorBody | null
  return errorJson?.errors?.join(', ') || `${res.status} ${res.statusText}`
}

async function requestJson<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers)
  headers.set('Content-Type', 'application/json')

  const token = await getAuthToken?.()
  if (token) headers.set('Authorization', `Bearer ${token}`)

  const res = await fetch(`${API}${path}`, { ...options, headers })
  if (!res.ok) throw new Error(await errorMessage(res))
  return res.json()
}

export async function getJson<T>(path: string): Promise<T> {
  return requestJson<T>(path)
}

export async function patchJson<T>(path: string, body: Record<string, unknown>): Promise<T> {
  return requestJson<T>(path, {
    method: 'PATCH',
    body: JSON.stringify(body),
  })
}

export async function postJson<T>(path: string, body: Record<string, unknown>): Promise<T> {
  return requestJson<T>(path, {
    method: 'POST',
    body: JSON.stringify(body),
  })
}
