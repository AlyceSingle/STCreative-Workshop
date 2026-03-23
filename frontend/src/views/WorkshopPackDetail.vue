<script setup>
import { onMounted, computed, ref, watch } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useWorkshopStore } from '@/stores/workshop'
import { useAuthStore } from '@/stores/auth'
import ConfirmModal from '@/components/ConfirmModal.vue'
import PackUpdateModal from '@/components/PackUpdateModal.vue'
import { buildWorkshopBackRoute, sanitizeWorkshopQuery } from '@/utils/workshopViewState'

const router = useRouter()
const route = useRoute()
const workshopStore = useWorkshopStore()
const authStore = useAuthStore()

const packId = computed(() => parseInt(route.params.packId))
const pack = computed(() => workshopStore.currentPack)
const isOwner = computed(() => authStore.user && pack.value && authStore.user.id === pack.value.author.id)
const isAdmin = computed(() => authStore.user && authStore.user.role === 'admin')
const canAddEntry = computed(() => isOwner.value || isAdmin.value)

const worldbookEntries = computed(() => pack.value?.entries?.filter(e => e.entry_type === 'worldbook' || !e.entry_type) || [])
const regexEntries = computed(() => pack.value?.entries?.filter(e => e.entry_type === 'regex') || [])
const greetingEntries = computed(() => pack.value?.entries?.filter(e => e.entry_type === 'greeting') || [])

const entryCountLabel = computed(() => {
  if (!pack.value) return ''
  const parts = []
  if (worldbookEntries.value.length) parts.push(`${worldbookEntries.value.length} 世界书`)
  if (regexEntries.value.length) parts.push(`${regexEntries.value.length} 正则`)
  if (greetingEntries.value.length) parts.push(`${greetingEntries.value.length} 开场白`)
  if (parts.length === 0) return '0 条条目'
  return parts.join(' · ')
})

// 批量导入文件输入
const batchFileInput = ref(null)

// ═══════════════════════════════════════════════════════════════════════════
// 导出格式转换辅助函数
// ═══════════════════════════════════════════════════════════════════════════

/**
 * 将系统的 source/destination 格式转换为 SillyTavern 的 placement 数组
 * placement: 0=user_input, 1=ai_output, 2=slash_command, 3=world_info
 */
function sourceToPlacement(source) {
  const placement = []
  if (source?.user_input) placement.push(0)
  if (source?.ai_output) placement.push(1)
  if (source?.slash_command) placement.push(2)
  if (source?.world_info) placement.push(3)
  // 默认至少包含 user_input 和 ai_output
  if (placement.length === 0) {
    placement.push(0, 1)
  }
  return placement
}

/**
 * 将系统 regex 条目转换为 SillyTavern 的 RegexScriptData 格式
 */
function convertToRegexScriptData(entry) {
  const ed = entry.extra_data || {}
  const source = ed.source || { user_input: true, ai_output: true, slash_command: true, world_info: false }
  const destination = ed.destination || { display: true, prompt: false }
  
  return {
    id: crypto.randomUUID ? crypto.randomUUID() : `regex_${Date.now()}_${Math.random().toString(36).slice(2)}`,
    scriptName: entry.name || '',
    findRegex: ed.find_regex || '',
    replaceString: entry.content || '',
    trimStrings: [],
    placement: sourceToPlacement(source),
    disabled: !entry.enabled,  // 注意：SillyTavern 使用 disabled 而非 enabled
    markdownOnly: destination.display && !destination.prompt,
    promptOnly: destination.prompt && !destination.display,
    runOnEdit: !!ed.run_on_edit,
    substituteRegex: 0,
    minDepth: ed.min_depth ?? null,
    maxDepth: ed.max_depth ?? null
  }
}

