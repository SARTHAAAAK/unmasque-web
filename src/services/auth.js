const API_PREFIX = '/api/auth'
const JSON_HEADERS = { 'Content-Type': 'application/json' }

async function safeParseJson(response) {
  const text = await response.text()
  try {
    return text ? JSON.parse(text) : {}
  } catch {
    return { message: text }
  }
}

async function request(endpoint, options = {}) {
  const response = await fetch(`${API_PREFIX}${endpoint}`, {
    credentials: 'include',
    ...options,
  })
  const data = await safeParseJson(response)
  if (!response.ok) {
    const error = new Error(data.message || 'Authentication request failed.')
    error.status = response.status
    error.response = data
    throw error
  }
  return data
}

export async function login({ email, password, remember }) {
  return request('/login', {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify({ email, password, remember }),
  })
}

export async function signup({ name, email, password }) {
  return request('/signup', {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify({ name, email, password }),
  })
}

export async function refreshSession() {
  return request('/refresh', {
    method: 'POST',
    headers: JSON_HEADERS,
  })
}

export async function logout() {
  return request('/logout', {
    method: 'POST',
    headers: JSON_HEADERS,
  })
}

export async function sendResetEmail({ email }) {
  return request('/forgot', {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify({ email }),
  })
}

export async function verifyResetCode({ email, code }) {
  return request('/verify-reset', {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify({ email, code }),
  })
}

export async function resetPassword({ email, resetToken, password }) {
  return request('/reset', {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify({ email, resetToken, password }),
  })
}

export async function getSessions() {
  return request('/sessions')
}

export async function revokeSession(id) {
  return request(`/sessions/${id}`, { method: 'DELETE' })
}

export async function revokeAllOtherSessions() {
  return request('/sessions', { method: 'DELETE' })
}

export async function getApiKeys() {
  return request('/apikeys')
}

export async function generateApiKey(name) {
  return request('/apikeys', {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify({ name }),
  })
}

export async function revokeApiKey(id) {
  return request(`/apikeys/${id}`, { method: 'DELETE' })
}

export async function changePassword(currentPassword, newPassword) {
  return request('/password', {
    method: 'PUT',
    headers: JSON_HEADERS,
    body: JSON.stringify({ currentPassword, newPassword }),
  })
}

export async function setupTotp() {
  return request('/email-otp/setup', {
    method: 'POST',
    headers: JSON_HEADERS,
  })
}

export async function verifyTotpSetup(token, secret) {
  return request('/email-otp/verify-setup', {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify({ code: token, tempSecret: secret }),
  })
}

export async function verifyTotpDisable(token, secret) {
  return request('/email-otp/verify-disable', {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify({ code: token, tempSecret: secret }),
  })
}

export async function verifyLoginTotp(tempToken, totpToken) {
  return request('/login/verify', {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify({ tempToken, totpToken }),
  })
}
