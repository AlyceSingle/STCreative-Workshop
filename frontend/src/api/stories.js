import request from '@/utils/request'

async function fetchStories(page = 1, tag = null) {
  const params = new URLSearchParams({ page, limit: 12 })
  if (tag) params.set('tag', tag)
  return request.get(`/api/stories?${params}`)
}

async function fetchTags() {
  return request.get('/api/tags')
}

async function fetchStory(id) {
  return request.get(`/api/stories/${id}`)
}

async function createStory(payload) {
  return request.post('/api/stories', payload)
}

async function deleteStory(id) {
  return request.delete(`/api/stories/${id}`)
}

export default {
  fetchStories,
  fetchTags,
  fetchStory,
  createStory,
  deleteStory,
}
