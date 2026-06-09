const API_PREFIX = '/api'

async function request(endpoint, options = {}) {
  const response = await fetch(`${API_PREFIX}${endpoint}`, {
    credentials: 'include',
    ...options,
  })

  if (response.ok) {
    const contentType = response.headers.get('Content-Type') || ''
    if (contentType.includes('application/json')) {
      return response.json()
    }
    return null
  }

  const errorText = await response.text()
  const message = errorText || 'Request failed.'
  const error = new Error(message)
  error.status = response.status
  throw error
}

function buildQueryString(params = {}) {
  const searchParams = new URLSearchParams()
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      searchParams.set(key, value)
    }
  })
  return searchParams.toString() ? `?${searchParams.toString()}` : ''
}

async function downloadFile(endpoint, filename) {
  const response = await fetch(`${API_PREFIX}${endpoint}`, {
    credentials: 'include',
  })
  if (!response.ok) {
    const text = await response.text()
    throw new Error(text || 'Download failed.')
  }
  const blob = await response.blob()
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

export async function getNotifications() {
  return request('/notifications')
}

export async function dismissNotification(id) {
  return request(`/notifications/${id}`, { method: 'DELETE' })
}

export async function getExtractions(params = {}) {
  const query = buildQueryString(params)
  return request(`/extractions${query}`)
}

export async function getExtraction(id) {
  return request(`/extractions/${id}`)
}

export async function getExtractionLogs(id) {
  const response = await fetch(`${API_PREFIX}/extractions/${id}/logs`, {
    credentials: 'include',
  })
  if (!response.ok) {
    const text = await response.text()
    throw new Error(text || 'Failed to load logs.')
  }
  return response.text()
}

export async function abortExtraction(id) {
  return request(`/extractions/${id}/abort`, { method: 'POST' })
}

export async function deleteExtraction(id) {
  return request(`/extractions/${id}`, { method: 'DELETE' })
}

export async function bulkDeleteExtractions(ids) {
  return request('/extractions', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids })
  })
}

export async function cloneExtraction(id) {
  return request(`/extractions/${id}/clone`, { method: 'POST' })
}

export async function downloadSql(id) {
  return downloadFile(`/extractions/${id}/download`, `extraction-${id}.sql`)
}

export async function downloadPdf(id) {
  return downloadFile(`/extractions/${id}/report`, `extraction-${id}.pdf`)
}

export async function exportAllCsv() {
  return downloadFile('/extractions/export', 'extractions.csv')
}

export async function startExtraction(payload) {
  return request('/extractions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })
}


export async function downloadLogs(id) {
  return downloadFile(`/extractions/${id}/logs`, `extraction-${id}-logs.txt`)
}

export async function testConnection(payload) {
  return request('/connections/test', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  })
}

export async function getConnections() {
  return request('/connections')
}

export async function deleteConnection(id) {
  return request(`/connections/${id}`, { method: 'DELETE' })
}

export async function updateConnection(id, payload) {
  return request(`/connections/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  })
}