// 导出全量/部分 JSON
function handleBatchExport() {
  if (!pack.value || !pack.value.entries) return
  
  // 使用导出专用的条目 ID 列表进行过滤
  const selectedIds = new Set(exportEntryIds.value)
  const entriesToExport = pack.value.entries.filter(e => selectedIds.has(e.id))
  
  if (entriesToExport.length === 0) {
    alert('请至少选择一个条目进行导出')
    return
  }
  
  showExportConfirm.value = false
  
  // 特殊处理：单个正则条目直接导出为 RegexScriptData 格式（酒馆兼容）
  if (entriesToExport.length === 1 && entriesToExport[0].entry_type === 'regex') {
    const regexData = convertToRegexScriptData(entriesToExport[0])
    const filename = `${entriesToExport[0].name}.json`
    
    const blob = new Blob([JSON.stringify(regexData, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
    return
  }
  
  const exportData = {
    entries: [],
    regexes: [],
    greetings: []  // 开场白导出为字符串数组（SillyTavern alternate_greetings 格式）
  }

  entriesToExport.forEach(entry => {
    if (entry.entry_type === 'regex') {
      // 导出为 SillyTavern RegexScriptData 格式
      exportData.regexes.push(convertToRegexScriptData(entry))
    } else if (entry.entry_type === 'greeting') {
      // 开场白只导出内容字符串（SillyTavern alternate_greetings 是字符串数组）
      if (entry.content) {
        exportData.greetings.push(entry.content)
      }
    } else {
      // 世界书条目保持原有格式（已兼容 ST WorldbookEntry）
      exportData.entries.push({
        name: entry.name,
        enabled: !!entry.enabled,
        strategy: {
          type: entry.strategy_type || 'selective',
          keys: entry.keys || [],
          keys_secondary: {
            logic: entry.keys_secondary_logic || 'and_any',
            keys: entry.keys_secondary || [],
          },
          scan_depth: entry.scan_depth === 'same_as_global' ? 'same_as_global' : (parseInt(entry.scan_depth) || 0)
        },
        position: {
          type: entry.position_type || 'after_character_definition',
          role: entry.position_role || 'system',
          depth: parseInt(entry.position_depth) || 4,
          order: parseInt(entry.position_order) || 100
        },
        content: entry.content || '',
        probability: parseInt(entry.probability) ?? 100,
        recursion: {
          prevent_incoming: !!entry.recursion_prevent_incoming,
          prevent_outgoing: !!entry.recursion_prevent_outgoing,
          delay_until: entry.recursion_delay_until === '' || entry.recursion_delay_until == null ? null : (parseInt(entry.recursion_delay_until) || 0)
        },
        effect: {
          sticky: entry.effect_sticky === '' || entry.effect_sticky == null ? null : (parseInt(entry.effect_sticky) || 0),
          cooldown: entry.effect_cooldown === '' || entry.effect_cooldown == null ? null : (parseInt(entry.effect_cooldown) || 0),
          delay: entry.effect_delay === '' || entry.effect_delay == null ? null : (parseInt(entry.effect_delay) || 0)
        }
      })
    }
  })

  // 根据导出条目数量生成文件名
  let filename
  if (entriesToExport.length === 1) {
    // 单个条目：使用条目名称
    filename = `${entriesToExport[0].name}.json`
  } else if (entriesToExport.length === pack.value.entries.length) {
    // 导出全部条目：使用模组名
    filename = `${pack.value.title || 'pack'}.json`
  } else {
    // 部分条目：使用模组名 + 条目数量
    filename = `${pack.value.title || 'pack'}_${entriesToExport.length}条.json`
  }

  const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

// 批量导入 JSON
function triggerBatchImport() {
  batchFileInput.value?.click()
}

/**
 * 将 SillyTavern 的 placement 数组转换为系统的 source 对象
 * placement: 0=user_input, 1=ai_output, 2=slash_command, 3=world_info
 */
function placementToSource(placement) {
  const source = {
    user_input: false,
    ai_output: false,
    slash_command: false,
    world_info: false
  }
  if (Array.isArray(placement)) {
    if (placement.includes(0)) source.user_input = true
    if (placement.includes(1)) source.ai_output = true
    if (placement.includes(2)) source.slash_command = true
    if (placement.includes(3)) source.world_info = true
  }
  // 默认值
  if (!source.user_input && !source.ai_output && !source.slash_command && !source.world_info) {
    source.user_input = true
    source.ai_output = true
  }
  return source
}

/**
 * 检测并转换 SillyTavern RegexScriptData 格式为系统格式
 * 识别特征：有 scriptName、findRegex 字段
 */
function convertFromRegexScriptData(entry) {
  const isSTFormat = 'scriptName' in entry && 'findRegex' in entry
  if (!isSTFormat) return null
  
  const source = placementToSource(entry.placement)
  const destination = {
    display: entry.markdownOnly || (!entry.markdownOnly && !entry.promptOnly),
    prompt: entry.promptOnly || false
  }
  
  return {
    name: entry.scriptName || '未命名正则',
    enabled: !entry.disabled,  // 注意：SillyTavern 使用 disabled 而非 enabled
    content: entry.replaceString || '',
    entry_type: 'regex',
    extra_data: {
      find_regex: entry.findRegex || '',
      regex_scope: 'global',  // ST 导入的默认为全局
      source,
      destination,
      min_depth: entry.minDepth || null,
      max_depth: entry.maxDepth || null,
      run_on_edit: !!entry.runOnEdit
    }
  }
}

/**
 * ST 世界书 position 数字到系统 position_type 的映射
 */
const ST_POSITION_MAP = {
  0: 'before_character_definition',   // Before Char Defs
  1: 'after_character_definition',    // After Char Defs  
  2: 'before_example_messages',       // Before Example Messages
  3: 'after_example_messages',        // After Example Messages
  4: 'at_depth',                      // At Depth (使用 depth 字段)
  5: 'before_author_note',            // Before Author's Note
  6: 'after_author_note',             // After Author's Note
  7: 'at_depth',                      // Top of AN (特殊)
  8: 'at_depth',                      // Bottom of AN (特殊)
  9: 'before_system_prompt',          // Before System Prompt
  10: 'after_system_prompt'           // After System Prompt
}

/**
 * 转换 SillyTavern 世界书条目格式为系统格式
 * 识别特征：有 comment、key、position（数字）字段
 */
function convertFromSTWorldbookEntry(entry) {
  // 检测是否为 ST 世界书格式
  const isSTFormat = 'comment' in entry && 'key' in entry && typeof entry.position === 'number'
  if (!isSTFormat) return null
  
  // 确定策略类型
  let strategyType = 'selective'
  if (entry.constant) strategyType = 'constant'
  else if (entry.vectorized) strategyType = 'vectorized'
  
  // 确定 selectiveLogic
  const selectiveLogicMap = {
    0: 'and_any',   // AND ANY (默认)
    1: 'not_all',   // NOT ALL
    2: 'not_any',   // NOT ANY
    3: 'and_all'    // AND ALL
  }
  
  return {
    name: entry.comment || '未命名条目',
    enabled: !entry.disable,  // 注意：ST 使用 disable 不是 disabled
    content: entry.content || '',
    entry_type: 'worldbook',
    strategy_type: strategyType,
    keys: Array.isArray(entry.key) ? entry.key : [],
    keys_secondary: Array.isArray(entry.keysecondary) ? entry.keysecondary : [],
    keys_secondary_logic: selectiveLogicMap[entry.selectiveLogic] || 'and_any',
    scan_depth: entry.scanDepth ?? 'same_as_global',
    position_type: ST_POSITION_MAP[entry.position] || 'after_character_definition',
    position_depth: entry.depth ?? 4,
    position_order: entry.order ?? 100,
    position_role: entry.role || 'system',
    probability: entry.probability ?? 100,
    recursion_prevent_incoming: !!entry.preventRecursion,
    recursion_prevent_outgoing: !!entry.excludeRecursion,
    recursion_delay_until: entry.delayUntilRecursion ? 1 : null,
    effect_sticky: entry.sticky || null,
    effect_cooldown: entry.cooldown || null,
    effect_delay: entry.delay || null
  }
}

/**
 * 检测是否为 ST 世界书文件格式 { entries: { "0": {...}, "1": {...} } }
 */
function isSTWorldbookFile(data) {
  return data && typeof data.entries === 'object' && !Array.isArray(data.entries)
}

/**
 * 从 ST 世界书文件提取条目数组
 */
function extractSTWorldbookEntries(data) {
  const entries = []
  if (!data.entries) return entries
  
  // entries 是一个对象，key 是字符串数字 "0", "1", ...
  const keys = Object.keys(data.entries).sort((a, b) => parseInt(a) - parseInt(b))
  for (const key of keys) {
    const entry = data.entries[key]
    const converted = convertFromSTWorldbookEntry(entry)
    if (converted) {
      entries.push(converted)
    }
  }
  return entries
}

/**
 * 预处理单个条目，映射到后端期望的格式
 */
function preprocessEntry(entry) {
  const result = {
    name: entry.name || '未命名条目',
    enabled: entry.enabled !== undefined ? !!entry.enabled : true,
    content: entry.content || '',
    entry_type: entry.entry_type || 'worldbook',
    extra_data: entry.extra_data || {}
  }

  if (entry.strategy) {
    result.strategy_type = entry.strategy.type || 'selective'
    result.keys = entry.strategy.keys || []
    if (entry.strategy.keys_secondary) {
      result.keys_secondary_logic = entry.strategy.keys_secondary.logic || 'and_any'
      result.keys_secondary = entry.strategy.keys_secondary.keys || []
    }
    result.scan_depth = entry.strategy.scan_depth || 'same_as_global'
  } else {
    result.strategy_type = entry.strategy_type || 'selective'
    result.keys = Array.isArray(entry.keys) ? entry.keys : []
    result.keys_secondary_logic = entry.keys_secondary_logic || 'and_any'
    result.keys_secondary = Array.isArray(entry.keys_secondary) ? entry.keys_secondary : []
    result.scan_depth = entry.scan_depth ?? 'same_as_global'
  }

  if (entry.position) {
    result.position_type = entry.position.type || 'after_character_definition'
    result.position_role = entry.position.role || 'system'
    result.position_depth = entry.position.depth !== undefined ? entry.position.depth : 4
    result.position_order = entry.position.order !== undefined ? entry.position.order : 100
  } else {
    result.position_type = entry.position_type || 'after_character_definition'
    result.position_role = entry.position_role || 'system'
    result.position_depth = entry.position_depth !== undefined ? entry.position_depth : 4
    result.position_order = entry.position_order !== undefined ? entry.position_order : 100
  }

  result.probability = entry.probability !== undefined ? entry.probability : 100

  if (entry.recursion) {
    result.recursion_prevent_incoming = !!entry.recursion.prevent_incoming
    result.recursion_prevent_outgoing = !!entry.recursion.prevent_outgoing
    result.recursion_delay_until = entry.recursion.delay_until || null
  } else {
    result.recursion_prevent_incoming = !!entry.recursion_prevent_incoming
    result.recursion_prevent_outgoing = !!entry.recursion_prevent_outgoing
    result.recursion_delay_until = entry.recursion_delay_until || null
  }

  if (entry.effect) {
    result.effect_sticky = entry.effect.sticky || null
    result.effect_cooldown = entry.effect.cooldown || null
    result.effect_delay = entry.effect.delay || null
  } else {
    result.effect_sticky = entry.effect_sticky || null
    result.effect_cooldown = entry.effect_cooldown || null
    result.effect_delay = entry.effect_delay || null
  }

  return result
}

/**
 * 解析导入文件，返回待导入条目列表
 */
function parseImportFile(text) {
  const data = JSON.parse(text)
  let entriesToImport = []
  
  // 检测文件类型并进行相应处理
  if (Array.isArray(data)) {
    // 数组格式：可能是 RegexScriptData 数组或普通条目数组
    for (const item of data) {
      const regexConverted = convertFromRegexScriptData(item)
      if (regexConverted) {
        entriesToImport.push(regexConverted)
      } else if (typeof item === 'string') {
        // 字符串数组视为开场白
        entriesToImport.push({ content: item, entry_type: 'greeting', name: `开场白 ${entriesToImport.length + 1}` })
      } else {
        // 尝试 ST 世界书条目格式
        const wbConverted = convertFromSTWorldbookEntry(item)
        if (wbConverted) {
          entriesToImport.push(wbConverted)
        } else {
          entriesToImport.push({ ...item, entry_type: item.entry_type || 'worldbook' })
        }
      }
    }
  } else if (isSTWorldbookFile(data)) {
    // ST 世界书文件格式 { entries: { "0": {...}, "1": {...} } }
    entriesToImport = extractSTWorldbookEntries(data)
  } else if (convertFromRegexScriptData(data)) {
    // 单个 RegexScriptData 对象
    entriesToImport.push(convertFromRegexScriptData(data))
  } else {
    // 对象格式：包含 entries/regexes/greetings 字段（我们的格式）
    if (Array.isArray(data.entries)) {
      for (const entry of data.entries) {
        const wbConverted = convertFromSTWorldbookEntry(entry)
        if (wbConverted) {
          entriesToImport.push(wbConverted)
        } else {
          entriesToImport.push({ ...entry, entry_type: 'worldbook' })
        }
      }
    }
    if (Array.isArray(data.regexes)) {
      for (const regex of data.regexes) {
        // 尝试转换 SillyTavern RegexScriptData 格式
        const converted = convertFromRegexScriptData(regex)
        if (converted) {
          entriesToImport.push(converted)
        } else {
          // 旧格式或已是系统格式
          entriesToImport.push({ ...regex, entry_type: 'regex' })
        }
      }
    }
    if (Array.isArray(data.greetings)) {
      for (const greeting of data.greetings) {
        if (typeof greeting === 'string') {
          // SillyTavern alternate_greetings 格式（字符串数组）
          entriesToImport.push({ content: greeting, entry_type: 'greeting', name: `开场白 ${entriesToImport.length + 1}` })
        } else {
          // 旧格式（对象）
          entriesToImport.push({ ...greeting, entry_type: 'greeting' })
        }
      }
    }
    // 兼容 SillyTavern 角色卡的 alternate_greetings 字段
    if (Array.isArray(data.alternate_greetings)) {
      for (const greeting of data.alternate_greetings) {
        if (typeof greeting === 'string') {
          entriesToImport.push({ content: greeting, entry_type: 'greeting', name: `开场白 ${entriesToImport.length + 1}` })
        }
      }
    }
  }
  
  // 预处理所有条目
  return entriesToImport.map(preprocessEntry)
}

/**
 * 处理文件选择，解析后显示预览弹窗
 */
async function handleBatchImport(event) {
  const files = Array.from(event.target.files)
  if (!files.length) return

  let allEntries = []
  let errorCount = 0

  for (const file of files) {
    try {
      const text = await new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = e => resolve(e.target.result)
        reader.onerror = e => reject(e)
        reader.readAsText(file)
      })

      const entries = parseImportFile(text)
      allEntries.push(...entries)
    } catch (err) {
      console.error('解析导入文件失败:', file.name, err)
      errorCount++
    }
  }
  
  // 清除文件输入
  event.target.value = ''
  
  if (allEntries.length === 0) {
    if (errorCount > 0) {
      workshopStore.error = `解析失败：无效的 JSON 文件 (${errorCount} 个)`
    } else {
      workshopStore.error = '文件中没有找到可导入的条目'
    }
    return
  }

  // 显示预览弹窗
  pendingImportEntries.value = allEntries
  importSelectedIds.value = allEntries.map((_, idx) => idx)  // 默认全选
  showImportPreview.value = true
}

/**
 * 确认导入选中的条目
 */
async function confirmImport() {
  if (importSelectedIds.value.length === 0) {
    workshopStore.error = '请至少选择一个条目进行导入'
    return
  }

  importingEntries.value = true
  
  try {
    const selectedEntries = importSelectedIds.value.map(idx => pendingImportEntries.value[idx])
    const ok = await workshopStore.createEntries(packId.value, selectedEntries)
    
    if (ok) {
      await workshopStore.fetchPack(packId.value)
      workshopStore.stNotification = { 
        type: 'success', 
        message: `成功导入 ${selectedEntries.length} 条条目`
      }
      showImportPreview.value = false
      pendingImportEntries.value = []
      importSelectedIds.value = []
    } else {
      workshopStore.error = '导入失败，请稍后重试'
    }
  } catch (err) {
    console.error('导入条目失败:', err)
    workshopStore.error = '导入失败：' + (err.message || '未知错误')
  } finally {
    importingEntries.value = false
  }
}

/**
 * 取消导入
 */
function cancelImport() {
  showImportPreview.value = false
  pendingImportEntries.value = []
  importSelectedIds.value = []
}

// 判断用户是否可编辑某条目（条目作者本人 或 pack 作者 或 管理员）
function canEditEntry(entry) {
  if (!authStore.user) return false
  return authStore.user.id === entry.author_id || isOwner.value || isAdmin.value
}

// ───────────────────────────────────────────────────────────────────
// 内容放大查看
// ───────────────────────────────────────────────────────────────────
const showEntryDetailModal = ref(false)
const selectedEntry = ref(null)

function openEntryDetail(entry) {
  selectedEntry.value = entry
  showEntryDetailModal.value = true
}

function closeEntryDetail() {
  showEntryDetailModal.value = false
  selectedEntry.value = null
}

const isStEnv = computed(() => workshopStore.isSillyTavernEnv())

// 订阅状态（服务器端为准）
const isSubscribed = computed(() => {
  return !!pack.value?.is_subscribed
})

// ST 世界书同步状态（仅在 ST 环境中有效）
const isSyncedToST = computed(() => {
  if (!pack.value) return false
  const inStEnv = isStEnv.value || (workshopStore.isFromStExtension() && workshopStore.stConnected)
  if (!inStEnv) return false
  return !!workshopStore.subscribedPacksInST[packId.value]
})

// 是否需要重新同步（已订阅但未同步到世界书）
const needsResync = computed(() => {
  const inStEnv = isStEnv.value || (workshopStore.isFromStExtension() && workshopStore.stConnected)
  return inStEnv && isSubscribed.value && !isSyncedToST.value
})

// 检测是否可以使用订阅功能
const canUseSubscription = computed(() => {
  // 方案1：在ST iframe中直接可用
  if (workshopStore.isSillyTavernEnv()) return true
  
  // 方案2：从ST扩展打开的弹窗，需要检查连接状态
  if (workshopStore.isFromStExtension() && workshopStore.stConnected) return true
  
  return false
})

// Phase 2: 更新检测
const packChangesData = computed(() => {
  if (!pack.value) return null
  return workshopStore.packChanges[pack.value.id] || null
})

const hasUpdates = computed(() => {
  // 只有在已订阅时才显示更新提示
  if (!isSubscribed.value) return false
  return !!packChangesData.value?.has_changes
})

const updateSummary = computed(() => {
  return packChangesData.value?.summary || { new: 0, modified: 0, deleted: 0 }
})

// 更新徽章显示文本
const updateBadgeText = computed(() => {
  if (!hasUpdates.value) return ''
  const parts = []
  if (updateSummary.value.new > 0) parts.push(`${updateSummary.value.new} 新增`)
  if (updateSummary.value.modified > 0) parts.push(`${updateSummary.value.modified} 修改`)
  if (updateSummary.value.deleted > 0) parts.push(`${updateSummary.value.deleted} 删除`)
  return parts.join(', ')
})

// 更新同步弹窗状态
const showUpdateModal = ref(false)
const syncingUpdates = ref(false)

// Phase 2: 打开更新详情弹窗
function openUpdateModal() {
  showUpdateModal.value = true
}

function getPackWorkshopSlug() {
  return pack.value?.workshop?.slug || pack.value?.section || null
}

function getPackNavigationQuery(extraQuery = {}) {
  return {
    ...sanitizeWorkshopQuery({
      ...(getPackWorkshopSlug() ? { workshop: getPackWorkshopSlug() } : {}),
      ...route.query,
    }),
    ...extraQuery,
  }
}

// Phase 2: 选择性同步更新
async function handleSyncUpdatesSelective(selectedEntryIds) {
  if (!pack.value || syncingUpdates.value) return
  syncingUpdates.value = true
  try {
    await workshopStore.syncPackUpdatesSelective(pack.value.id, selectedEntryIds)
    showUpdateModal.value = false
    // 刷新 pack 数据以获取最新条目
    await workshopStore.fetchPack(pack.value.id)
  } finally {
    syncingUpdates.value = false
  }
}

// 返回工坊时携带分区参数
function goBackToWorkshop() {
  router.push(buildWorkshopBackRoute(getPackNavigationQuery()))
}

onMounted(async () => {
  await workshopStore.initStExtensionMode()
  const result = await workshopStore.fetchPack(packId.value)
  if (!result) {
    router.push(buildWorkshopBackRoute(sanitizeWorkshopQuery(route.query)))
    return
  }
  // 按 pack 所属工坊设置世界书名称
  const slug = result.workshop?.slug || result.section
  if (slug) {
    workshopStore.loadWorldbookForSection(slug)
  }
  await workshopStore.scanSubscribedPacks()
  
  // Phase 2: 如果已订阅，检查更新
  if (result.is_subscribed) {
    await workshopStore.fetchPackChanges(packId.value)
  }
})

async function handleLike() {
  if (!authStore.isLoggedIn) { authStore.loginWithDiscord(); return }
  await workshopStore.toggleLike(packId.value)
}

// 订阅确认弹窗状态
const showSubConfirm = ref(false)
const showExportConfirm = ref(false)
const targetWorldbookName = ref('')
// 条目选择（所有条目 ID 的列表，默认全部选中）
const selectedEntryIds = ref([])
// 用户确认已进入正确角色卡
const isCharacterConfirmed = ref(false)
// 重新同步模式标志
const isResyncMode = ref(false)
// 导出条目选择（独立状态，避免与订阅弹窗混淆）
const exportEntryIds = ref([])

// 导入预览弹窗状态
const showImportPreview = ref(false)
const pendingImportEntries = ref([])        // 待导入的条目列表
const importSelectedIds = ref([])           // 选中要导入的条目索引
const importingEntries = ref(false)         // 正在导入中

// 分类待导入条目
const pendingWorldbookEntries = computed(() => pendingImportEntries.value.filter(e => e.entry_type === 'worldbook' || !e.entry_type))
const pendingRegexEntries = computed(() => pendingImportEntries.value.filter(e => e.entry_type === 'regex'))
const pendingGreetingEntries = computed(() => pendingImportEntries.value.filter(e => e.entry_type === 'greeting'))

// 计算是否有包含风险类型的条目（正则/开场白）被选中
const hasRiskyContent = computed(() => {
  if (!pack.value?.entries) return false
  const selectedEntries = pack.value.entries.filter(e => selectedEntryIds.value.includes(e.id))
  return selectedEntries.some(e => e.entry_type === 'regex' || e.entry_type === 'greeting')
})

async function handleSubscribe() {
  if (!authStore.isLoggedIn) { authStore.loginWithDiscord(); return }
  
  // 取消订阅：无需确认，直接执行
  if (isSubscribed.value) {
    console.log("调用我handleSubscribe");
    
    await workshopStore.toggleSubscribe(pack.value, null, 'unsubscribe')
    return
  }
  // 订阅：弹出确认框，初始化目标世界书名称
  // 如果是 ST 扩展模式，先获取世界书列表
  if (workshopStore.isFromStExtension() && workshopStore.stConnected) {
    await workshopStore.fetchWorldbookList()
  }
  targetWorldbookName.value = workshopStore.worldbookName
  
  // 初始化条目选择列表（默认全选）
  selectedEntryIds.value = (pack.value?.entries || []).map(e => e.id)
  
  // 重置确认状态
  isCharacterConfirmed.value = false
  
  showSubConfirm.value = true
}

function handleOpenExport() {
  if (!pack.value || !pack.value.entries || pack.value.entries.length === 0) return
  // 初始化导出条目选择列表（默认全选）
  exportEntryIds.value = pack.value.entries.map(e => e.id)
  showExportConfirm.value = true
}

async function confirmSubscribe() {
  // 如果有风险内容且未确认，则拦截
  if (hasRiskyContent.value && !isCharacterConfirmed.value) return

  showSubConfirm.value = false
  // 如果用户修改了世界书名称，更新 store 中的状态
  if (targetWorldbookName.value.trim()) {
    const slug = pack.value?.workshop?.slug || pack.value?.section || 'default'
    workshopStore.setWorldbookName(slug, targetWorldbookName.value.trim())
  }
  // 传入选中的条目 ID 列表，传 'subscribe' 固定操作方向
  await workshopStore.toggleSubscribe(pack.value, selectedEntryIds.value, 'subscribe')
}

// 重新同步到世界书（仅同步 ST 世界书，不调用服务器 API）
async function handleResync() {
  if (!authStore.isLoggedIn) { authStore.loginWithDiscord(); return }
  
  // 弹出确认框，让用户选择要同步的条目
  if (workshopStore.isFromStExtension() && workshopStore.stConnected) {
    await workshopStore.fetchWorldbookList()
  }
  targetWorldbookName.value = workshopStore.worldbookName
  selectedEntryIds.value = (pack.value?.entries || []).map(e => e.id)
  isCharacterConfirmed.value = false
  showSubConfirm.value = true
  isResyncMode.value = true  // 标记为重新同步模式
}

// 确认重新同步
async function confirmResync() {
  if (hasRiskyContent.value && !isCharacterConfirmed.value) return
  
  showSubConfirm.value = false
  isResyncMode.value = false
  
  // 更新世界书名称
  if (targetWorldbookName.value.trim()) {
    const slug = pack.value?.workshop?.slug || pack.value?.section || 'default'
    workshopStore.setWorldbookName(slug, targetWorldbookName.value.trim())
  }
  
  // 仅同步到 ST，不调用服务器 API
  if (workshopStore.stConnected) {
    await workshopStore.syncToStOnly(pack.value, selectedEntryIds.value)
  } else if (workshopStore.isSillyTavernEnv()) {
    await workshopStore.insertPackToWorldbook(pack.value, selectedEntryIds.value)
  }
  
  // 重新扫描以更新状态
  await workshopStore.scanSubscribedPacks()
}

async function handleDeletePack() {
  if (!confirm('确定要删除这个模组吗？所有条目也会一并删除。')) return
  const ok = await workshopStore.deletePack(packId.value)
  if (ok) goBackToWorkshop()
}

async function handleDeleteEntry(entryId) {
  if (!confirm('确定要删除此条目？')) return
  await workshopStore.deleteEntry(entryId)
}

// 策略类型标签
function strategyLabel(type) {
  return type === 'constant' ? '🔵 蓝灯' : '🟢 绿灯'
}

// ST 扩展通知 toast（4.5s 自动消失）
watch(() => workshopStore.stNotification, (notif) => {
  if (notif) {
    setTimeout(() => {
      workshopStore.stNotification = null
    }, 4500)
  }
})
</script>

<template>
  <div class="page-container py-8 max-w-3xl mx-auto">

    <!-- ST 扩展通知 toast -->
    <Transition
      enter-active-class="transition duration-300 ease-out"
      enter-from-class="opacity-0 -translate-y-3"
      enter-to-class="opacity-100 translate-y-0"
      leave-active-class="transition duration-200 ease-in"
      leave-from-class="opacity-100"
      leave-to-class="opacity-0"
    >
      <div
        v-if="workshopStore.stNotification"
        class="fixed top-20 left-1/2 -translate-x-1/2 z-50 px-5 py-3 rounded-xl text-sm font-bold shadow-lg max-w-md"
        :style="workshopStore.stNotification?.type === 'success'
          ? 'background:#DCFCE7; color:#16A34A; border:2px solid #22C55E; box-shadow:3px 3px 0 #22C55E;'
          : 'background:#FEF2F2; color:#EF4444; border:2px solid #FECACA; box-shadow:3px 3px 0 #FECACA;'"
      >
        {{ workshopStore.stNotification?.message }}
      </div>
    </Transition>

    <!-- 返回按钮 -->
    <button class="btn-secondary text-sm mb-6" @click="goBackToWorkshop">
      ← 返回工坊
    </button>

    <!-- 加载中 -->
    <div v-if="workshopStore.currentPackLoading" class="flex justify-center py-20">
      <div class="w-10 h-10 rounded-full animate-spin" style="border:3px solid #FED7AA; border-top-color:#F97316;"></div>
    </div>

    <template v-else-if="pack">

      <!-- ST 扩展连接横幅 -->
      <div
        v-if="workshopStore.isFromStExtension() && workshopStore.stConnected"
        class="mb-4 px-4 py-3 rounded-xl text-sm font-bold flex items-center gap-2"
        style="background:#DCFCE7; color:#16A34A; border:2px solid #22C55E; box-shadow:3px 3px 0 #22C55E;"
      >
        <svg class="w-5 h-5 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="20 6 9 17 4 12"/>
        </svg>
        <span>已连接到 SillyTavern 扩展 — 「{{ workshopStore.worldbookName }}」</span>
      </div>

      <!-- 错误提示 -->
      <div
        v-if="workshopStore.error"
        class="mb-4 px-4 py-3 rounded-xl text-sm font-semibold"
        style="background:#FEF2F2; color:#EF4444; border:1.5px solid #FECACA;"
      >
        {{ workshopStore.error }}
      </div>

      <!-- Pack 头部卡片 -->
      <div
        class="mb-6 p-6 flex flex-col gap-4"
        style="background:white; border:2.5px solid #FDBA74; border-radius:20px; box-shadow:5px 5px 0 #FDBA74;"
      >
        <!-- 作者行 -->
        <div class="flex items-center gap-2.5">
          <img :src="pack.author.avatar" :alt="pack.author.username" class="w-8 h-8 rounded-full object-cover" style="border:2px solid #FDBA74;"/>
          <span class="text-sm font-semibold" style="color:#A8A29E; font-family:'Nunito',sans-serif;">{{ pack.author.display_name || pack.author.username }}</span>
        </div>

        <!-- 标题 -->
        <h1 class="text-2xl font-bold" style="font-family:'Fredoka',sans-serif; color:#431407;">
          {{ pack.title }}
        </h1>

        <!-- 描述 -->
        <p v-if="pack.description" class="text-sm" style="color:#78716C; font-family:'Nunito',sans-serif; line-height:1.7;">
          {{ pack.description }}
        </p>

        <!-- 元数据行 -->
        <div class="flex items-center gap-4 flex-wrap text-xs" style="color:#A8A29E; font-family:'Nunito',sans-serif;">
          <span>{{ entryCountLabel }}</span>
          <span>{{ new Date(pack.created_at).toLocaleDateString('zh-CN') }} 发布</span>
          <span v-if="isSubscribed" style="color:#16A34A; font-weight:700;">✓ 已订阅</span>
          <span v-if="isSyncedToST" style="color:#2563EB; font-weight:700;">已同步到世界书</span>
          <span v-if="needsResync" style="color:#EA580C; font-weight:700;">需要重新同步</span>
          <!-- Phase 2: 更新提示徽章 -->
          <button
            v-if="hasUpdates"
            class="update-badge flex items-center gap-1.5 px-3 py-1 rounded-full font-bold text-xs transition-all duration-150 hover:scale-105"
            style="background:#FEF3C7; color:#D97706; border:2px solid #F59E0B; box-shadow:2px 2px 0 #F59E0B;"
            @click="openUpdateModal"
          >
            <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="10"/>
              <line x1="12" y1="16" x2="12" y2="12"/>
              <line x1="12" y1="8" x2="12.01" y2="8"/>
            </svg>
            更新：{{ updateBadgeText }}
          </button>
        </div>

        <!-- 操作按钮行 -->
        <div class="flex items-center gap-3 flex-wrap">
          <!-- 点赞 -->
          <button
            class="btn-action-like flex items-center gap-1.5 px-4 py-2 rounded-full font-bold text-sm transition-all duration-150"
            :style="pack.is_liked
              ? 'background:#FFF7ED; color:#EA580C; border:2.5px solid #F97316; box-shadow:3px 3px 0 #F97316;'
              : 'background:#FFFBF0; color:#A8A29E; border:2.5px solid #E7E5E4; box-shadow:3px 3px 0 #E7E5E4;'"
            @click="handleLike"
            :disabled="workshopStore.stLoading"
          >
            <svg class="like-icon w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
            </svg>
            {{ pack.like_count }} 点赞
          </button>

          <!-- 订阅 -->
          <button
            class="btn-action-sub flex items-center gap-1.5 px-4 py-2 rounded-full font-bold text-sm transition-all duration-150"
            :style="isSubscribed
              ? 'background:#F0FDF4; color:#16A34A; border:2.5px solid #22C55E; box-shadow:3px 3px 0 #22C55E;'
              : 'background:#FFFBF0; color:#A8A29E; border:2.5px solid #E7E5E4; box-shadow:3px 3px 0 #E7E5E4;'"
            @click="handleSubscribe"
            :disabled="!canUseSubscription || workshopStore.stLoading"
            :title="!canUseSubscription ? '需要在SillyTavern中使用订阅功能' : ''"
          >
            <svg class="sub-icon w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12 22c1.1 0 2-.9 2-2H10c0 1.1.9 2 2 2z"/>
              <path d="M18 16V11a6 6 0 0 0-5-5.91V4a1 1 0 0 0-2 0v1.09A6 6 0 0 0 6 11v5l-2 2v1h16v-1l-2-2z"/>
            </svg>
            <span v-if="workshopStore.stLoading">处理中…</span>
            <template v-else>
              <span v-if="workshopStore.isFromStExtension() && workshopStore.stConnected">
                {{ isSubscribed ? '取消订阅' : '订阅到 ST' }}（{{ pack.sub_count }}）
              </span>
              <span v-else>
                {{ isSubscribed ? '取消订阅' : '订阅' }}（{{ pack.sub_count }}）
              </span>
            </template>
          </button>

          <!-- 重新同步按钮（仅在需要时显示） -->
          <button
            v-if="needsResync"
            class="btn-secondary text-sm flex items-center gap-1.5"
            @click="handleResync"
            :disabled="workshopStore.stLoading"
          >
            <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="23 4 23 10 17 10"></polyline>
              <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path>
            </svg>
            重新同步到世界书
          </button>

          <!-- 作者操作 -->
          <template v-if="isOwner">
            <RouterLink
              :to="{ name: 'workshop-pack-edit', params: { packId: pack.id }, query: getPackNavigationQuery() }"
              class="btn-secondary text-sm"
            >
              编辑模组
            </RouterLink>
            <button class="btn-danger text-sm" @click="handleDeletePack">
              删除模组
            </button>
          </template>
        </div>
      </div>

    <!-- 条目详情模态框 -->
    <Teleport to="body">
      <Transition
        enter-active-class="transition duration-200 ease-out"
        enter-from-class="opacity-0 scale-95"
        enter-to-class="opacity-100 scale-100"
        leave-active-class="transition duration-150 ease-in"
        leave-from-class="opacity-100 scale-100"
        leave-to-class="opacity-0 scale-95"
      >
        <div
          v-if="showEntryDetailModal"
          class="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-8"
          style="background: rgba(0,0,0,0.5);"
          @click.self="closeEntryDetail"
        >
          <div
            class="w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden"
            style="background:#FFFBF0; border:3px solid #FDBA74; border-radius:24px; box-shadow:8px 8px 0 #FDBA74;"
          >
            <!-- 模态框页头 -->
            <div class="p-5 border-b-2 border-dashed border-[#FDBA74] flex items-center justify-between">
              <div>
                <h3 class="text-xl font-bold" style="font-family:'Fredoka',sans-serif; color:#9A3412;">
                  {{ selectedEntry?.name || '未命名条目' }}
                </h3>
                <div class="flex gap-3 mt-1 text-xs font-bold" style="color:#A8A29E;">
                  <span v-if="selectedEntry?.strategy_type" class="uppercase">{{ selectedEntry.strategy_type }} Strategy</span>
                </div>
              </div>
              <button
                @click="closeEntryDetail"
                class="w-10 h-10 rounded-full flex items-center justify-center transition-colors cursor-pointer"
                style="color:#EA580C; border:2px solid #FDBA74; background:#FFF7ED;"
              >
                <svg class="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>

            <!-- 模态框内容 -->
            <div class="flex-1 overflow-y-auto p-6 custom-scrollbar">
              <div class="mb-6 p-4 rounded-2xl bg-white border-2 border-[#FDBA74] whitespace-pre-wrap text-sm leading-relaxed" style="color:#431407; font-family:'Nunito',sans-serif;">
                <span style="white-space:pre-line;">{{ selectedEntry?.content }}</span>
              </div>
              
              <!-- 更多元数据 -->
              <div class="grid grid-cols-2 gap-4">
                <div class="p-3 rounded-xl bg-[#FFF7ED] border border-[#FDBA74]">
                  <span class="block text-[10px] text-[#A8A29E] uppercase font-bold">关键词</span>
                  <div class="flex flex-wrap gap-1.5 mt-1">
                    <span v-for="key in (selectedEntry?.keys || [])" :key="key" class="tag-badge">{{ key }}</span>
                    <span v-if="!(selectedEntry?.keys?.length)" class="text-xs text-gray-400 font-bold">(无)</span>
                  </div>
                </div>
                <!-- 次要关键词 -->
                <div class="p-3 rounded-xl bg-[#FFF7ED] border border-[#FDBA74]">
                  <span class="block text-[10px] text-[#A8A29E] uppercase font-bold">次要关键词</span>
                   <div class="flex flex-wrap gap-1.5 mt-1">
                    <span v-for="key in (selectedEntry?.keys_secondary || [])" :key="key" class="tag-badge" style="background:#EFF6FF; color:#2563EB; border-color:#BFDBFE;">{{ key }}</span>
                    <span v-if="!(selectedEntry?.keys_secondary?.length)" class="text-xs text-gray-400 font-bold">(无)</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>

      <!-- ── 世界书列表 ─────────────────────────────── -->
      <div class="flex items-center justify-between mb-3 mt-4">
        <h2 class="font-bold text-lg" style="font-family:'Fredoka',sans-serif; color:#EA580C;">
          世界书条目 ({{ worldbookEntries.length }})
        </h2>
        <div class="flex items-center gap-2">
          <template v-if="canAddEntry">
            <input type="file" ref="batchFileInput" class="hidden" accept=".json" multiple @change="handleBatchImport" />
            <button type="button" class="btn-secondary text-sm py-1.5 px-3" @click="triggerBatchImport">
              导入 JSON
            </button>
          </template>
          <button type="button" class="btn-secondary text-sm py-1.5 px-3" @click="handleOpenExport">
            导出 JSON
          </button>
          <RouterLink v-if="canAddEntry" :to="{ name: 'workshop-entry-new', params: { packId: pack.id }, query: getPackNavigationQuery({ type: 'worldbook' }) }" class="btn-primary text-sm">
            添加条目
          </RouterLink>
        </div>
      </div>
      <div v-if="worldbookEntries.length === 0" class="flex flex-col items-center justify-center py-8 gap-3" style="border:2px dashed #FED7AA; border-radius:16px;">
        <p class="text-sm font-semibold" style="color:#C0B8B0; font-family:'Fredoka',sans-serif;">此模组还没有世界书条目</p>
      </div>
      <div v-else class="flex flex-col gap-3">
        <div v-for="entry in worldbookEntries" :key="entry.id" class="p-4 flex flex-col gap-2" style="background:white; border:2px solid #FED7AA; border-radius:14px;">
          <div class="flex items-center justify-between gap-2">
            <div class="flex items-center gap-2">
              <h3 class="font-bold text-sm" style="font-family:'Fredoka',sans-serif; color:#431407;">{{ entry.name }}</h3>
              <span class="text-xs font-bold px-2 py-0.5 rounded-full" style="background:#FFF7ED; color:#EA580C; border:1.5px solid #FDBA74;">{{ strategyLabel(entry.strategy_type) }}</span>
            </div>
            <div v-if="canEditEntry(entry)" class="flex items-center gap-2 flex-shrink-0">
              <RouterLink :to="{ name: 'workshop-entry-edit', params: { packId: pack.id, entryId: entry.id }, query: getPackNavigationQuery() }" class="text-xs font-bold px-3 py-1 rounded-full transition-colors" style="color:#EA580C; border:1.5px solid #FDBA74; background:#FFFBF0;">编辑</RouterLink>
              <button class="text-xs font-bold px-3 py-1 rounded-full transition-colors" style="color:#EF4444; border:1.5px solid #FECACA; background:#FEF2F2;" @click="handleDeleteEntry(entry.id)">删除</button>
            </div>
          </div>
          <div v-if="entry.keys && entry.keys.length" class="flex flex-wrap gap-1.5">
            <span v-for="key in entry.keys" :key="key" class="tag-badge">{{ key }}</span>
          </div>
          <div class="relative group">
            <p 
              v-if="entry.content" 
              class="text-xs line-clamp-3 cursor-pointer hover:bg-orange-50 transition-colors pr-10" 
              style="color:#78716C; font-family:'Nunito',sans-serif; background:#FFFBF0; border-radius:8px; padding:8px; border:1px solid #FED7AA;"
              @click="openEntryDetail(entry)"
              title="点击查看完整内容"
            >
              {{ entry.content }}
            </p>
            <!-- 放大查看按钮 -->
            <button 
              @click="openEntryDetail(entry)"
              class="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-lg opacity-40 group-hover:opacity-100 transition-opacity bg-white/50 hover:bg-white border border-[#FED7AA]"
              title="放大查看"
            >
              <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="#EA580C" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="15 3 21 3 21 9"></polyline>
                <polyline points="9 21 3 21 3 15"></polyline>
                <line x1="21" y1="3" x2="14" y2="10"></line>
                <line x1="3" y1="21" x2="10" y2="14"></line>
              </svg>
            </button>
          </div>
        </div>
      </div>

      <!-- ── 酒馆正则列表 ─────────────────────────────── -->
      <div class="flex items-center justify-between mb-3 mt-8">
        <h2 class="font-bold text-lg" style="font-family:'Fredoka',sans-serif; color:#EA580C;">
          酒馆正则 ({{ regexEntries.length }})
        </h2>
        <div class="flex items-center gap-2">
          <RouterLink v-if="canAddEntry" :to="{ name: 'workshop-entry-new', params: { packId: pack.id }, query: getPackNavigationQuery({ type: 'regex' }) }" class="btn-primary text-sm">
            添加正则
          </RouterLink>
        </div>
      </div>
      <div v-if="regexEntries.length === 0" class="flex flex-col items-center justify-center py-8 gap-3" style="border:2px dashed #FED7AA; border-radius:16px;">
        <p class="text-sm font-semibold" style="color:#C0B8B0; font-family:'Fredoka',sans-serif;">暂无正则配置</p>
      </div>
      <div v-else class="flex flex-col gap-3">
        <div v-for="entry in regexEntries" :key="entry.id" class="p-4 flex flex-col gap-2" style="background:white; border:2px solid #FED7AA; border-radius:14px;">
          <div class="flex items-center justify-between gap-2">
            <h3 class="font-bold text-sm" style="font-family:'Fredoka',sans-serif; color:#431407;">{{ entry.name }}</h3>
            <div v-if="canEditEntry(entry)" class="flex items-center gap-2 flex-shrink-0">
              <RouterLink :to="{ name: 'workshop-entry-edit', params: { packId: pack.id, entryId: entry.id }, query: getPackNavigationQuery() }" class="text-xs font-bold px-3 py-1 rounded-full transition-colors" style="color:#EA580C; border:1.5px solid #FDBA74; background:#FFFBF0;">编辑</RouterLink>
              <button class="text-xs font-bold px-3 py-1 rounded-full transition-colors" style="color:#EF4444; border:1.5px solid #FECACA; background:#FEF2F2;" @click="handleDeleteEntry(entry.id)">删除</button>
            </div>
          </div>
          <div v-if="entry.extra_data && entry.extra_data.find_regex" class="text-xs p-2 rounded-lg" style="color:#EA580C; font-family:monospace; word-break:break-all; background:#FFFBF0; border:1px solid #FED7AA;">
          {{ entry.extra_data.find_regex }}
          </div>
          <div class="relative group">
            <p 
              v-if="entry.content" 
              class="text-xs line-clamp-3 cursor-pointer hover:bg-orange-50 transition-colors pr-10" 
              style="color:#78716C; font-family:'Nunito',sans-serif; background:#FFFBF0; border-radius:8px; padding:8px; border:1px solid #FED7AA;"
              @click="openEntryDetail(entry)"
              title="点击查看完整内容"
            >
              {{ entry.content }}
            </p>
            <!-- 放大查看按钮 -->
            <button 
              @click="openEntryDetail(entry)"
              class="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-lg opacity-40 group-hover:opacity-100 transition-opacity bg-white/50 hover:bg-white border border-[#FED7AA]"
              title="放大查看"
            >
              <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="#EA580C" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="15 3 21 3 21 9"></polyline>
                <polyline points="9 21 3 21 3 15"></polyline>
                <line x1="21" y1="3" x2="14" y2="10"></line>
                <line x1="3" y1="21" x2="10" y2="14"></line>
              </svg>
            </button>
          </div>
        </div>
      </div>

      <!-- ── 开场白列表 ─────────────────────────────── -->
      <div class="flex items-center justify-between mb-3 mt-8">
        <h2 class="font-bold text-lg" style="font-family:'Fredoka',sans-serif; color:#EA580C;">
          开场白 ({{ greetingEntries.length }})
        </h2>
        <div class="flex items-center gap-2">
          <RouterLink v-if="canAddEntry" :to="{ name: 'workshop-entry-new', params: { packId: pack.id }, query: getPackNavigationQuery({ type: 'greeting' }) }" class="btn-primary text-sm">
            添加开场白
          </RouterLink>
        </div>
      </div>
      <div v-if="greetingEntries.length === 0" class="flex flex-col items-center justify-center py-8 gap-3" style="border:2px dashed #FED7AA; border-radius:16px;">
        <p class="text-sm font-semibold" style="color:#C0B8B0; font-family:'Fredoka',sans-serif;">暂无开场白配置</p>
      </div>
      <div v-else class="flex flex-col gap-3">
        <div v-for="entry in greetingEntries" :key="entry.id" class="p-4 flex flex-col gap-2" style="background:white; border:2px solid #FED7AA; border-radius:14px;">
          <div class="flex items-center justify-between gap-2">
            <h3 class="font-bold text-sm" style="font-family:'Fredoka',sans-serif; color:#431407;">{{ entry.name }}</h3>
            <div v-if="canEditEntry(entry)" class="flex items-center gap-2 flex-shrink-0">
              <RouterLink :to="{ name: 'workshop-entry-edit', params: { packId: pack.id, entryId: entry.id }, query: getPackNavigationQuery() }" class="text-xs font-bold px-3 py-1 rounded-full transition-colors" style="color:#EA580C; border:1.5px solid #FDBA74; background:#FFFBF0;">编辑</RouterLink>
              <button class="text-xs font-bold px-3 py-1 rounded-full transition-colors" style="color:#EF4444; border:1.5px solid #FECACA; background:#FEF2F2;" @click="handleDeleteEntry(entry.id)">删除</button>
            </div>
          </div>
          <div class="relative group">
            <p 
              v-if="entry.content" 
              class="text-xs line-clamp-3 cursor-pointer hover:bg-orange-50 transition-colors pr-10" 
              style="color:#78716C; font-family:'Nunito',sans-serif; background:#FFFBF0; border-radius:8px; padding:8px; border:1px solid #FED7AA; white-space:pre-wrap;"
              @click="openEntryDetail(entry)"
              title="点击查看完整内容"
            >
              {{ entry.content }}
            </p>
            <!-- 放大查看按钮 -->
            <button 
              @click="openEntryDetail(entry)"
              class="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-lg opacity-40 group-hover:opacity-100 transition-opacity bg-white/50 hover:bg-white border border-[#FED7AA]"
              title="放大查看"
            >
              <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="#EA580C" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="15 3 21 3 21 9"></polyline>
                <polyline points="9 21 3 21 3 15"></polyline>
                <line x1="21" y1="3" x2="14" y2="10"></line>
                <line x1="3" y1="21" x2="10" y2="14"></line>
              </svg>
            </button>
          </div>
        </div>
      </div>
    </template>
  </div>

  <!-- 订阅/重新同步确认弹窗 -->
  <ConfirmModal
    v-if="showSubConfirm"
    :title="isResyncMode ? '重新同步到世界书' : '订阅模组'"
    :confirm-text="isResyncMode ? '确认同步' : '确认订阅'"
    cancel-text="取消"
    :confirm-disabled="hasRiskyContent && !isCharacterConfirmed"
    @confirm="isResyncMode ? confirmResync() : confirmSubscribe()"
    @cancel="showSubConfirm = false; isResyncMode = false"
  >
    <div class="flex flex-col gap-4">
      <p v-if="isResyncMode" class="text-sm" style="color:#78716C;">
        将重新同步模组「<strong>{{ pack?.title }}</strong>」到 SillyTavern 世界书。<br>
        <span class="text-xs text-orange-600">注意：这不会更改服务器端的订阅状态。</span>
      </p>
      <p v-else v-html="`确定要订阅 <strong>${pack?.title}</strong> 吗？`"></p>
      
      <!-- 风险提示与确认 -->
      <div v-if="hasRiskyContent" class="flex flex-col gap-2 p-3 rounded-xl bg-orange-50 border border-orange-200">
        <div class="flex items-start gap-2">
          <span class="text-lg leading-none">⚠️</span>
          <div class="text-xs text-orange-800">
            <p class="font-bold mb-1">注意：此订阅包含正则脚本或开场白。</p>
            <p>这些内容会直接关联到当前选中的角色卡。如果当前未进入角色卡，或进入了错误的角色卡，可能会导致数据错乱。</p>
          </div>
        </div>
        <label class="flex items-center gap-2 mt-2 pt-2 border-t border-orange-200 cursor-pointer select-none">
          <input type="checkbox" v-model="isCharacterConfirmed" class="w-4 h-4 text-orange-600 rounded focus:ring-orange-500 accent-orange-600" />
          <span class="text-xs font-bold text-orange-700">我确认 ST 当前已进入正确的角色卡</span>
        </label>
      </div>
      
      <div v-if="workshopStore.isFromStExtension() && workshopStore.stConnected && !hasRiskyContent" class="flex flex-col gap-1.5 p-3 rounded-xl bg-[#F0FDF4] border border-[#DCFCE7]">
        <label class="text-[10px] font-bold text-[#16A34A] uppercase tracking-wider">选择目标世界书</label>
        <select 
          v-model="targetWorldbookName"
          class="input text-sm py-1.5"
          style="border-color:#22C55E; background: white;"
        >
          <option v-if="workshopStore.worldbookName" :value="workshopStore.worldbookName">
            {{ workshopStore.worldbookName }} (工坊作者默认)
          </option>
          <option 
            v-for="wb in workshopStore.worldbookList.filter(w => w !== workshopStore.worldbookName)" 
            :key="wb" 
            :value="wb"
          >
            {{ wb }}
          </option>
        </select>
        <p class="text-[10px] text-[#16A34A] opacity-80 mt-1">
          * 条目将插入到所选世界书中。默认为工坊作者推荐的世界书。
        </p>
      </div>

      <!-- 条目选择列表 -->
      <div v-if="pack?.entries && pack.entries.length > 0" class="flex flex-col gap-3 p-3 rounded-xl bg-[#FFFBF0] border border-[#FDBA74] max-h-[50vh] overflow-y-auto custom-scrollbar">
        
        <div class="flex items-center justify-between pb-2 border-b border-[#FED7AA]">
           <span class="text-xs font-bold text-[#78350F]">选择要插入的条目</span>
           <button 
            @click.stop="selectedEntryIds = selectedEntryIds.length === pack.entries.length ? [] : pack.entries.map(e => e.id)"
            class="text-[10px] font-bold px-2 py-0.5 rounded"
            style="background:#FFF7ED; color:#EA580C; border:1px solid #FDBA74;"
          >
            {{ selectedEntryIds.length === pack.entries.length ? '取消全选' : '全选所有' }}
          </button>
        </div>

        <template v-if="worldbookEntries.length > 0">
           <label class="text-[10px] font-bold text-[#92400E] uppercase tracking-wider mb-1">世界书条目 ({{ worldbookEntries.length }})</label>
           <div class="flex flex-col gap-1 mb-2">
             <label v-for="entry in worldbookEntries" :key="entry.id" class="flex items-start gap-2 p-2 rounded-lg hover:bg-[#FFF7ED] transition-colors cursor-pointer" :style="selectedEntryIds.includes(entry.id) ? 'background:#FFF7ED;' : ''">
                <input type="checkbox" :value="entry.id" v-model="selectedEntryIds" class="mt-0.5 flex-shrink-0" style="accent-color:#F97316;" />
                <div class="flex-1 min-w-0">
                    <div class="text-xs font-bold truncate text-[#431407]">{{ entry.name }}</div>
                    <div v-if="entry.content" class="text-[10px] line-clamp-1 mt-0.5 text-[#78716C]">{{ entry.content }}</div>
                </div>
             </label>
           </div>
        </template>

        <template v-if="regexEntries.length > 0">
           <label class="text-[10px] font-bold text-[#92400E] uppercase tracking-wider mb-1 mt-1">酒馆正则 ({{ regexEntries.length }})</label>
           <div class="flex flex-col gap-1 mb-2">
             <label v-for="entry in regexEntries" :key="entry.id" class="flex items-start gap-2 p-2 rounded-lg hover:bg-[#FFF7ED] transition-colors cursor-pointer" :style="selectedEntryIds.includes(entry.id) ? 'background:#FFF7ED;' : ''">
                <input type="checkbox" :value="entry.id" v-model="selectedEntryIds" class="mt-0.5 flex-shrink-0" style="accent-color:#F97316;" />
                <div class="flex-1 min-w-0">
                    <div class="text-xs font-bold truncate text-[#431407]">{{ entry.name }}</div>
                </div>
             </label>
           </div>
        </template>

        <template v-if="greetingEntries.length > 0">
           <label class="text-[10px] font-bold text-[#92400E] uppercase tracking-wider mb-1 mt-1">开场白 ({{ greetingEntries.length }})</label>
           <div class="flex flex-col gap-1 mb-2">
             <label v-for="entry in greetingEntries" :key="entry.id" class="flex items-start gap-2 p-2 rounded-lg hover:bg-[#FFF7ED] transition-colors cursor-pointer" :style="selectedEntryIds.includes(entry.id) ? 'background:#FFF7ED;' : ''">
                <input type="checkbox" :value="entry.id" v-model="selectedEntryIds" class="mt-0.5 flex-shrink-0" style="accent-color:#F97316;" />
                <div class="flex-1 min-w-0">
                    <div class="text-xs font-bold truncate text-[#431407]">{{ entry.name }}</div>
                    <div v-if="entry.content" class="text-[10px] line-clamp-1 mt-0.5 text-[#78716C]">{{ entry.content }}</div>
                </div>
             </label>
           </div>
        </template>

        <p class="text-[10px] text-[#78350F] opacity-80 mt-2 border-t border-[#FED7AA] pt-2">
          已选择 {{ selectedEntryIds.length }} / {{ pack.entries.length }} 条
        </p>
      </div>
    </div>
  </ConfirmModal>

  <!-- 导出确认弹窗 -->
  <ConfirmModal
    v-if="showExportConfirm"
    title="导出条目"
    confirm-text="确认导出"
    cancel-text="取消"
    @confirm="handleBatchExport"
    @cancel="showExportConfirm = false"
  >
    <div class="flex flex-col gap-4">
      <p>选择要导出的条目：</p>
      
      <!-- 条目选择列表 -->
      <div v-if="pack?.entries && pack.entries.length > 0" class="flex flex-col gap-3 p-3 rounded-xl bg-[#FFFBF0] border border-[#FDBA74] max-h-[50vh] overflow-y-auto custom-scrollbar">
        
        <div class="flex items-center justify-between pb-2 border-b border-[#FED7AA]">
           <span class="text-xs font-bold text-[#78350F]">选择内容</span>
           <button 
            @click.stop="exportEntryIds = exportEntryIds.length === pack.entries.length ? [] : pack.entries.map(e => e.id)"
            class="text-[10px] font-bold px-2 py-0.5 rounded"
            style="background:#FFF7ED; color:#EA580C; border:1px solid #FDBA74;"
          >
            {{ exportEntryIds.length === pack.entries.length ? '取消全选' : '全选所有' }}
          </button>
        </div>

        <template v-if="worldbookEntries.length > 0">
           <label class="text-[10px] font-bold text-[#92400E] uppercase tracking-wider mb-1">世界书条目 ({{ worldbookEntries.length }})</label>
           <div class="flex flex-col gap-1 mb-2">
             <label v-for="entry in worldbookEntries" :key="entry.id" class="flex items-start gap-2 p-2 rounded-lg hover:bg-[#FFF7ED] transition-colors cursor-pointer" :style="exportEntryIds.includes(entry.id) ? 'background:#FFF7ED;' : ''">
                <input type="checkbox" :value="entry.id" v-model="exportEntryIds" class="mt-0.5 flex-shrink-0" style="accent-color:#F97316;" />
                <div class="flex-1 min-w-0">
                    <div class="text-xs font-bold truncate text-[#431407]">{{ entry.name }}</div>
                    <div v-if="entry.content" class="text-[10px] line-clamp-1 mt-0.5 text-[#78716C]">{{ entry.content }}</div>
                </div>
             </label>
           </div>
        </template>

        <template v-if="regexEntries.length > 0">
           <label class="text-[10px] font-bold text-[#92400E] uppercase tracking-wider mb-1 mt-1">酒馆正则 ({{ regexEntries.length }})</label>
           <div class="flex flex-col gap-1 mb-2">
             <label v-for="entry in regexEntries" :key="entry.id" class="flex items-start gap-2 p-2 rounded-lg hover:bg-[#FFF7ED] transition-colors cursor-pointer" :style="exportEntryIds.includes(entry.id) ? 'background:#FFF7ED;' : ''">
                <input type="checkbox" :value="entry.id" v-model="exportEntryIds" class="mt-0.5 flex-shrink-0" style="accent-color:#F97316;" />
                <div class="flex-1 min-w-0">
                    <div class="text-xs font-bold truncate text-[#431407]">{{ entry.name }}</div>
                </div>
             </label>
           </div>
        </template>

        <template v-if="greetingEntries.length > 0">
           <label class="text-[10px] font-bold text-[#92400E] uppercase tracking-wider mb-1 mt-1">开场白 ({{ greetingEntries.length }})</label>
           <div class="flex flex-col gap-1 mb-2">
             <label v-for="entry in greetingEntries" :key="entry.id" class="flex items-start gap-2 p-2 rounded-lg hover:bg-[#FFF7ED] transition-colors cursor-pointer" :style="exportEntryIds.includes(entry.id) ? 'background:#FFF7ED;' : ''">
                <input type="checkbox" :value="entry.id" v-model="exportEntryIds" class="mt-0.5 flex-shrink-0" style="accent-color:#F97316;" />
                <div class="flex-1 min-w-0">
                    <div class="text-xs font-bold truncate text-[#431407]">{{ entry.name }}</div>
                    <div v-if="entry.content" class="text-[10px] line-clamp-1 mt-0.5 text-[#78716C]">{{ entry.content }}</div>
                </div>
             </label>
           </div>
        </template>

        <p class="text-[10px] text-[#78350F] opacity-80 mt-2 border-t border-[#FED7AA] pt-2">
          已选择 {{ exportEntryIds.length }} / {{ pack.entries.length }} 条
        </p>
      </div>
    </div>
  </ConfirmModal>

  <!-- 导入预览弹窗 -->
  <ConfirmModal
    v-if="showImportPreview"
    title="导入预览"
    :confirm-text="importingEntries ? '导入中...' : '确认导入'"
    cancel-text="取消"
    :confirm-disabled="importSelectedIds.length === 0 || importingEntries"
    @confirm="confirmImport"
    @cancel="cancelImport"
  >
    <div class="flex flex-col gap-4">
      <p>以下是解析到的条目，请选择要导入的内容：</p>
      
      <!-- 条目选择列表 -->
      <div v-if="pendingImportEntries.length > 0" class="flex flex-col gap-3 p-3 rounded-xl bg-[#FFFBF0] border border-[#FDBA74] max-h-[50vh] overflow-y-auto custom-scrollbar">
        
        <div class="flex items-center justify-between pb-2 border-b border-[#FED7AA]">
           <span class="text-xs font-bold text-[#78350F]">选择要导入的条目</span>
           <button 
            @click.stop="importSelectedIds = importSelectedIds.length === pendingImportEntries.length ? [] : pendingImportEntries.map((_, idx) => idx)"
            class="text-[10px] font-bold px-2 py-0.5 rounded"
            style="background:#FFF7ED; color:#EA580C; border:1px solid #FDBA74;"
          >
            {{ importSelectedIds.length === pendingImportEntries.length ? '取消全选' : '全选所有' }}
          </button>
        </div>

        <template v-if="pendingWorldbookEntries.length > 0">
           <label class="text-[10px] font-bold text-[#92400E] uppercase tracking-wider mb-1">世界书条目 ({{ pendingWorldbookEntries.length }})</label>
           <div class="flex flex-col gap-1 mb-2">
             <label 
               v-for="(entry, idx) in pendingImportEntries.filter(e => e.entry_type === 'worldbook' || !e.entry_type)" 
               :key="idx" 
               class="flex items-start gap-2 p-2 rounded-lg hover:bg-[#FFF7ED] transition-colors cursor-pointer" 
               :style="importSelectedIds.includes(pendingImportEntries.indexOf(entry)) ? 'background:#FFF7ED;' : ''"
             >
                <input 
                  type="checkbox" 
                  :value="pendingImportEntries.indexOf(entry)" 
                  v-model="importSelectedIds" 
                  class="mt-0.5 flex-shrink-0" 
                  style="accent-color:#F97316;" 
                />
                <div class="flex-1 min-w-0">
                    <div class="text-xs font-bold truncate text-[#431407]">{{ entry.name }}</div>
                    <div v-if="entry.content" class="text-[10px] line-clamp-2 mt-0.5 text-[#78716C]">{{ entry.content }}</div>
                    <div v-if="entry.keys && entry.keys.length" class="text-[10px] mt-0.5 text-[#9CA3AF]">关键词: {{ entry.keys.join(', ') }}</div>
                </div>
             </label>
           </div>
        </template>

        <template v-if="pendingRegexEntries.length > 0">
           <label class="text-[10px] font-bold text-[#92400E] uppercase tracking-wider mb-1 mt-1">酒馆正则 ({{ pendingRegexEntries.length }})</label>
           <div class="flex flex-col gap-1 mb-2">
             <label 
               v-for="(entry, idx) in pendingImportEntries.filter(e => e.entry_type === 'regex')" 
               :key="idx" 
               class="flex items-start gap-2 p-2 rounded-lg hover:bg-[#FFF7ED] transition-colors cursor-pointer" 
               :style="importSelectedIds.includes(pendingImportEntries.indexOf(entry)) ? 'background:#FFF7ED;' : ''"
             >
                <input 
                  type="checkbox" 
                  :value="pendingImportEntries.indexOf(entry)" 
                  v-model="importSelectedIds" 
                  class="mt-0.5 flex-shrink-0" 
                  style="accent-color:#F97316;" 
                />
                <div class="flex-1 min-w-0">
                    <div class="text-xs font-bold truncate text-[#431407]">{{ entry.name }}</div>
                    <div v-if="entry.extra_data?.find_regex" class="text-[10px] mt-0.5 text-[#9CA3AF] font-mono truncate">{{ entry.extra_data.find_regex }}</div>
                </div>
             </label>
           </div>
        </template>

        <template v-if="pendingGreetingEntries.length > 0">
           <label class="text-[10px] font-bold text-[#92400E] uppercase tracking-wider mb-1 mt-1">开场白 ({{ pendingGreetingEntries.length }})</label>
           <div class="flex flex-col gap-1 mb-2">
             <label 
               v-for="(entry, idx) in pendingImportEntries.filter(e => e.entry_type === 'greeting')" 
               :key="idx" 
               class="flex items-start gap-2 p-2 rounded-lg hover:bg-[#FFF7ED] transition-colors cursor-pointer" 
               :style="importSelectedIds.includes(pendingImportEntries.indexOf(entry)) ? 'background:#FFF7ED;' : ''"
             >
                <input 
                  type="checkbox" 
                  :value="pendingImportEntries.indexOf(entry)" 
                  v-model="importSelectedIds" 
                  class="mt-0.5 flex-shrink-0" 
                  style="accent-color:#F97316;" 
                />
                <div class="flex-1 min-w-0">
                    <div class="text-xs font-bold truncate text-[#431407]">{{ entry.name }}</div>
                    <div v-if="entry.content" class="text-[10px] line-clamp-2 mt-0.5 text-[#78716C]">{{ entry.content }}</div>
                </div>
             </label>
           </div>
        </template>

        <p class="text-[10px] text-[#78350F] opacity-80 mt-2 border-t border-[#FED7AA] pt-2">
          已选择 {{ importSelectedIds.length }} / {{ pendingImportEntries.length }} 条
        </p>
      </div>
    </div>
  </ConfirmModal>

  <!-- Phase 2: 更新详情弹窗 -->
  <PackUpdateModal
    v-if="showUpdateModal"
    :changes-data="packChangesData"
    :syncing="syncingUpdates"
    @close="showUpdateModal = false"
    @sync-selective="handleSyncUpdatesSelective"
  />
</template>
