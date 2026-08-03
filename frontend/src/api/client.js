import axios from 'axios'

const client = axios.create({
  baseURL: (import.meta.env.VITE_API_URL || '') + '/api',
  withCredentials: true,
  timeout: 30000,
})

/**
 * Normalize Axios errors into a consistent shape so callers never
 * need to inspect raw Axios internals.
 *
 * Shape:
 *   status  – HTTP status number or null (network/timeout)
 *   message – user-safe Swedish string, never leaks backend details
 *   code    – machine-readable: TIMEOUT, NETWORK, CANCELLED, HTTP_4xx …
 *   raw     – the original Axios error (for console.error only)
 */
export function normalizeError(error) {
  if (error.code === 'ECONNABORTED') {
    return {
      status: null,
      message: 'Förfrågningen tog för lång tid. Försök igen.',
      code: 'TIMEOUT',
      raw: error,
    }
  }

  if (error.code === 'ERR_CANCELED') {
    return {
      status: null,
      message: 'Förfrågningen avbröts.',
      code: 'CANCELLED',
      raw: error,
    }
  }

  if (!error.response) {
    return {
      status: null,
      message: 'Kunde inte ansluta till servern. Kontrollera din internetanslutning.',
      code: 'NETWORK',
      raw: error,
    }
  }

  return {
    status: error.response.status,
    message: extractUserMessage(error),
    code: 'HTTP_' + error.response.status,
    raw: error,
  }
}

const GENERIC_MESSAGES = {
  400: 'Ogiltig förfrågan.',
  401: 'Du är inte inloggad.',
  403: 'Du har inte behörighet.',
  404: 'Resursen hittades inte.',
  409: 'En konflikt uppstod.',
  422: 'Inmatningsfel.',
  429: 'För många förfrågningar. Vänta lite.',
  500: 'Ett internt fel uppstod.',
  502: 'Servern svarar inte.',
  503: 'Tjänsten är otillgänglig.',
}

function extractUserMessage(error) {
  const data = error.response?.data

  if (data?.message && typeof data.message === 'string') {
    return data.message
  }
  if (data?.error?.message && typeof data.error.message === 'string') {
    return data.error.message
  }

  return GENERIC_MESSAGES[error.response?.status] || 'Ett fel uppstod. Försök igen.'
}

client.interceptors.response.use(
  (response) => response,
  (error) => {
    const normalized = normalizeError(error)

    if (error.response?.status === 401) {
      import('@/store/store.js').then(({ default: store }) => {
        store.commit('LOGOUT')
        if (
          typeof window !== 'undefined' &&
          window.location.pathname !== '/login'
        ) {
          window.location.href = '/login'
        }
      })
    }

    return Promise.reject(normalized)
  }
)

export function cancelableRequest(config) {
  const controller = new AbortController()
  const promise = client({ ...config, signal: controller.signal })
  return {
    promise,
    cancel: () => controller.abort(),
  }
}

export default client
