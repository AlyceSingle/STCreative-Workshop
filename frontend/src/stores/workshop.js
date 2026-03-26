import { defineStore } from 'pinia'
import { ref } from 'vue'
import { getWorldbookName, saveWorldbookName } from '@/config/sections'
import workshopApi from '@/api/workshop'

// 检测 SillyTavern 环境（直接嵌入 iframe 模式）
function isSillyTavernEnv() {
  return typeof window !== 'undefined' && typeof window.SillyTavern !== 'undefined'
}

// 检测是否从 ST 扩展打开（弹窗模式或 iframe 模式）
function isFromStExtension() {
  if (typeof window === 'undefined') return false
  // 弹窗模式：window.opener 存在（同源时可用）
  if (window.opener && window.opener !== window) return true
  // iframe 模式：嵌入在 SillyTavern 页面的 iframe 中
  if (window.parent && window.parent !== window) return true
  return false
}

// 将 workshop entry 转换为 TavernHelper WorldbookEntry 或自定义格式（不含 uid，由 TH 自动分配）
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

function isUnauthorizedError(err) {
  if (!err) return false

  if (typeof err === 'string') {
    return err === 'Unauthorized' || err.includes('请先登录')
  }

  return err.response?.status === 401 || err.message === 'Unauthorized' || String(err.message || '').includes('请先登录')
}

