import { defineStore } from 'pinia'
import { ref } from 'vue'
import { getWorldbookName, saveWorldbookName } from '@/config/sections'
import workshopApi from '@/api/workshop'

function isSillyTavernEnv() {
  return typeof window !== 'undefined' && typeof window.SillyTavern !== 'undefined'
}

function isFromStExtension() {
  if (typeof window === 'undefined') return false
  if (window.opener && window.opener !== window) return true
  if (window.parent && window.parent !== window) return true
  return false
}

function toStEntry(entry, packId) {
  if (entry.entry_type === 'regex' || entry.entry_type === 'greeting') {
    return {
      type: entry.entry_type,
      name: entry.name,
      enabled: !!entry.enabled,
      content: entry.content || '',
      extra_data: entry.extra_data || {},
      extra: {
        workshop_entry_id: entry.id,
        pack_id: packId,
        source: 'storyshare_workshop',
      }
    }
  }

  return {
    type: 'worldbook',
    name: entry.name,
    enabled: !!entry.enabled,
    strategy: {
      type: entry.strategy_type || 'selective',
      keys: entry.keys || [],
      keys_secondary: {
        logic: entry.keys_secondary_logic || 'and_any',
        keys: entry.keys_secondary || [],
      },
      scan_depth: entry.scan_depth === 'same_as_global' || entry.scan_depth == null
        ? 'same_as_global'
        : Number(entry.scan_depth),
    },
    position: {
      type: entry.position_type || 'after_character_definition',
      role: entry.position_role || 'system',
      depth: entry.position_depth != null ? Number(entry.position_depth) : 4,
      order: entry.position_order != null ? Number(entry.position_order) : 100,
    },
    content: entry.content || '',
    probability: entry.probability != null ? Number(entry.probability) : 100,
    recursion: {
      prevent_incoming: !!entry.recursion_prevent_incoming,
      prevent_outgoing: !!entry.recursion_prevent_outgoing,
      delay_until: entry.recursion_delay_until != null ? Number(entry.recursion_delay_until) : null,
    },
    effect: {
      sticky: entry.effect_sticky != null ? Number(entry.effect_sticky) : null,
      cooldown: entry.effect_cooldown != null ? Number(entry.effect_cooldown) : null,
      delay: entry.effect_delay != null ? Number(entry.effect_delay) : null,
    },
    extra: {
      workshop_entry_id: entry.id,
      pack_id: packId,
      source: 'storyshare_workshop',
    },
  }
}

