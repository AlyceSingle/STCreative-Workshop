import request from '@/utils/request'

async function fetchWorkshops() {
  return request.get('/api/workshop/workshops')
}

async function fetchWorkshopBySlug(slug) {
  return request.get(`/api/workshop/workshops/by-slug/${encodeURIComponent(slug)}`)
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

/**
 * 订阅/取消订阅模组
 * @param {number} packId - 模组 ID
 * @param {Object} options - 订阅选项
 * @param {string} [options.action] - 'subscribe' | 'unsubscribe' | null (toggle)
 * @param {number[]} [options.selected_entry_ids] - 选中的条目 ID 列表
 * @param {string} [options.worldbook_name] - 目标世界书名称
 * @param {Object} [options.synced_version_map] - 条目版本映射 { entryId: version }
 * @param {boolean} [options.in_character_card] - 是否在角色卡环境中
 */
async function toggleSubscribe(packId, options = {}) {
  const payload = {}
  if (options.action) payload.action = options.action
  if (options.selected_entry_ids) payload.selected_entry_ids = options.selected_entry_ids
  if (options.worldbook_name) payload.worldbook_name = options.worldbook_name
  if (options.synced_version_map) payload.synced_version_map = options.synced_version_map
  if (options.in_character_card !== undefined) payload.in_character_card = options.in_character_card
  return request.post(`/api/workshop/packs/${packId}/subscribe`, payload)
}

/**
 * 同步模组更新（全量同步）
 * @param {number} packId - 模组 ID
 * @param {string} worldbookName - 目标世界书名称
 * @param {boolean} inCharacterCard - 是否在角色卡环境中
 */
async function syncPackUpdates(packId, worldbookName = '', inCharacterCard = false) {
  return request.post(`/api/workshop/packs/${packId}/sync`, { 
    worldbook_name: worldbookName,
    in_character_card: inCharacterCard
  })
}

/**
 * 选择性同步模组更新（仅同步用户选中的条目）
 * @param {number} packId - 模组 ID
 * @param {number[]} entryIds - 选中的条目 ID 列表
 * @param {string} worldbookName - 目标世界书名称
 * @param {boolean} inCharacterCard - 是否在角色卡环境中
 */
async function syncPackUpdatesSelective(packId, entryIds, worldbookName = '', inCharacterCard = false) {
  return request.post(`/api/workshop/packs/${packId}/sync-selective`, {
    entry_ids: entryIds,
    worldbook_name: worldbookName,
    in_character_card: inCharacterCard
  })
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

// ── Phase 2: 版本历史和变更检测 API ────────────────────────────────────

/**
 * 获取模组变更（对比用户订阅状态）
 * @param {number} packId - 模组 ID
 */
async function fetchPackChanges(packId) {
  return request.get(`/api/workshop/packs/${packId}/changes`)
}

export default {
  fetchWorkshops,
  fetchWorkshopBySlug,
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
  syncPackUpdates,
  syncPackUpdatesSelective,
  fetchMySubscriptions,
  fetchEntry,
  createEntry,
  createEntries,
  updateEntry,
  deleteEntry,
  // Phase 2: 变更检测
  fetchPackChanges,
}