export const useWorkshopStore = defineStore('workshop', () => {
  // ── Pack 列表状态 ────────────────────────────────────────────
  const packs = ref([])
  const packsHash = ref(null) // 存储上次的数据哈希值
  const packsQuery = ref(null) // 存储上次的查询参数（用于判断是否改变筛选条件）
  const pagination = ref({ page: 1, limit: 20, total: 0, totalPages: 1 })
  const loading = ref(false)
  const error = ref(null)

  // ── 当前 Pack 详情 ───────────────────────────────────────────
  const currentPack = ref(null)
  const currentPackLoading = ref(false)

  // ── ST 订阅状态 ──────────────────────────────────────────────
  // { [packId]: boolean } — 记录哪些 pack 已插入 ST 世界书
  const subscribedPacksInST = ref({})
  const stLoading = ref(false)

  // ── ST 扩展模式状态 ──────────────────────────────────────────
  const stConnected = ref(false) // 是否已连接到 ST 扩展
  const stNotification = ref(null) // { type: 'success'|'error', message: string }
  let _pending = {} // { requestId: { resolve, reject, timer } } 非响应式
  let _listenerAdded = false
  let _requestCounter = 0
  let _stExtensionWindow = null // ST 扩展窗口引用（用于跨域场景）

  // ── 工坊列表状态 ─────────────────────────────────────────────
  const workshops = ref([])
  const workshopsLoading = ref(false)

  // ── 我的订阅状态 ─────────────────────────────────────────────
  const mySubscriptions = ref([])
  const mySubscriptionsLoading = ref(false)

  // ── 动态世界书名称 ────────────────────────────────────────────
  // 默认读取 steampunk 分区的 localStorage 值（或默认值）
  const worldbookName = ref(getWorldbookName('steampunk'))
  const worldbookList = ref([])
  const currentCharWorldbooks = ref({ primary: null, additional: [] })
  const worldbookEntriesMap = ref({})
  const dynamicWorldbooksLoading = ref(false)
  const workshopMetaMap = ref({})

  function setWorldbookName(slug, name) {
    worldbookName.value = name
    saveWorldbookName(slug, name)
  }

  // 切换分区时更新 worldbookName（fallback 到工坊表的 worldbook 字段）
  function loadWorldbookForSection(slug) {
    const stored = getWorldbookName(slug)
    if (stored) {
      worldbookName.value = stored
    } else {
      const w = workshopMetaMap.value[slug] || workshops.value.find(w => w.slug === slug)
      worldbookName.value = w?.worldbook || slug
    }
  }

  function getWorkshopBySlug(slug) {
    if (!slug) return null
    return workshopMetaMap.value[slug] || workshops.value.find(w => w.slug === slug) || null
  }

  // ── 工坊 API 操作 ────────────────────────────────────────────

  // 获取当前用户的订阅模组列表
  async function fetchMySubscriptions() {
    mySubscriptionsLoading.value = true
    error.value = null
    try {
      const json = await workshopApi.fetchMySubscriptions()
      mySubscriptions.value = json.data
    } catch (err) {
      error.value = err.message || '获取订阅列表失败'
    } finally {
      mySubscriptionsLoading.value = false
    }
  }

  function resetUserState() {
    mySubscriptions.value = []
    packChanges.value = {}
  }

  async function fetchWorkshops() {
    workshopsLoading.value = true
    try {
      const json = await workshopApi.fetchWorkshops()
      workshops.value = json.data
      const nextMap = { ...workshopMetaMap.value }
      for (const workshop of json.data) {
        nextMap[workshop.slug] = workshop
      }
      workshopMetaMap.value = nextMap
    } catch (err) {
      error.value = isUnauthorizedError(err) ? '请先登录后查看该工坊内容' : (err.message || err || '获取工坊列表失败')
    } finally {
      workshopsLoading.value = false
    }
  }

  async function fetchWorkshopBySlug(slug) {
    if (!slug) return null

    const cached = workshopMetaMap.value[slug] || workshops.value.find(w => w.slug === slug)
    if (cached) {
      return cached
    }

    try {
      const json = await workshopApi.fetchWorkshopBySlug(slug)
      const workshop = json.data || null
      if (workshop) {
        workshopMetaMap.value = {
          ...workshopMetaMap.value,
          [slug]: workshop,
        }
      }
      return workshop
    } catch (err) {
      error.value = isUnauthorizedError(err) ? '请先登录后查看该工坊内容' : (err.message || err || '获取工坊信息失败')
      return null
    }
  }

  async function createWorkshop(payload) {
    error.value = null
    try {
      const json = await workshopApi.createWorkshop(payload)
      workshops.value = [...workshops.value, json.data]
      return json.data
    } catch (err) {
      error.value = err.message || '创建工坊失败'
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
      error.value = err.message || '更新工坊失败'
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
      error.value = err.message || '删除工坊失败'
      return false
    }
  }

  // ── Pack API 操作 ────────────────────────────────────────────

  // fetchPacks(page, { workshop, search, tag, authorId, sort })
  async function fetchPacks(page = 1, { workshop, search, tag, authorId, sort = 'popular' } = {}) {
    loading.value = true
    error.value = null
    try {
      const json = await workshopApi.fetchPacks(page, { workshop, search, tag, authorId, sort })
      
      // 生成查询参数字符串（用于判断筛选条件是否改变）
      const queryKey = JSON.stringify({ workshop, search, tag, authorId, sort, page })
      const queryChanged = packsQuery.value !== queryKey
      
      // 如果筛选条件改变，清除旧哈希
      if (queryChanged) {
        packsQuery.value = queryKey
        packsHash.value = null
      }
      
      // 对比哈希值，只有数据改变时才更新
      if (json.hash && json.hash === packsHash.value && !queryChanged) {
        // 数据未改变，只更新分页信息
        pagination.value = json.pagination
      } else {
        // 数据有改变，更新所有内容
        packs.value = json.data
        packsHash.value = json.hash
        pagination.value = json.pagination
      }
    } catch (err) {
      error.value = isUnauthorizedError(err) ? '请先登录后查看该工坊内容' : (err.message || err || '获取 Pack 列表失败')
    } finally {
      loading.value = false
    }
  }

  async function fetchPack(packId, options = {}) {
    const { showLoading = true } = options
    if (showLoading) {
      currentPackLoading.value = true
    }
    error.value = null
    try {
      const json = await workshopApi.fetchPack(packId)
      currentPack.value = json.data
      return json.data
    } catch (err) {
      error.value = err.message || '获取 Pack 详情失败'
      return null
    } finally {
      if (showLoading) {
        currentPackLoading.value = false
      }
    }
  }

  function fetchEntry(entryId) {
    if (!currentPack.value || !currentPack.value.entries) return null
    const eid = parseInt(entryId)
    return currentPack.value.entries.find(e => e.id === eid) || null
  }

  async function createPack(payload) {
    error.value = null
    try {
      const json = await workshopApi.createPack(payload)
      return json.data
    } catch (err) {
      error.value = err.message || '创建 Pack 失败'
      return null
    }
  }

  async function updatePack(packId, payload) {
    error.value = null
    try {
      await workshopApi.updatePack(packId, payload)
      return true
    } catch (err) {
      error.value = err.message || '更新 Pack 失败'
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
      error.value = err.message || '删除 Pack 失败'
      return false
    }
  }

  // ── 点赞 ─────────────────────────────────────────────────────

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
      error.value = err.message || '操作失败'
      return null
    }
  }

  // ── 订阅（服务端计数 + 可选 ST 操作）───────────────────────────

  /**
   * 检查条目集合是否包含危险类型（regex/greeting）
   * @param {Array} entries - 条目列表
   * @returns {boolean}
   */
  function hasRiskyEntryTypes(entries) {
    if (!Array.isArray(entries)) return false
    return entries.some(e => e.entry_type === 'regex' || e.entry_type === 'greeting')
  }

  /**
   * 获取条目中的危险类型列表
   * @param {Array} entries - 条目列表
   * @returns {string[]}
   */
  function getRiskyTypes(entries) {
    if (!Array.isArray(entries)) return []
    const types = new Set()
    entries.forEach(e => {
      if (e.entry_type === 'regex' || e.entry_type === 'greeting') {
        types.add(e.entry_type)
      }
    })
    return [...types]
  }

  async function toggleSubscribe(pack, selectedEntryIds = null, forceAction = null) {
    error.value = null
    try {
      // 获取完整条目列表（用于构建版本映射）
      let entries = pack.entries
      if (!entries && (forceAction === 'subscribe' || (!forceAction && !pack.is_subscribed))) {
        const json = await workshopApi.fetchPack(pack.id)
        entries = json.data.entries || []
      }

      // 如果未指定 selectedEntryIds，则默认选中所有条目
      const finalSelectedIds = selectedEntryIds !== null 
        ? selectedEntryIds 
        : (entries ? entries.map(e => e.id) : [])

      const isSubscribing = forceAction === 'subscribe' || (!forceAction && !pack.is_subscribed)

      // ST 扩展模式处理
      if (stConnected.value) {
        if (isSubscribing) {
          // 订阅：先执行 ST 操作，成功后再调用服务器 API
          const stSuccess = await _subscribeViaST(pack, finalSelectedIds)
          if (!stSuccess) {
            return null
          }
        } else {
          // 取消订阅：先调用后端 API 检查是否允许，再执行 ST 删除
          // 传递 in_character_card 让后端判断
          const { hasCharacter } = await _checkCharacterCard()
          const apiOptions = {
            action: 'unsubscribe',
            in_character_card: hasCharacter
          }
          
          try {
            const json = await workshopApi.toggleSubscribe(pack.id, apiOptions)
            
            // 后端允许取消订阅，执行 ST 删除操作
            const stSuccess = await _unsubscribeViaST(pack.id, hasCharacter)
            if (!stSuccess) {
              // ST 删除失败，但后端已取消订阅，显示警告
              stNotification.value = { type: 'warning', message: '订阅已取消，但本地内容清理失败' }
            }
            
            // 更新列表/详情中的数据
            const p = packs.value.find((p) => p.id === pack.id)
            if (p) {
              p.is_subscribed = json.subscribed
              p.sub_count = json.sub_count
            }
            if (currentPack.value && currentPack.value.id === pack.id) {
              currentPack.value.is_subscribed = json.subscribed
              currentPack.value.sub_count = json.sub_count
            }
            
            // 清除该模组的更新状态
            const updated = { ...packChanges.value }
            delete updated[pack.id]
            packChanges.value = updated
            
            return json
          } catch (err) {
            // 后端拒绝取消订阅（如包含 regex/greeting 但不在角色卡中）
            // 注意：request.js 会将错误简化为字符串，所以需要检测 err === 'requires_character_card'
            if (err.response?.data?.error === 'requires_character_card' || err === 'requires_character_card' || (typeof err === 'string' && err.includes('requires_character_card'))) {
              const defaultMsg = '取消订阅失败，包含正则/开场白，请进入角色卡内取消'
              error.value = {
                type: 'requires_character_card',
                message: err.response?.data?.message || defaultMsg,
                risky_types: err.response?.data?.risky_types || []
              }
              stNotification.value = { type: 'error', message: error.value.message }
            } else {
              error.value = err.message || err || '取消订阅失败'
              stNotification.value = { type: 'error', message: error.value }
            }
            return null
          }
        }
      }

      // 调用服务器 API（带条目级别追踪）
      const apiOptions = {
        in_character_card: stConnected.value  // 在 ST 扩展弹窗中 = 角色卡环境
      }
      if (forceAction) {
        apiOptions.action = forceAction
      }
      if (forceAction === 'subscribe' || (!forceAction && !pack.is_subscribed)) {
        apiOptions.selected_entry_ids = finalSelectedIds
        apiOptions.worldbook_name = worldbookName.value
      }

      const json = await workshopApi.toggleSubscribe(pack.id, apiOptions)

      // 更新列表/详情中的数据
      const p = packs.value.find((p) => p.id === pack.id)
      if (p) {
        p.is_subscribed = json.subscribed
        p.sub_count = json.sub_count
      }
      if (currentPack.value && currentPack.value.id === pack.id) {
        currentPack.value.is_subscribed = json.subscribed
        currentPack.value.sub_count = json.sub_count
      }

      // 清除或刷新更新状态
      if (json.subscribed) {
        // 订阅成功：立即检查更新
        await fetchPackChanges(pack.id)
      } else {
        // 取消订阅：清除该模组的更新状态
        const updated = { ...packChanges.value }
        delete updated[pack.id]
        packChanges.value = updated
      }

      // 直接嵌入 ST 模式（非扩展模式）
      if (!stConnected.value && isSillyTavernEnv()) {
        if (json.subscribed) {
          await insertPackToWorldbook(pack, finalSelectedIds)
        } else {
          await removePackFromWorldbook(pack.id)
        }
      }

      return json
    } catch (err) {
      // 特殊处理：需要角色卡环境的错误
      // 注意：request.js 会将错误简化为字符串，所以需要检测 err === 'requires_character_card'
      if (err.response?.data?.error === 'requires_character_card' || err === 'requires_character_card' || (typeof err === 'string' && err.includes('requires_character_card'))) {
        const defaultMsg = '取消订阅失败，包含正则/开场白，请进入角色卡内取消'
        error.value = {
          type: 'requires_character_card',
          message: err.response?.data?.message || defaultMsg,
          risky_types: err.response?.data?.risky_types || []
        }
      } else {
        error.value = err.message || err || '操作失败'
      }
      return null
    }
  }

  // ── 条目 API 操作 ────────────────────────────────────────────

  async function fetchEntry(entryId) {
    try {
      const json = await workshopApi.fetchEntry(entryId)
      return json.data
    } catch (err) {
      error.value = err.message || '获取条目失败'
      return null
    }
  }

  async function createEntry(packId, payload) {
    error.value = null
    try {
      const json = await workshopApi.createEntry(packId, payload)
      return json.data
    } catch (err) {
      error.value = err.message || '添加条目失败'
      return null
    }
  }

  async function createEntries(packId, entries) {
    error.value = null
    try {
      await workshopApi.createEntries(packId, entries)
      return true
    } catch (err) {
      error.value = err.message || '批量添加条目失败'
      return false
    }
  }

  async function updateEntry(entryId, payload) {
    error.value = null
    try {
      await workshopApi.updateEntry(entryId, payload)
      return true
    } catch (err) {
      error.value = err.message || '更新条目失败'
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
      error.value = err.message || '删除条目失败'
      return false
    }
  }

  // ── ST 扩展模式：postMessage 通信 ──────────────────────────────

  // 设置消息监听器（仅添加一次）
  function _setupMessageListener() {
    if (_listenerAdded) return
    _listenerAdded = true
    console.log('[Workshop] 已注册 ST 扩展消息监听器')

    window.addEventListener('message', (event) => {
      const { type, success, message, packIds, entryCountMap, removedCount, source, primary, additional } = event.data || {}
      if (!type) return
      console.log('[Workshop] 收到 postMessage:', {
        type,
        source,
        sameAsOpener: event.source === window.opener,
        sameAsParent: window.parent && window.parent !== window ? event.source === window.parent : false,
        sameAsSavedExtension: event.source === _stExtensionWindow,
      })

      // 特殊处理：接收来自 ST 扩展的 opener 引用
      if (type === 'st_extension_opener' && source === 'st_workshop_extension') {
        _stExtensionWindow = event.source
        console.log('[Workshop] 收到 st_extension_opener，已保存扩展窗口引用并立即发送 workshop_ping')
        // 立即发送 ping
        if (_stExtensionWindow) {
          _stExtensionWindow.postMessage({ type: 'workshop_ping', payload: {} }, '*')
        }
        return
      }

      // 安全检查：必须来自 opener、已保存的扩展窗口、parent（iframe 模式）或酒馆助手脚本
      // 酒馆助手脚本运行在 ST 主页面的子 iframe 中，所以 event.source 不是 window.parent
      // 但它发送的消息是有效的，我们通过消息类型前缀来识别
      const isFromParent = window.parent && window.parent !== window && event.source === window.parent
      const isWorkshopMessage = type.startsWith('workshop_')
      
      // 如果是 workshop_ 开头的消息，放宽检查（脚本版本兼容）
      // 否则必须严格检查来源
      if (!isWorkshopMessage && event.source !== window.opener && event.source !== _stExtensionWindow && !isFromParent) {
        return
      }

      // 握手响应
      if (type === 'workshop_pong') {
        console.log('[Workshop] 收到 workshop_pong，连接已建立')
        stConnected.value = true
        return
      }

      // 获取全量世界书列表结果
      if (type === 'workshop_get_worldbook_list_result') {
        const resolve = _pending['get_worldbook_list']?.resolve
        if (resolve) {
          clearTimeout(_pending['get_worldbook_list']?.timer)
          delete _pending['get_worldbook_list']
          resolve({ success, worldbooks: event.data.worldbooks, message })
        }
        return
      }

      // 获取当前角色世界书结果
      if (type === 'workshop_get_current_worldbooks_result') {
        const resolve = _pending['get_current_worldbooks']?.resolve
        if (resolve) {
          clearTimeout(_pending['get_current_worldbooks']?.timer)
          delete _pending['get_current_worldbooks']
          resolve({ success, primary, additional, message })
        }
        return
      }

      // 获取特定世界书条目结果
      if (type === 'workshop_get_worldbook_entries_result') {
        const name = event.data.worldbookName
        const key = `get_entries_${name}`
        const resolve = _pending[key]?.resolve
        if (resolve) {
          clearTimeout(_pending[key]?.timer)
          delete _pending[key]
          resolve({ success, worldbookName: name, entries: event.data.entries, message })
        }
        return
      }

      // 扫描结果
      if (type === 'workshop_scan_result') {
        const resolve = _pending['scan']?.resolve
        if (resolve) {
          clearTimeout(_pending['scan']?.timer)
          delete _pending['scan']
          resolve({ success, packIds, entryCountMap })
        }
        return
      }

      // 检查角色卡状态结果
      if (type === 'workshop_check_character_result') {
        const key = Object.keys(_pending).find(k => k.startsWith('check_char_'))
        if (key) {
          const { resolve } = _pending[key]
          clearTimeout(_pending[key]?.timer)
          delete _pending[key]
          resolve({ success, hasCharacter: event.data.hasCharacter })
        }
        return
      }

      // 订阅结果
      if (type === 'workshop_subscribe_result') {
        const key = Object.keys(_pending).find(k => k.startsWith('subscribe_'))
        if (key) {
          const { resolve } = _pending[key]
          clearTimeout(_pending[key]?.timer)
          delete _pending[key]
          resolve({ success, message })
        }
        return
      }

      // 取消订阅结果
      if (type === 'workshop_unsubscribe_result') {
        const key = Object.keys(_pending).find(k => k.startsWith('unsubscribe_'))
        if (key) {
          const { resolve } = _pending[key]
          clearTimeout(_pending[key]?.timer)
          delete _pending[key]
          resolve({ success, message })
        }
        return
      }

      // 增量同步结果
      if (type === 'workshop_sync_changes_result') {
        const key = Object.keys(_pending).find(k => k.startsWith('sync_changes_'))
        if (key) {
          const { resolve } = _pending[key]
          clearTimeout(_pending[key]?.timer)
          delete _pending[key]
          resolve({ success, message })
        }
        return
      }
    })
  }

  // 发送消息给 ST 扩展（Promise 包装，20s 超时）
  function _sendToOpener(type, payload, requestKey) {
    return new Promise((resolve, reject) => {
      // 优先使用保存的扩展窗口引用，其次 window.opener，最后 window.parent（iframe 模式）
      const targetWindow = _stExtensionWindow || window.opener || (window.parent !== window ? window.parent : null)
      
      if (!targetWindow || targetWindow === window) {
        console.warn('[Workshop] 发送消息失败，未找到可用的 ST 扩展窗口:', {
          type,
          hasSavedExtension: !!_stExtensionWindow,
          hasOpener: !!(window.opener && window.opener !== window),
          hasParent: !!(window.parent && window.parent !== window),
        })
        reject(new Error('未从 ST 扩展打开'))
        return
      }

      const timer = setTimeout(() => {
        delete _pending[requestKey]
        stConnected.value = false
        console.warn('[Workshop] 请求超时，连接状态已重置:', {
          type,
          requestKey,
        })
        reject(new Error('请求超时（20秒），连接已重置'))
      }, 20000)

      _pending[requestKey] = { resolve, reject, timer }
      // 使用 JSON 深拷贝，确保 Vue reactive proxy 转换为纯对象，避免 DataCloneError
      const plainPayload = JSON.parse(JSON.stringify(payload))
      console.log('[Workshop] 发送消息到 ST 扩展:', {
        type,
        requestKey,
        payload: plainPayload,
        target: targetWindow === _stExtensionWindow
          ? 'saved_extension'
          : targetWindow === window.opener
            ? 'opener'
            : 'parent',
      })
      targetWindow.postMessage({ type, payload: plainPayload }, '*')
    })
  }

  // 初始化 ST 扩展模式（postMessage 握手）
  async function initStExtensionMode() {
    if (stConnected.value) {
      console.log('[Workshop] 已处于连接状态，跳过重复初始化')
      return // 已连接，幂等
    }

    // 始终设置监听器，等待扩展发送 opener 引用
    _setupMessageListener()
    console.log('[Workshop] 开始初始化 ST 扩展握手:', {
      hasOpener: !!(window.opener && window.opener !== window),
      hasParent: !!(window.parent && window.parent !== window),
    })
    
    // 弹窗模式：如果有 window.opener，尝试发送 ping
    if (window.opener && window.opener !== window) {
      console.log('[Workshop] 向 opener 发送初始 workshop_ping')
      window.opener.postMessage({ type: 'workshop_ping', payload: {} }, '*')
    }

    // iframe 模式：如果在 iframe 中，尝试向父窗口发送 ping
    if (window.parent && window.parent !== window) {
      console.log('[Workshop] 向 parent 发送初始 workshop_ping')
      window.parent.postMessage({ type: 'workshop_ping', payload: {} }, '*')
    }
  }

  // 通过 ST 扩展扫描（postMessage）
  async function _scanViaST(wbName) {
    try {
      const result = await _sendToOpener('workshop_scan', { worldbookName: wbName }, 'scan')
      if (result && result.success) {
        const map = {}
        for (const packId of result.packIds || []) {
          map[packId] = true
        }
        subscribedPacksInST.value = map
      }
    } catch (err) {
      subscribedPacksInST.value = {}
    }
  }

  // 检查是否在角色卡中
  async function _checkCharacterCard() {
    try {
      const result = await _sendToOpener('workshop_check_character', {}, `check_char_${++_requestCounter}`)
      return { hasCharacter: result && result.hasCharacter }
    } catch (err) {
      return { hasCharacter: false }
    }
  }

  // 通过 ST 扩展订阅（postMessage）
  async function _subscribeViaST(pack, selectedEntryIds = null) {
    try {
      // 获取完整条目（如果当前 pack 没有 entries）
      let entries = pack.entries
      if (!entries) {
        const json = await workshopApi.fetchPack(pack.id)
        entries = json.data.entries || []
      }

      // 若指定了 selectedEntryIds，仅插入被选中的条目
      if (selectedEntryIds !== null) {
        const idSet = new Set(selectedEntryIds.map(String))
        entries = entries.filter(e => idSet.has(String(e.id)))
      }

      // 转换为 TavernHelper WorldbookEntry 格式（不含 uid）
      const stEntries = entries.map(entry => toStEntry(entry, pack.id))

      // 分类条目
      const worldbookEntries = []
      const regexEntries = []
      const greetingEntries = []

      for (const entry of stEntries) {
        if (entry.type === 'regex') regexEntries.push(entry)
        else if (entry.type === 'greeting') greetingEntries.push(entry)
        else worldbookEntries.push(entry)
      }

      const result = await _sendToOpener('workshop_subscribe', {
        packId: pack.id,
        packTitle: pack.title,
        worldbookName: worldbookName.value,
        entries: stEntries,
        worldbookEntries,
        regexEntries,
        greetingEntries,
      }, `subscribe_${++_requestCounter}`)

      if (result && result.success) {
        subscribedPacksInST.value = { ...subscribedPacksInST.value, [pack.id]: true }
        stNotification.value = { type: 'success', message: result.message || '订阅成功' }
      } else {
        stNotification.value = { type: 'error', message: (result && result.message) || '订阅失败' }
      }
      return result && result.success
    } catch (err) {
      stNotification.value = { type: 'error', message: '订阅失败：' + err.message }
      return false
    }
  }

  // 通过 ST 扩展取消订阅（postMessage）
  // hasCharacter: 是否在角色卡中（决定是否执行角色正则/开场白删除）
  async function _unsubscribeViaST(packId, hasCharacter = false) {
    try {
      const result = await _sendToOpener('workshop_unsubscribe', {
        packId,
        worldbookName: worldbookName.value,
        hasCharacter,  // 传递角色卡状态，让扩展端决定删除范围
      }, `unsubscribe_${++_requestCounter}`)

      if (result && result.success) {
        const updated = { ...subscribedPacksInST.value }
        delete updated[packId]
        subscribedPacksInST.value = updated
        stNotification.value = { type: 'success', message: result.message || '取消订阅成功' }
      } else {
        stNotification.value = { type: 'error', message: (result && result.message) || '取消订阅失败' }
      }
      return result && result.success
    } catch (err) {
      stNotification.value = { type: 'error', message: '取消订阅失败：' + err.message }
      return false
    }
  }

  // 通过 ST 扩展增量同步变更（postMessage）
  async function _syncPackChangesViaST(packId, changesApplied, wbName) {
    try {
      const result = await _sendToOpener('workshop_sync_changes', {
        packId,
        worldbookName: wbName,
        changes: changesApplied,
      }, `sync_changes_${++_requestCounter}`)

      if (result && result.success) {
        stNotification.value = { type: 'success', message: result.message || '同步成功' }
      } else {
        stNotification.value = { type: 'error', message: (result && result.message) || '同步失败' }
      }
      return result && result.success
    } catch (err) {
      stNotification.value = { type: 'error', message: '同步失败：' + err.message }
      return false
    }
  }

  // ── SillyTavern 世界书操作 ───────────────────────────────────

  // ── 动态映射操作 ──────────────────────────────────────────────

  async function fetchCurrentWorldbooks() {
    if (!stConnected.value) return
    dynamicWorldbooksLoading.value = true
    try {
      const res = await _sendToOpener('workshop_get_current_worldbooks', {}, 'get_current_worldbooks')
      if (res && res.success) {
        currentCharWorldbooks.value = { primary: res.primary, additional: res.additional }
      }
    } finally {
      dynamicWorldbooksLoading.value = false
    }
  }

  async function fetchWorldbookEntries(name) {
    if (!stConnected.value || !name) return
    try {
      const res = await _sendToOpener('workshop_get_worldbook_entries', { worldbookName: name }, `get_entries_${name}`)
      if (res && res.success) {
        worldbookEntriesMap.value = { ...worldbookEntriesMap.value, [name]: res.entries }
      }
    } catch (err) {
      // 静默失败
    }
  }

  async function fetchWorldbookList() {
    if (!stConnected.value) return []
    try {
      const res = await _sendToOpener('workshop_get_worldbook_list', {}, 'get_worldbook_list')
      if (res && res.success) {
        worldbookList.value = res.worldbooks || []
        return worldbookList.value
      }
    } catch (err) {
      console.error('[Workshop] 获取世界书列表失败:', err)
    }
    return []
  }

  // 扫描世界书，构建已订阅 pack 的映射 { packId: true }
  async function scanSubscribedPacks() {
    // ST 扩展模式（stConnected 已是可靠标志，不再依赖 window.opener）
    if (stConnected.value) {
      stLoading.value = true
      await _scanViaST(worldbookName.value)
      stLoading.value = false
      return
    }

    // 直接嵌入 ST 模式
    if (!isSillyTavernEnv()) return
    stLoading.value = true
    try {
      if (typeof getWorldbookNames !== 'function' || typeof getWorldbook !== 'function') {
        console.warn('[Workshop] 世界书 API 不可用')
        return
      }

      const names = await getWorldbookNames()
      if (!names.includes(worldbookName.value)) {
        subscribedPacksInST.value = {}
        return
      }

      const entries = await getWorldbook(worldbookName.value)
      const map = {}
      for (const e of entries) {
        if (e.extra && e.extra.source === 'storyshare_workshop' && e.extra.pack_id != null) {
          map[e.extra.pack_id] = true
        }
      }
      subscribedPacksInST.value = map
    } catch (err) {
      console.error('[Workshop] 扫描世界书失败:', err)
    } finally {
      stLoading.value = false
    }
  }

  // 将整个 pack 的所有（或选中的）条目插入到 ST 世界书
  async function insertPackToWorldbook(pack, selectedEntryIds = null) {
    if (!isSillyTavernEnv()) return false
    stLoading.value = true
    try {
      if (typeof getWorldbookNames !== 'function' || typeof createWorldbook !== 'function') {
        throw new Error('世界书 API 不可用')
      }

      // 获取最新 pack 数据（含所有条目）
      let entries = pack.entries
      if (!entries) {
        const json = await workshopApi.fetchPack(pack.id)
        entries = json.data.entries || []
      }

      // 若指定了 selectedEntryIds，仅插入被选中的条目
      if (selectedEntryIds !== null) {
        const idSet = new Set(selectedEntryIds.map(String))
        entries = entries.filter(e => idSet.has(String(e.id)))
      }

      // 确保世界书存在
      const names = await getWorldbookNames()
      if (!names.includes(worldbookName.value)) {
        await createWorldbook(worldbookName.value)
      }

      // 先移除此 pack 的旧条目（幂等操作）
      await deleteWorldbookEntries(
        worldbookName.value,
        e => e.extra && e.extra.source === 'storyshare_workshop' && e.extra.pack_id === pack.id,
        { render: 'debounced' }
      )

      // 插入新条目
      const stEntries = entries.map(entry => toStEntry(entry, pack.id))
      await createWorldbookEntries(worldbookName.value, stEntries, { render: 'immediate' })

      subscribedPacksInST.value = { ...subscribedPacksInST.value, [pack.id]: true }
      return true
    } catch (err) {
      console.error('[Workshop] 插入 Pack 到世界书失败:', err)
      error.value = '插入世界书失败'
      return false
    } finally {
      stLoading.value = false
    }
  }

  // 从 ST 世界书中移除某个 pack 的所有条目
  async function removePackFromWorldbook(packId) {
    if (!isSillyTavernEnv()) return false
    stLoading.value = true
    try {
      if (typeof getWorldbookNames !== 'function' || typeof deleteWorldbookEntries !== 'function') {
        throw new Error('世界书 API 不可用')
      }

      const names = await getWorldbookNames()
      if (!names.includes(worldbookName.value)) return false

      await deleteWorldbookEntries(
        worldbookName.value,
        e => e.extra && e.extra.source === 'storyshare_workshop' && e.extra.pack_id === packId,
        { render: 'immediate' }
      )

      const updated = { ...subscribedPacksInST.value }
      delete updated[packId]
      subscribedPacksInST.value = updated
      return true
    } catch (err) {
      console.error('[Workshop] 移除 Pack 世界书条目失败:', err)
      error.value = '移除世界书条目失败'
      return false
    } finally {
      stLoading.value = false
    }
  }

  // ── Phase 2: 变更检测和版本历史 ────────────────────────────────────

  // 模组变更状态 { [packId]: { hasChanges, summary, changes, lastSyncedAt } }
  const packChanges = ref({})
  const changesLoading = ref(false)

  /**
   * 获取模组变更（对比用户订阅状态）
   * @param {number} packId - 模组 ID
   */
  async function fetchPackChanges(packId) {
    changesLoading.value = true
    error.value = null
    try {
      const json = await workshopApi.fetchPackChanges(packId)
      packChanges.value = { ...packChanges.value, [packId]: json.data }
      return json.data
    } catch (err) {
      // 如果用户未订阅该模组，不显示错误
      if (err.message && err.message.includes('未订阅')) {
        return null
      }
      error.value = err.message || '获取变更失败'
      return null
    } finally {
      changesLoading.value = false
    }
  }

  /**
   * 同步模组更新（全量同步到服务器 + ST）
   * @param {number} packId - 模组 ID
   * @param {string} worldbookNameVal - 目标世界书名称
   */
  async function syncPackUpdates(packId, worldbookNameVal = '') {
    error.value = null
    try {
      // 1. 获取模组最新数据
      const packJson = await workshopApi.fetchPack(packId)
      const pack = packJson.data

      // 2. 如果在 ST 环境，同步到世界书
      if (stConnected.value) {
        const selectedIds = pack.entries.map(e => e.id)
        const stSuccess = await _subscribeViaST(pack, selectedIds)
        if (!stSuccess) {
          return null
        }
      } else if (isSillyTavernEnv()) {
        const selectedIds = pack.entries.map(e => e.id)
        await insertPackToWorldbook(pack, selectedIds)
      }

      // 3. 同步到服务器（更新订阅记录），传递角色卡环境状态
      const json = await workshopApi.syncPackUpdates(
        packId, 
        worldbookNameVal || worldbookName.value,
        stConnected.value  // in_character_card
      )

      // 4. 清除该模组的变更状态
      const updated = { ...packChanges.value }
      delete updated[packId]
      packChanges.value = updated

      // 5. 刷新订阅列表
      await fetchMySubscriptions()

      stNotification.value = { type: 'success', message: json.message || '同步成功' }
      return json
    } catch (err) {
      // 特殊处理：需要角色卡环境的错误
      // 注意：request.js 会将错误简化为字符串
      if (err.response?.data?.error === 'requires_character_card' || err === 'requires_character_card' || (typeof err === 'string' && err.includes('requires_character_card'))) {
        const defaultMsg = '同步失败，包含正则/开场白，请进入角色卡内同步'
        error.value = {
          type: 'requires_character_card',
          message: err.response?.data?.message || defaultMsg,
          risky_types: err.response?.data?.risky_types || []
        }
        stNotification.value = { type: 'error', message: error.value.message }
      } else {
        error.value = err.message || err || '同步失败'
        stNotification.value = { type: 'error', message: error.value }
      }
      return null
    }
  }

  /**
   * 批量获取所有订阅模组的变更状态
   */
  async function fetchAllSubscribedPackChanges() {
    if (mySubscriptions.value.length === 0) return

    changesLoading.value = true
    const results = {}

    for (const sub of mySubscriptions.value) {
      try {
        const json = await workshopApi.fetchPackChanges(sub.id)
        if (json.data && json.data.has_changes) {
          results[sub.id] = json.data
        }
      } catch (err) {
        // 忽略单个模组的错误
        console.warn(`[Workshop] 获取模组 ${sub.id} 变更失败:`, err.message)
      }
    }

    packChanges.value = results
    changesLoading.value = false
  }

  /**
   * 选择性同步模组更新（仅同步用户选中的条目）
   * @param {number} packId - 模组 ID
   * @param {number[]} selectedEntryIds - 用户选中的条目 ID 列表
   * @param {string} worldbookNameVal - 可选的世界书名称（优先级高于 store 中的默认值）
   */
  async function syncPackUpdatesSelective(packId, selectedEntryIds, worldbookNameVal = null) {
    if (!packId || !Array.isArray(selectedEntryIds)) {
      error.value = '参数错误'
      return null
    }

    stLoading.value = true
    error.value = null

    try {
      // 1. 调用后端 API，更新数据库订阅记录（传递角色卡环境状态）
      const json = await workshopApi.syncPackUpdatesSelective(
        packId,
        selectedEntryIds,
        worldbookNameVal || worldbookName.value,
        stConnected.value  // in_character_card
      )

      const { changes_applied } = json

      // 2. 如果在 ST 环境，同步到世界书
      if (stConnected.value) {
        // ST 扩展模式：通过 postMessage 增量同步
        const stSuccess = await _syncPackChangesViaST(packId, changes_applied, worldbookNameVal || worldbookName.value)
        if (!stSuccess) {
          console.error('[Workshop] ST 扩展同步失败')
        }
      } else if (isSillyTavernEnv()) {
        // 直接嵌入 ST 模式：使用全局函数
        if (typeof getWorldbookNames !== 'function' || typeof createWorldbook !== 'function') {
          console.warn('[Workshop] 世界书 API 不可用，跳过世界书同步')
        } else {
          const wbName = worldbookNameVal || worldbookName.value

          // 确保世界书存在
          const names = await getWorldbookNames()
          if (!names.includes(wbName)) {
            await createWorldbook(wbName)
          }

          // 2.1 处理删除（从世界书移除）
          if (changes_applied.deleted && changes_applied.deleted.length > 0) {
            try {
              await deleteWorldbookEntries(
                wbName,
                e => e.extra?.source === 'storyshare_workshop'
                  && e.extra.pack_id === packId
                  && changes_applied.deleted.includes(e.extra.workshop_entry_id),
                { render: 'debounced' }
              )
            } catch (err) {
              console.error('[Workshop] 删除世界书条目失败:', err)
            }
          }

          // 2.2 处理新增和修改（先删除旧的，再插入新的）
          const entriesToUpdate = [
            ...(changes_applied.new || []),
            ...(changes_applied.modified || [])
          ]

          if (entriesToUpdate.length > 0) {
            const entryIds = entriesToUpdate.map(e => e.id)

            try {
              // 删除旧条目（处理修改的情况）
              await deleteWorldbookEntries(
                wbName,
                e => e.extra?.source === 'storyshare_workshop'
                  && e.extra.pack_id === packId
                  && entryIds.includes(e.extra.workshop_entry_id),
                { render: 'debounced' }
              )

              // 插入新条目
              const stEntries = entriesToUpdate.map(entry => toStEntry(entry, packId))
              await createWorldbookEntries(wbName, stEntries, { render: 'immediate' })
            } catch (err) {
              console.error('[Workshop] 更新世界书条目失败:', err)
            }
          }
        }
      }

      // 3. 刷新该模组的变更状态
      await fetchPackChanges(packId)

      // 4. 刷新订阅列表
      await fetchMySubscriptions()

      stNotification.value = { type: 'success', message: json.message || '同步成功' }
      return json
    } catch (err) {
      console.error('[Workshop] 选择性同步失败:', err)
      // 特殊处理：需要角色卡环境的错误
      // 注意：request.js 会将错误简化为字符串
      if (err.response?.data?.error === 'requires_character_card' || err === 'requires_character_card' || (typeof err === 'string' && err.includes('requires_character_card'))) {
        const defaultMsg = '同步失败，包含正则/开场白，请进入角色卡内同步'
        error.value = {
          type: 'requires_character_card',
          message: err.response?.data?.message || defaultMsg,
          risky_types: err.response?.data?.risky_types || []
        }
        stNotification.value = { type: 'error', message: error.value.message }
      } else {
        error.value = err.message || err || '同步失败'
        stNotification.value = { type: 'error', message: error.value }
      }
      return null
    } finally {
      stLoading.value = false
    }
  }

  return {
    // 状态
    packs,
    pagination,
    loading,
    error,
    currentPack,
    currentPackLoading,
    subscribedPacksInST,
    stLoading,
    worldbookName,
    worldbookList,
    currentCharWorldbooks,
    worldbookEntriesMap,
    dynamicWorldbooksLoading,
    workshopMetaMap,
    workshops,
    workshopsLoading,
    mySubscriptions,
    mySubscriptionsLoading,
    // ST 扩展状态
    stConnected,
    stNotification,
    // Phase 2: 变更检测状态
    packChanges,
    changesLoading,
    // 方法
    fetchPacks,
    fetchPack,
    fetchEntry,
    fetchWorkshops,
    fetchWorkshopBySlug,
    fetchMySubscriptions,
    resetUserState,
    toggleLike,
    toggleSubscribe,
    createPack,
    updatePack,
    deletePack,
    createEntry,
    createEntries,
    updateEntry,
    deleteEntry,
    scanSubscribedPacks,
    insertPackToWorldbook,
    removePackFromWorldbook,
    setWorldbookName,
    loadWorldbookForSection,
    getWorkshopBySlug,
    initStExtensionMode,
    fetchWorldbookList,
    fetchCurrentWorldbooks,
    fetchWorldbookEntries,
    // 工坊管理
    createWorkshop,
    updateWorkshop,
    deleteWorkshop,
    // Phase 2: 变更检测方法
    fetchPackChanges,
    syncPackUpdates,
    syncPackUpdatesSelective,
    fetchAllSubscribedPackChanges,
    // 仅同步到 ST 的方法（用于重新同步）
    syncToStOnly: _subscribeViaST,
    // 工具函数
    isSillyTavernEnv,
    isFromStExtension,
    hasRiskyEntryTypes,
    getRiskyTypes,
    checkCharacterCard: _checkCharacterCard,
  }
})