export const useWorkshopStore = defineStore('workshop', () => {
  const packs = ref([])
  const pagination = ref({ page: 1, limit: 20, total: 0, totalPages: 1 })
  const loading = ref(false)
  const error = ref(null)

  const currentPack = ref(null)
  const currentPackLoading = ref(false)

  const subscribedPacksInST = ref({})
  const stLoading = ref(false)

  const stConnected = ref(false)
  const stNotification = ref(null)
  let _pending = {}
  let _listenerAdded = false
  let _requestCounter = 0
  let _stExtensionWindow = null

  const workshops = ref([])
  const workshopsLoading = ref(false)

  const mySubscriptions = ref([])
  const mySubscriptionsLoading = ref(false)

  const worldbookName = ref(getWorldbookName('steampunk'))
  const worldbookList = ref([])
  const currentCharWorldbooks = ref({ primary: null, additional: [] })
  const worldbookEntriesMap = ref({})
  const dynamicWorldbooksLoading = ref(false)

  function setWorldbookName(slug, name) {
    worldbookName.value = name
    saveWorldbookName(slug, name)
  }

  function loadWorldbookForSection(slug) {
    const stored = getWorldbookName(slug)
    if (stored) {
      worldbookName.value = stored
    } else {
      const w = workshops.value.find(w => w.slug === slug)
      worldbookName.value = w?.worldbook || slug
    }
  }

  async function fetchMySubscriptions() {
    mySubscriptionsLoading.value = true
    error.value = null
    try {
      const json = await workshopApi.fetchMySubscriptions()
      mySubscriptions.value = json.data
    } catch (err) {
      error.value = err.message || err || '获取订阅列表失败'
    } finally {
      mySubscriptionsLoading.value = false
    }
  }

  async function fetchWorkshops() {
    workshopsLoading.value = true
    try {
      const json = await workshopApi.fetchWorkshops()
      workshops.value = json.data
    } catch (err) {
      error.value = err.message || err || '获取工坊列表失败'
    } finally {
      workshopsLoading.value = false
    }
  }

  async function createWorkshop(payload) {
    error.value = null
    try {
      const json = await workshopApi.createWorkshop(payload)
      workshops.value = [...workshops.value, json.data]
      return json.data
    } catch (err) {
      error.value = err.message || err || '创建工坊失败'
      return null
    }
  }

  async function updateWorkshop(id, payload) {
    error.value = null
    try {
      const json = await workshopApi.updateWorkshop(id, payload)
      workshops.value = workshops.value.map(w => w.id === id ? json.data : w)
      return json.data
    } catch (err) {
      error.value = err.message || err || '更新工坊失败'
      return null
    }
  }

  async function deleteWorkshop(id) {
    error.value = null
    try {
      await workshopApi.deleteWorkshop(id)
      workshops.value = workshops.value.filter(w => w.id !== id)
      return true
    } catch (err) {
      error.value = err.message || err || '删除工坊失败'
      return false
    }
  }

  async function fetchPacks(page = 1, { workshop, search, tag, authorId, sort = 'popular' } = {}) {
    loading.value = true
    error.value = null
    try {
      const json = await workshopApi.fetchPacks(page, { workshop, search, tag, authorId, sort })
      packs.value = json.data
      pagination.value = json.pagination
    } catch (err) {
      error.value = err.message || err || '获取 Pack 列表失败'
    } finally {
      loading.value = false
    }
  }

  async function fetchPack(packId) {
    currentPackLoading.value = true
    error.value = null
    try {
      const json = await workshopApi.fetchPack(packId)
      currentPack.value = json.data
      return json.data
    } catch (err) {
      error.value = err.message || err || '获取 Pack 详情失败'
      return null
    } finally {
      currentPackLoading.value = false
    }
  }

  async function createPack(payload) {
    error.value = null
    try {
      const json = await workshopApi.createPack(payload)
      return json.data
    } catch (err) {
      error.value = err.message || err || '创建 Pack 失败'
      return null
    }
  }

  async function updatePack(packId, payload) {
    error.value = null
    try {
      await workshopApi.updatePack(packId, payload)
      return true
    } catch (err) {
      error.value = err.message || err || '更新 Pack 失败'
      return false
    }
  }

  async function deletePack(packId) {
    error.value = null
    try {
      await workshopApi.deletePack(packId)
      packs.value = packs.value.filter((p) => p.id !== packId)
      return true
    } catch (err) {
      error.value = err.message || err || '删除 Pack 失败'
      return false
    }
  }

  async function toggleLike(packId) {
    error.value = null
    try {
      const json = await workshopApi.toggleLike(packId)
      const pack = packs.value.find((p) => p.id === packId)
      if (pack) {
        pack.is_liked = json.liked
        pack.like_count = json.like_count
      }
      if (currentPack.value && currentPack.value.id === packId) {
        currentPack.value.is_liked = json.liked
        currentPack.value.like_count = json.like_count
      }
      return json
    } catch (err) {
      error.value = err.message || err || '操作失败'
      return null
    }
  }

  async function toggleSubscribe(pack, selectedEntryIds = null, forceAction = null) {
    error.value = null
    try {
      const json = await workshopApi.toggleSubscribe(pack.id, forceAction)
      const p = packs.value.find((p) => p.id === pack.id)
      if (p) {
        p.is_subscribed = json.subscribed
        p.sub_count = json.sub_count
      }
      if (currentPack.value && currentPack.value.id === pack.id) {
        currentPack.value.is_subscribed = json.subscribed
        currentPack.value.sub_count = json.sub_count
      }

      if (stConnected.value) {
        if (json.subscribed) {
          await _subscribeViaST(pack, selectedEntryIds)
        } else {
          await _unsubscribeViaST(pack.id)
        }
        return json
      }

      if (isSillyTavernEnv()) {
        if (json.subscribed) {
          await insertPackToWorldbook(pack, selectedEntryIds)
        } else {
          await removePackFromWorldbook(pack.id)
        }
      }

      return json
    } catch (err) {
      error.value = err.message || err || '操作失败'
      return null
    }
  }

  async function fetchEntry(entryId) {
    try {
      const json = await workshopApi.fetchEntry(entryId)
      return json.data
    } catch (err) {
      error.value = err.message || err || '获取条目失败'
      return null
    }
  }

  async function createEntry(packId, payload) {
    error.value = null
    try {
      const json = await workshopApi.createEntry(packId, payload)
      return json.data
    } catch (err) {
      error.value = err.message || err || '添加条目失败'
      return null
    }
  }

  async function createEntries(packId, entries) {
    error.value = null
    try {
      await workshopApi.createEntries(packId, entries)
      return true
    } catch (err) {
      error.value = err.message || err || '批量添加条目失败'
      return false
    }
  }

  async function updateEntry(entryId, payload) {
    error.value = null
    try {
      await workshopApi.updateEntry(entryId, payload)
      return true
    } catch (err) {
      error.value = err.message || err || '更新条目失败'
      return false
    }
  }

  async function deleteEntry(entryId) {
    error.value = null
    try {
      await workshopApi.deleteEntry(entryId)
      if (currentPack.value && currentPack.value.entries) {
        currentPack.value.entries = currentPack.value.entries.filter((e) => e.id !== entryId)
        currentPack.value.entry_count = currentPack.value.entries.length
      }
      return true
    } catch (err) {
      error.value = err.message || err || '删除条目失败'
      return false
    }
  }

  function _setupMessageListener() {
    if (_listenerAdded) return
    _listenerAdded = true

    window.addEventListener('message', (event) => {
      const { type, success, message, packIds, entryCountMap, removedCount, source, primary, additional } = event.data || {}
      if (!type) return

      console.log('[Workshop] 收到消息:', event.data, 'from:', event.origin)

      if (type === 'st_extension_opener' && source === 'st_workshop_extension') {
        console.log('[Workshop] 接收到 ST 扩展窗口引用')
        _stExtensionWindow = event.source
        if (_stExtensionWindow) {
          console.log('[Workshop] 向 ST 扩展发送 ping')
          _stExtensionWindow.postMessage({ type: 'workshop_ping', payload: {} }, '*')
        }
        return
      }

      const isFromParent = window.parent && window.parent !== window && event.source === window.parent
      if (event.source !== window.opener && event.source !== _stExtensionWindow && !isFromParent) {
        console.log('[Workshop] 忽略未知来源的消息')
        return
      }

      console.log('[Workshop] 收到 ST 扩展消息:', event.data)

      if (type === 'workshop_pong') {
        stConnected.value = true
        return
      }

      if (type === 'workshop_get_worldbook_list_result') {
        const resolve = _pending['get_worldbook_list']?.resolve
        if (resolve) {
          clearTimeout(_pending['get_worldbook_list']?.timer)
          delete _pending['get_worldbook_list']
          resolve({ success, worldbooks: event.data.worldbooks, message })
        }
        return
      }

      if (type === 'workshop_get_current_worldbooks_result') {
        const resolve = _pending['get_current_worldbooks']?.resolve
        if (resolve) {
          clearTimeout(_pending['get_current_worldbooks']?.timer)
          delete _pending['get_current_worldbooks']
          resolve({ success, primary, additional, message })
        }
        return
      }

      if (type === 'workshop_get_entries_result') {
        const resolve = _pending['get_entries']?.resolve
        if (resolve) {
          clearTimeout(_pending['get_entries']?.timer)
          delete _pending['get_entries']
          resolve({ success, entries: event.data.entries, message })
        }
        return
      }

      if (type === 'workshop_insert_entries_result') {
        const resolve = _pending['insert_entries']?.resolve
        if (resolve) {
          clearTimeout(_pending['insert_entries']?.timer)
          delete _pending['insert_entries']
          resolve({ success, insertedCount: event.data.insertedCount, message })
        }
        return
      }

      if (type === 'workshop_remove_by_pack_result') {
        const resolve = _pending['remove_by_pack']?.resolve
        if (resolve) {
          clearTimeout(_pending['remove_by_pack']?.timer)
          delete _pending['remove_by_pack']
          resolve({ success, removedCount, message })
        }
        return
      }

      if (type === 'workshop_get_subscribed_packs_result') {
        const resolve = _pending['get_subscribed_packs']?.resolve
        if (resolve) {
          clearTimeout(_pending['get_subscribed_packs']?.timer)
          delete _pending['get_subscribed_packs']
          resolve({ success, packIds, entryCountMap, message })
        }
        return
      }

      if (type === 'workshop_error') {
        console.error('[Workshop] ST 扩展返回错误:', message)
        stNotification.value = { type: 'error', message }
        for (const key in _pending) {
          const { reject } = _pending[key]
          if (reject) reject(new Error(message))
          clearTimeout(_pending[key]?.timer)
        }
        _pending = {}
      }
    })
  }

  function _sendToST(type, payload = {}) {
    const target = _stExtensionWindow || window.opener || window.parent
    if (!target || target === window) {
      console.warn('[Workshop] 无可用的 ST 扩展窗口')
      return false
    }
    target.postMessage({ type, payload }, '*')
    return true
  }

  function _sendToSTWithResponse(type, payload = {}, timeout = 10000) {
    return new Promise((resolve, reject) => {
      const requestId = `${type}_${++_requestCounter}`
      _pending[requestId] = { resolve, reject }

      const sent = _sendToST(type, payload)
      if (!sent) {
        delete _pending[requestId]
        reject(new Error('无法发送消息到 ST 扩展'))
        return
      }

      _pending[requestId].timer = setTimeout(() => {
        delete _pending[requestId]
        reject(new Error('请求超时'))
      }, timeout)
    })
  }

  async function _subscribeViaST(pack, selectedEntryIds = null) {
    stLoading.value = true
    stNotification.value = null
    try {
      let entries = pack.entries || []
      if (selectedEntryIds && selectedEntryIds.length > 0) {
        entries = entries.filter(e => selectedEntryIds.includes(e.id))
      }
      const stEntries = entries.map(e => toStEntry(e, pack.id))

      const result = await _sendToSTWithResponse('workshop_insert_entries', {
        worldbookName: worldbookName.value,
        entries: stEntries,
      })

      if (result.success) {
        subscribedPacksInST.value[pack.id] = true
        stNotification.value = { type: 'success', message: `已插入 ${result.insertedCount} 条条目` }
      } else {
        stNotification.value = { type: 'error', message: result.message || '插入失败' }
      }
    } catch (err) {
      stNotification.value = { type: 'error', message: err.message || '插入失败' }
    } finally {
      stLoading.value = false
    }
  }

  async function _unsubscribeViaST(packId) {
    stLoading.value = true
    stNotification.value = null
    try {
      const result = await _sendToSTWithResponse('workshop_remove_by_pack', {
        worldbookName: worldbookName.value,
        packId,
      })

      if (result.success) {
        subscribedPacksInST.value[packId] = false
        stNotification.value = { type: 'success', message: `已移除 ${result.removedCount} 条条目` }
      } else {
        stNotification.value = { type: 'error', message: result.message || '移除失败' }
      }
    } catch (err) {
      stNotification.value = { type: 'error', message: err.message || '移除失败' }
    } finally {
      stLoading.value = false
    }
  }

  async function insertPackToWorldbook(pack, selectedEntryIds = null) {
    if (!isSillyTavernEnv()) return

    stLoading.value = true
    try {
      let entries = pack.entries || []
      if (selectedEntryIds && selectedEntryIds.length > 0) {
        entries = entries.filter(e => selectedEntryIds.includes(e.id))
      }
      const stEntries = entries.map(e => toStEntry(e, pack.id))

      const wbName = worldbookName.value || pack.workshop?.worldbook || pack.workshop_slug

      if (window.TavernHelper?.addEntriesToCharacterBook) {
        await window.TavernHelper.addEntriesToCharacterBook(wbName, stEntries)
        subscribedPacksInST.value[pack.id] = true
        console.log(`[Workshop] 已插入 ${stEntries.length} 条条目到世界书 ${wbName}`)
      }
    } catch (err) {
      console.error('[Workshop] 插入世界书失败:', err)
    } finally {
      stLoading.value = false
    }
  }

  async function removePackFromWorldbook(packId) {
    if (!isSillyTavernEnv()) return

    stLoading.value = true
    try {
      if (window.TavernHelper?.removeEntriesBySource) {
        const removed = await window.TavernHelper.removeEntriesBySource('storyshare_workshop', packId)
        subscribedPacksInST.value[packId] = false
        console.log(`[Workshop] 已从世界书移除 ${removed} 条条目 (packId: ${packId})`)
      }
    } catch (err) {
      console.error('[Workshop] 移除世界书条目失败:', err)
    } finally {
      stLoading.value = false
    }
  }

  async function getWorldbookList() {
    if (stConnected.value) {
      try {
        const result = await _sendToSTWithResponse('workshop_get_worldbook_list')
        if (result.success) {
          worldbookList.value = result.worldbooks || []
          return result.worldbooks
        }
      } catch (err) {
        console.error('[Workshop] 获取世界书列表失败:', err)
      }
      return []
    }

    if (isSillyTavernEnv() && window.TavernHelper?.getWorldbookList) {
      try {
        const list = await window.TavernHelper.getWorldbookList()
        worldbookList.value = list
        return list
      } catch (err) {
        console.error('[Workshop] 获取世界书列表失败:', err)
        return []
      }
    }
    return []
  }

  async function getCurrentCharWorldbooks() {
    if (stConnected.value) {
      try {
        const result = await _sendToSTWithResponse('workshop_get_current_worldbooks')
        if (result.success) {
          currentCharWorldbooks.value = {
            primary: result.primary,
            additional: result.additional || [],
          }
          return currentCharWorldbooks.value
        }
      } catch (err) {
        console.error('[Workshop] 获取当前角色世界书失败:', err)
      }
      return null
    }

    if (isSillyTavernEnv() && window.TavernHelper?.getCurrentCharWorldbooks) {
      try {
        const data = await window.TavernHelper.getCurrentCharWorldbooks()
        currentCharWorldbooks.value = data
        return data
      } catch (err) {
        console.error('[Workshop] 获取当前角色世界书失败:', err)
        return null
      }
    }
    return null
  }

  async function getSubscribedPacksInST() {
    if (stConnected.value) {
      try {
        const result = await _sendToSTWithResponse('workshop_get_subscribed_packs', {
          worldbookName: worldbookName.value,
        })
        if (result.success) {
          const map = result.entryCountMap || {}
          for (const packId in map) {
            subscribedPacksInST.value[packId] = map[packId] > 0
          }
          return result.packIds || []
        }
      } catch (err) {
        console.error('[Workshop] 获取已订阅 pack 失败:', err)
      }
      return []
    }

    if (isSillyTavernEnv() && window.TavernHelper?.getEntriesBySource) {
      try {
        const entries = await window.TavernHelper.getEntriesBySource('storyshare_workshop')
        const packIds = new Set()
        const countMap = {}
        for (const e of entries) {
          const packId = e.extra?.pack_id
          if (packId) {
            packIds.add(packId)
            countMap[packId] = (countMap[packId] || 0) + 1
          }
        }
        for (const packId in countMap) {
          subscribedPacksInST.value[packId] = countMap[packId] > 0
        }
        return Array.from(packIds)
      } catch (err) {
        console.error('[Workshop] 获取已订阅 pack 失败:', err)
        return []
      }
    }
    return []
  }

  function initSTListener() {
    _setupMessageListener()
  }

  return {
    packs,
    pagination,
    loading,
    error,
    currentPack,
    currentPackLoading,
    subscribedPacksInST,
    stLoading,
    stConnected,
    stNotification,
    workshops,
    workshopsLoading,
    mySubscriptions,
    mySubscriptionsLoading,
    worldbookName,
    worldbookList,
    currentCharWorldbooks,
    worldbookEntriesMap,
    dynamicWorldbooksLoading,
    setWorldbookName,
    loadWorldbookForSection,
    fetchMySubscriptions,
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
    fetchEntry,
    createEntry,
    createEntries,
    updateEntry,
    deleteEntry,
    insertPackToWorldbook,
    removePackFromWorldbook,
    getWorldbookList,
    getCurrentCharWorldbooks,
    getSubscribedPacksInST,
    initSTListener,
  }
})
