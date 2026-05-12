const API = '/api/v1'

type ErrorBody = { errors?: string[] }

async function errorMessage(res: Response) {
  const errorJson = await res.json().catch(() => null) as ErrorBody | null
  return errorJson?.errors?.join(', ') || `${res.status} ${res.statusText}`
}

export async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(`${API}${path}`)
  if (!res.ok) throw new Error(await errorMessage(res))
  return res.json()
}

export async function patchJson<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(await errorMessage(res))
  return res.json()
}

export async function postJson<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(await errorMessage(res))
  return res.json()
}
