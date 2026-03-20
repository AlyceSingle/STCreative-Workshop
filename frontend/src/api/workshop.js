import request from '@/utils/request'

async function fetchWorkshops() {
  return request.get('/api/workshop/workshops')
}

async function createWorkshop(payload) {
  return request.post('/api/workshop/workshops', payload)
}

async function updateWorkshop(id, payload) {
  return request.put(`/api/workshop/workshops/${id}`, payload)
}

async function deleteWorkshop(id) {
  return request.delete(`/api/workshop/workshops/${id}`)
}

async function fetchPacks(page = 1, { workshop, search, tag, authorId, sort = 'popular' } = {}) {
  const params = new URLSearchParams({ page, limit: 20 })
  if (workshop) params.set('workshop', workshop)
  if (search) params.set('q', search)
  if (tag) params.set('tag', tag)
  if (authorId) params.set('author_id', authorId)
  if (sort) params.set('sort', sort)
  return request.get(`/api/workshop?${params}`)
}

async function fetchPack(packId) {
  return request.get(`/api/workshop/packs/${packId}`)
}

async function createPack(payload) {
  return request.post('/api/workshop/packs', payload)
}

async function updatePack(packId, payload) {
  return request.put(`/api/workshop/packs/${packId}`, payload)
}

async function deletePack(packId) {
  return request.delete(`/api/workshop/packs/${packId}`)
}

async function toggleLike(packId) {
  return request.post(`/api/workshop/packs/${packId}/like`)
}

async function toggleSubscribe(packId, forceAction = null) {
  const options = {}
  if (forceAction) {
    options.body = JSON.stringify({ action: forceAction })
    options.headers = { 'Content-Type': 'application/json' }
  }
  return request.post(`/api/workshop/packs/${packId}/subscribe`, forceAction ? { action: forceAction } : {})
}

async function fetchMySubscriptions() {
  return request.get('/api/workshop/my-subscriptions')
}

async function fetchEntry(entryId) {
  return request.get(`/api/workshop/entries/${entryId}`)
}

async function createEntry(packId, payload) {
  return request.post(`/api/workshop/packs/${packId}/entries`, payload)
}

async function createEntries(packId, entries) {
  return request.post(`/api/workshop/packs/${packId}/entries/batch`, { entries })
}

async function updateEntry(entryId, payload) {
  return request.put(`/api/workshop/entries/${entryId}`, payload)
}

async function deleteEntry(entryId) {
  return request.delete(`/api/workshop/entries/${entryId}`)
}

export default {
  fetchWorkshops,
  createWorkshop,
  updateWorkshop,
  deleteWorkshop,
  fetchPacks,
  fetchPack,
  createPack,
  updatePack,
  deletePack,
  toggleLike,
  toggleSubscribe,
  fetchMySubscriptions,
  fetchEntry,
  createEntry,
  createEntries,
  updateEntry,
  deleteEntry,
}
