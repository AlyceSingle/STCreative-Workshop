import request from '@/utils/request'

async function fetchStatus() {
  return request.get('/api/creator/status')
}

async function submitApply(reason, platform, publishedWorks) {
  return request.post('/api/creator/apply', {
    reason: reason.trim(),
    platform,
    published_works: publishedWorks.trim(),
  })
}

export default {
  fetchStatus,
  submitApply,
}
