import request from '@/utils/request'

const TOKEN_KEY = 'workshop_auth_token'

function getAuthToken() {
  try {
    return localStorage.getItem(TOKEN_KEY) || ''
  } catch {
    return ''
  }
}

function authFetch(url, options = {}) {
  options = options || {}
  options.headers = options.headers || {}
  
  const token = getAuthToken()
  if (token) {
    options.headers['Authorization'] = 'Bearer ' + token
  }
  
  return fetch(url, {
    ...options,
    credentials: 'include',
    cache: 'no-cache',
  })
}

async function fetchMe() {
  const res = await authFetch('/auth/me')
  if (!res.ok) throw new Error('Not authenticated')
  return res.json()
}

async function logout() {
  return authFetch('/auth/logout', { method: 'POST' })
}

async function pollToken(authKey) {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 8000)
  let res

  try {
    res = await fetch(`/auth/poll?key=${encodeURIComponent(authKey)}`, {
      method: 'GET',
      credentials: 'include',
      cache: 'no-store',
      signal: controller.signal,
    })
  } finally {
    clearTimeout(timeoutId)
  }

  return res.json()
}

export default {
  authFetch,
  fetchMe,
  logout,
  pollToken,
  getAuthToken,
}
