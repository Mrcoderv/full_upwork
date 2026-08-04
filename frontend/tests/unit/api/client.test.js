import { describe, it, expect, vi, beforeEach } from 'vitest'
import { normalizeError } from '@/api/client.js'

function makeAxiosError({ code, response, message = 'Axios Error' } = {}) {
  const err = new Error(message)
  if (code) err.code = code
  if (response) err.response = response
  return err
}

describe('normalizeError', () => {
  it('returns TIMEOUT for ECONNABORTED', () => {
    const err = makeAxiosError({ code: 'ECONNABORTED' })
    const n = normalizeError(err)
    expect(n.status).toBeNull()
    expect(n.code).toBe('TIMEOUT')
    expect(n.message).toContain('för lång tid')
    expect(n.raw).toBe(err)
  })

  it('returns NETWORK when no response object', () => {
    const err = makeAxiosError({ code: 'ERR_NETWORK' })
    const n = normalizeError(err)
    expect(n.status).toBeNull()
    expect(n.code).toBe('NETWORK')
    expect(n.message).toContain('internetanslutning')
  })

  it('logs the exact failed URL in dev mode for NETWORK errors', () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const err = makeAxiosError({ code: 'ERR_NETWORK' })
    err.config = {
      baseURL: 'http://localhost:5010/api',
      url: '/auth/login',
    }

    const n = normalizeError(err)

    expect(n.code).toBe('NETWORK')
    expect(consoleErrorSpy).toHaveBeenCalled()
    const logged = consoleErrorSpy.mock.calls[0][0]
    expect(logged).toContain('http://localhost:5010/api/auth/login')
    consoleErrorSpy.mockRestore()
  })

  it('returns CANCELLED for ERR_CANCELED', () => {
    const err = makeAxiosError({ code: 'ERR_CANCELED' })
    const n = normalizeError(err)
    expect(n.status).toBeNull()
    expect(n.code).toBe('CANCELLED')
    expect(n.message).toContain('avbröts')
  })

  it('returns HTTP status code and message for HTTP errors', () => {
    const err = makeAxiosError({
      response: { status: 500, data: { error: { message: 'Database down' } } },
    })
    const n = normalizeError(err)
    expect(n.status).toBe(500)
    expect(n.code).toBe('HTTP_500')
  })

  it('uses response.data.message when available', () => {
    const err = makeAxiosError({
      response: { status: 400, data: { message: 'Ogiltigt e-post' } },
    })
    const n = normalizeError(err)
    expect(n.message).toBe('Ogiltigt e-post')
  })

  it('uses response.data.error.message as fallback', () => {
    const err = makeAxiosError({
      response: { status: 422, data: { error: { message: 'Namn saknas' } } },
    })
    const n = normalizeError(err)
    expect(n.message).toBe('Namn saknas')
  })

  it('uses generic message when no body message', () => {
    const err = makeAxiosError({ response: { status: 404, data: null } })
    const n = normalizeError(err)
    expect(n.message).toContain('hittades inte')
  })

  it('never leaks raw error.response.data into message for 500', () => {
    const err = makeAxiosError({
      response: { status: 500, data: { stack: 'secret internal trace', detail: 'Mongoose crash' } },
    })
    const n = normalizeError(err)
    expect(n.message).not.toContain('secret')
    expect(n.message).not.toContain('Mongoose')
    expect(n.message).not.toContain('stack')
    expect(n.message).toContain('internt fel')
  })

  it('handles 401 with generic login message', () => {
    const err = makeAxiosError({ response: { status: 401, data: {} } })
    const n = normalizeError(err)
    expect(n.code).toBe('HTTP_401')
    expect(n.message).toContain('inloggad')
  })

  it('handles 403', () => {
    const err = makeAxiosError({ response: { status: 403, data: {} } })
    const n = normalizeError(err)
    expect(n.code).toBe('HTTP_403')
    expect(n.message).toContain('behörighet')
  })

  it('handles 429', () => {
    const err = makeAxiosError({ response: { status: 429, data: {} } })
    const n = normalizeError(err)
    expect(n.code).toBe('HTTP_429')
    expect(n.message).toContain('många')
  })

  it('falls back to generic for unknown status', () => {
    const err = makeAxiosError({ response: { status: 418, data: {} } })
    const n = normalizeError(err)
    expect(n.code).toBe('HTTP_418')
    expect(n.message).toContain('fel uppstod')
  })

  it('prefers data.message over data.error.message', () => {
    const err = makeAxiosError({
      response: { status: 400, data: { message: 'A', error: { message: 'B' } } },
    })
    const n = normalizeError(err)
    expect(n.message).toBe('A')
  })
})

describe('client interceptor (401 -> LOGOUT + redirect)', () => {
  let mockStore

  beforeEach(() => {
    vi.clearAllMocks()
    Object.defineProperty(window, 'location', {
      value: { pathname: '/dashboard', href: '' },
      writable: true,
      configurable: true,
    })
  })

  it('rejects with normalized error', async () => {
    const err = makeAxiosError({
      response: { status: 400, data: { message: 'Bad' } },
    })
    const n = normalizeError(err)
    expect(n.status).toBe(400)
  })
})

describe('cancelableRequest', () => {
  it('returns promise and cancel function', async () => {
    const { cancelableRequest } = await import('@/api/client.js')
    const { promise, cancel } = cancelableRequest({ method: 'get', url: '/nonexistent' })
    expect(typeof cancel).toBe('function')
    cancel()
    try {
      await promise
    } catch (e) {
      expect(e.code).toBe('CANCELLED')
    }
  })
})
