<script setup>
import { computed, ref, onMounted } from 'vue'
import { useWorkshopStore } from '@/stores/workshop'

const workshopStore = useWorkshopStore()

const props = defineProps({
  // 变更数据对象 { has_changes, summary, changes: { new, modified, deleted } }
  changesData: {
    type: Object,
    default: null,
  },
  // 是否正在同步中
  syncing: {
    type: Boolean,
    default: false,
  },
})

const emit = defineEmits(['close', 'sync-selective'])

const newEntries = computed(() => props.changesData?.changes?.new || [])
const modifiedEntries = computed(() => props.changesData?.changes?.modified || [])
const deletedEntries = computed(() => props.changesData?.changes?.deleted || [])

const totalChanges = computed(() => {
  return newEntries.value.length + modifiedEntries.value.length + deletedEntries.value.length
})

// 按条目类型分组（worldbook / regex / greeting）
const worldbookChanges = computed(() => {
  return {
    new: newEntries.value.filter(e => !e.entry_type || e.entry_type === 'worldbook'),
    modified: modifiedEntries.value.filter(e => !e.entry_type || e.entry_type === 'worldbook'),
    deleted: deletedEntries.value.filter(e => !e.entry_type || e.entry_type === 'worldbook'),
  }
})

const regexChanges = computed(() => {
  return {
    new: newEntries.value.filter(e => e.entry_type === 'regex'),
    modified: modifiedEntries.value.filter(e => e.entry_type === 'regex'),
    deleted: deletedEntries.value.filter(e => e.entry_type === 'regex'),
  }
})

const greetingChanges = computed(() => {
  return {
    new: newEntries.value.filter(e => e.entry_type === 'greeting'),
    modified: modifiedEntries.value.filter(e => e.entry_type === 'greeting'),
    deleted: deletedEntries.value.filter(e => e.entry_type === 'greeting'),
  }
})

// 各类型条目的总数
const worldbookTotal = computed(() => 
  worldbookChanges.value.new.length + worldbookChanges.value.modified.length + worldbookChanges.value.deleted.length
)
const regexTotal = computed(() => 
  regexChanges.value.new.length + regexChanges.value.modified.length + regexChanges.value.deleted.length
)
const greetingTotal = computed(() => 
  greetingChanges.value.new.length + greetingChanges.value.modified.length + greetingChanges.value.deleted.length
)

// 选中的条目ID集合
const selectedIds = ref(new Set())

// 是否在角色卡内（通过主动检测）
const isInCharacterCard = ref(false)

// 初始化：检测是否在角色卡内并默认全选
onMounted(async () => {
  selectAll()
  
  // 检测是否在角色卡内
  if (workshopStore.stConnected) {
    try {
      const result = await workshopStore.checkCharacterCard()
      isInCharacterCard.value = result?.hasCharacter || false
    } catch (err) {
      console.error('[PackUpdateModal] 检测角色卡状态失败:', err)
      isInCharacterCard.value = false
    }
  }
})

// 全选
function selectAll() {
  const allIds = [
    ...newEntries.value.map(e => e.id),
    ...modifiedEntries.value.map(e => e.id),
    ...deletedEntries.value.map(e => e.id)
  ]
  selectedIds.value = new Set(allIds)
}

// 取消全选
function deselectAll() {
  selectedIds.value = new Set()
}

// 按类型全选/取消全选
function toggleCategorySelection(entries) {
  const ids = entries.map(e => e.id)
  const allSelected = ids.every(id => selectedIds.value.has(id))
  
  if (allSelected) {
    // 取消全选此类
    ids.forEach(id => selectedIds.value.delete(id))
  } else {
    // 全选此类
    ids.forEach(id => selectedIds.value.add(id))
  }
  selectedIds.value = new Set(selectedIds.value) // 触发响应式
}

// 切换单个条目
function toggleEntry(entryId) {
  if (selectedIds.value.has(entryId)) {
    selectedIds.value.delete(entryId)
  } else {
    selectedIds.value.add(entryId)
  }
  selectedIds.value = new Set(selectedIds.value)
}

// 检查分类是否全选
function isCategoryFullySelected(entries) {
  if (entries.length === 0) return false
  return entries.every(e => selectedIds.value.has(e.id))
}

// 检查选中的条目是否包含危险类型（regex/greeting）
const selectedHasRiskyTypes = computed(() => {
  const allChanges = [
    ...newEntries.value,
    ...modifiedEntries.value,
    ...deletedEntries.value
  ]
  
  const selectedEntries = allChanges.filter(e => selectedIds.value.has(e.id))
  return selectedEntries.some(e => e.entry_type === 'regex' || e.entry_type === 'greeting')
})

// 判断是否可以同步
const canSync = computed(() => {
  // 如果没有选中任何条目，不能同步
  if (selectedCount.value === 0) return false
  
  // 如果选中的条目包含危险类型，且不在角色卡内，不能同步
  if (selectedHasRiskyTypes.value && !isInCharacterCard.value) {
    return false
  }
  
  return true
})

// 同步按钮的提示文本
const syncButtonText = computed(() => {
  if (props.syncing) return '同步中...'
  if (selectedCount.value === 0) return '请至少选择一项'
  if (selectedHasRiskyTypes.value && !isInCharacterCard.value) {
    return '请进入角色卡内同步'
  }
  return '同步选中更新'
})

// 同步选中的更新
function handleSyncSelective() {
  if (!canSync.value) return
  emit('sync-selective', Array.from(selectedIds.value))
}

const selectedCount = computed(() => selectedIds.value.size)
</script>

<template>
  <Teleport to="body">
    <Transition
      enter-active-class="transition duration-200 ease-out"
      enter-from-class="opacity-0"
      enter-to-class="opacity-100"
      leave-active-class="transition duration-150 ease-in"
      leave-from-class="opacity-100"
      leave-to-class="opacity-0"
    >
      <div
        class="fixed inset-0 z-[200] flex items-center justify-center p-4"
        style="background: rgba(67, 20, 7, 0.35);"
        @click.self="emit('close')"
      >
        <Transition
          enter-active-class="transition duration-200 ease-out"
          enter-from-class="opacity-0 scale-90 -translate-y-4"
          enter-to-class="opacity-100 scale-100 translate-y-0"
          leave-active-class="transition duration-150 ease-in"
          leave-from-class="opacity-100 scale-100 translate-y-0"
          leave-to-class="opacity-0 scale-90 -translate-y-4"
          appear
        >
          <div
            class="w-full max-w-lg max-h-[85vh] flex flex-col overflow-hidden"
            style="
              background: #FFFBF0;
              border: 2.5px solid #F59E0B;
              border-radius: 20px;
              box-shadow: 6px 6px 0 #F59E0B;
            "
          >
            <!-- 标题栏 -->
            <div class="flex items-center justify-between p-5 border-b-2 border-dashed" style="border-color: #FDE68A;">
              <div class="flex items-center gap-2.5">
                <svg class="w-5 h-5 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="#D97706" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                  <circle cx="12" cy="12" r="10"/>
                  <line x1="12" y1="16" x2="12" y2="12"/>
                  <line x1="12" y1="8" x2="12.01" y2="8"/>
                </svg>
                <h3 class="font-bold text-lg" style="font-family: 'Fredoka', sans-serif; color: #92400E;">
                  模组有更新
                </h3>
              </div>
              <button
                class="p-1.5 rounded-lg transition-colors hover:bg-amber-100"
                @click="emit('close')"
              >
                <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="#92400E" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18"/>
                  <line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>

            <!-- 变更列表 -->
            <div class="flex-1 overflow-y-auto p-5 space-y-4">
              <!-- 提示文字和全选按钮 -->
              <div class="flex items-center justify-between gap-3">
                <p class="text-sm flex-1" style="color: #78716C; font-family: 'Nunito', sans-serif;">
                  作者更新了此模组，共有 <strong style="color: #92400E;">{{ totalChanges }}</strong> 处变更
                </p>
                <div class="flex items-center gap-2">
                  <button
                    class="text-xs font-bold px-2.5 py-1.5 rounded-lg transition-colors"
                    style="background: #FED7AA; color: #92400E;"
                    :style="selectedCount === totalChanges ? 'background: #92400E; color: #FFFBF0;' : ''"
                    @click="selectAll"
                    :disabled="syncing"
                  >
                    全选
                  </button>
                  <button
                    class="text-xs font-bold px-2.5 py-1.5 rounded-lg transition-colors"
                    style="background: #FED7AA; color: #92400E;"
                    :style="selectedCount === 0 ? 'background: #92400E; color: #FFFBF0;' : ''"
                    @click="deselectAll"
                    :disabled="syncing"
                  >
                    取消全选
                  </button>
                </div>
              </div>

              <!-- 已选择计数 -->
              <div class="text-xs font-medium px-3 py-2 rounded-lg" style="background: #FEF3C7; color: #78350F;">
                已选择 <strong>{{ selectedCount }}</strong> / {{ totalChanges }} 条
              </div>

              <!-- 危险类型提示（选中了 regex/greeting 且不在角色卡内） -->
              <div 
                v-if="selectedHasRiskyTypes && !isInCharacterCard" 
                class="flex items-start gap-2.5 p-3 rounded-lg" 
                style="background: #FEF2F2; border: 1.5px solid #FCA5A5;"
              >
                <svg class="w-5 h-5 flex-shrink-0 mt-0.5" viewBox="0 0 24 24" fill="none" stroke="#DC2626" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                  <line x1="12" y1="9" x2="12" y2="13"/>
                  <line x1="12" y1="17" x2="12.01" y2="17"/>
                </svg>
                <div class="flex-1">
                  <p class="text-xs font-bold mb-1" style="color: #991B1B;">需要进入角色卡内更新</p>
                  <p class="text-xs leading-relaxed" style="color: #7F1D1D;">
                    您选中的更新包含正则脚本或开场白内容，这些内容必须在角色卡编辑器内才能同步。请进入角色卡后重新打开此页面进行同步。
                  </p>
                </div>
              </div>

              <!-- 世界书条目 -->
              <div v-if="worldbookTotal > 0" class="space-y-3 p-4 rounded-xl" style="background: #F0F9FF; border: 2px solid #BAE6FD;">
                <div class="flex items-center justify-between">
                  <h4 class="flex items-center gap-2 text-sm font-bold" style="color: #0369A1;">
                    <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/>
                      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
                    </svg>
                    世界书条目（{{ worldbookTotal }}）
                  </h4>
                  <button
                    class="text-xs font-bold px-2 py-1 rounded-md transition-colors"
                    style="color: #0369A1;"
                    :style="isCategoryFullySelected([...worldbookChanges.new, ...worldbookChanges.modified, ...worldbookChanges.deleted]) ? 'background: #E0F2FE;' : 'background: transparent; text-decoration: underline;'"
                    @click="toggleCategorySelection([...worldbookChanges.new, ...worldbookChanges.modified, ...worldbookChanges.deleted])"
                    :disabled="syncing"
                  >
                    {{ isCategoryFullySelected([...worldbookChanges.new, ...worldbookChanges.modified, ...worldbookChanges.deleted]) ? '取消全选' : '全选此类' }}
                  </button>
                </div>

                <!-- 新增 -->
                <div v-if="worldbookChanges.new.length > 0" class="space-y-1">
                  <div class="text-xs font-bold px-2 py-1 rounded" style="background: #DCFCE7; color: #166534;">
                    + 新增 {{ worldbookChanges.new.length }} 条
                  </div>
                  <ul class="space-y-1 pl-2">
                    <li
                      v-for="entry in worldbookChanges.new"
                      :key="entry.id"
                      class="flex items-center gap-2 text-sm px-3 py-2 rounded-lg cursor-pointer transition-colors"
                      :style="selectedIds.has(entry.id) ? 'background: #DCFCE7; color: #166534;' : 'background: #F0FDF4; color: #166534; opacity: 0.7;'"
                      @click="toggleEntry(entry.id)"
                    >
                      <input type="checkbox" :checked="selectedIds.has(entry.id)" @change="toggleEntry(entry.id)" class="flex-shrink-0" style="accent-color: #16A34A;" :disabled="syncing" />
                      <span class="font-medium flex-1">{{ entry.name || '未命名条目' }}</span>
                    </li>
                  </ul>
                </div>

                <!-- 修改 -->
                <div v-if="worldbookChanges.modified.length > 0" class="space-y-1">
                  <div class="text-xs font-bold px-2 py-1 rounded" style="background: #FEF3C7; color: #92400E;">
                    ✎ 修改 {{ worldbookChanges.modified.length }} 条
                  </div>
                  <ul class="space-y-1 pl-2">
                    <li
                      v-for="entry in worldbookChanges.modified"
                      :key="entry.id"
                      class="flex items-center gap-2 text-sm px-3 py-2 rounded-lg cursor-pointer transition-colors"
                      :style="selectedIds.has(entry.id) ? 'background: #FEF3C7; color: #92400E;' : 'background: #FFFBEB; color: #92400E; opacity: 0.7;'"
                      @click="toggleEntry(entry.id)"
                    >
                      <input type="checkbox" :checked="selectedIds.has(entry.id)" @change="toggleEntry(entry.id)" class="flex-shrink-0" style="accent-color: #D97706;" :disabled="syncing" />
                      <span class="font-medium flex-1">{{ entry.name || '未命名条目' }}</span>
                      <span v-if="entry.synced_version && entry.version" class="text-xs opacity-75">v{{ entry.synced_version }}→v{{ entry.version }}</span>
                    </li>
                  </ul>
                </div>

                <!-- 删除 -->
                <div v-if="worldbookChanges.deleted.length > 0" class="space-y-1">
                  <div class="text-xs font-bold px-2 py-1 rounded" style="background: #FEE2E2; color: #991B1B;">
                    - 删除 {{ worldbookChanges.deleted.length }} 条
                  </div>
                  <ul class="space-y-1 pl-2">
                    <li
                      v-for="entry in worldbookChanges.deleted"
                      :key="entry.id"
                      class="flex items-center gap-2 text-sm px-3 py-2 rounded-lg cursor-pointer transition-colors"
                      :style="selectedIds.has(entry.id) ? 'background: #FEE2E2; color: #991B1B; text-decoration: line-through;' : 'background: #FEF2F2; color: #991B1B; opacity: 0.7; text-decoration: line-through;'"
                      @click="toggleEntry(entry.id)"
                    >
                      <input type="checkbox" :checked="selectedIds.has(entry.id)" @change="toggleEntry(entry.id)" class="flex-shrink-0" style="accent-color: #DC2626;" :disabled="syncing" />
                      <span class="font-medium flex-1">{{ entry.name || '未命名条目' }}</span>
                    </li>
                  </ul>
                </div>
              </div>

              <!-- 正则脚本 -->
              <div v-if="regexTotal > 0" class="space-y-3 p-4 rounded-xl" style="background: #FEF3C7; border: 2px solid #FDE68A;">
                <div class="flex items-center justify-between">
                  <h4 class="flex items-center gap-2 text-sm font-bold" style="color: #92400E;">
                    <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                      <polyline points="16 18 22 12 16 6"/>
                      <polyline points="8 6 2 12 8 18"/>
                    </svg>
                    正则脚本（{{ regexTotal }}）
                  </h4>
                  <button
                    class="text-xs font-bold px-2 py-1 rounded-md transition-colors"
                    style="color: #92400E;"
                    :style="isCategoryFullySelected([...regexChanges.new, ...regexChanges.modified, ...regexChanges.deleted]) ? 'background: #FDE68A;' : 'background: transparent; text-decoration: underline;'"
                    @click="toggleCategorySelection([...regexChanges.new, ...regexChanges.modified, ...regexChanges.deleted])"
                    :disabled="syncing"
                  >
                    {{ isCategoryFullySelected([...regexChanges.new, ...regexChanges.modified, ...regexChanges.deleted]) ? '取消全选' : '全选此类' }}
                  </button>
                </div>

                <!-- 新增 -->
                <div v-if="regexChanges.new.length > 0" class="space-y-1">
                  <div class="text-xs font-bold px-2 py-1 rounded" style="background: #DCFCE7; color: #166534;">
                    + 新增 {{ regexChanges.new.length }} 条
                  </div>
                  <ul class="space-y-1 pl-2">
                    <li
                      v-for="entry in regexChanges.new"
                      :key="entry.id"
                      class="flex items-center gap-2 text-sm px-3 py-2 rounded-lg cursor-pointer transition-colors"
                      :style="selectedIds.has(entry.id) ? 'background: #DCFCE7; color: #166534;' : 'background: #F0FDF4; color: #166534; opacity: 0.7;'"
                      @click="toggleEntry(entry.id)"
                    >
                      <input type="checkbox" :checked="selectedIds.has(entry.id)" @change="toggleEntry(entry.id)" class="flex-shrink-0" style="accent-color: #16A34A;" :disabled="syncing" />
                      <span class="font-medium flex-1">{{ entry.name || '未命名条目' }}</span>
                    </li>
                  </ul>
                </div>

                <!-- 修改 -->
                <div v-if="regexChanges.modified.length > 0" class="space-y-1">
                  <div class="text-xs font-bold px-2 py-1 rounded" style="background: #FEF3C7; color: #92400E;">
                    ✎ 修改 {{ regexChanges.modified.length }} 条
                  </div>
                  <ul class="space-y-1 pl-2">
                    <li
                      v-for="entry in regexChanges.modified"
                      :key="entry.id"
                      class="flex items-center gap-2 text-sm px-3 py-2 rounded-lg cursor-pointer transition-colors"
                      :style="selectedIds.has(entry.id) ? 'background: #FEF3C7; color: #92400E;' : 'background: #FFFBEB; color: #92400E; opacity: 0.7;'"
                      @click="toggleEntry(entry.id)"
                    >
                      <input type="checkbox" :checked="selectedIds.has(entry.id)" @change="toggleEntry(entry.id)" class="flex-shrink-0" style="accent-color: #D97706;" :disabled="syncing" />
                      <span class="font-medium flex-1">{{ entry.name || '未命名条目' }}</span>
                      <span v-if="entry.synced_version && entry.version" class="text-xs opacity-75">v{{ entry.synced_version }}→v{{ entry.version }}</span>
                    </li>
                  </ul>
                </div>

                <!-- 删除 -->
                <div v-if="regexChanges.deleted.length > 0" class="space-y-1">
                  <div class="text-xs font-bold px-2 py-1 rounded" style="background: #FEE2E2; color: #991B1B;">
                    - 删除 {{ regexChanges.deleted.length }} 条
                  </div>
                  <ul class="space-y-1 pl-2">
                    <li
                      v-for="entry in regexChanges.deleted"
                      :key="entry.id"
                      class="flex items-center gap-2 text-sm px-3 py-2 rounded-lg cursor-pointer transition-colors"
                      :style="selectedIds.has(entry.id) ? 'background: #FEE2E2; color: #991B1B; text-decoration: line-through;' : 'background: #FEF2F2; color: #991B1B; opacity: 0.7; text-decoration: line-through;'"
                      @click="toggleEntry(entry.id)"
                    >
                      <input type="checkbox" :checked="selectedIds.has(entry.id)" @change="toggleEntry(entry.id)" class="flex-shrink-0" style="accent-color: #DC2626;" :disabled="syncing" />
                      <span class="font-medium flex-1">{{ entry.name || '未命名条目' }}</span>
                    </li>
                  </ul>
                </div>
              </div>

              <!-- 开场白 -->
              <div v-if="greetingTotal > 0" class="space-y-3 p-4 rounded-xl" style="background: #FCE7F3; border: 2px solid #FBCFE8;">
                <div class="flex items-center justify-between">
                  <h4 class="flex items-center gap-2 text-sm font-bold" style="color: #9F1239;">
                    <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                    </svg>
                    开场白（{{ greetingTotal }}）
                  </h4>
                  <button
                    class="text-xs font-bold px-2 py-1 rounded-md transition-colors"
                    style="color: #9F1239;"
                    :style="isCategoryFullySelected([...greetingChanges.new, ...greetingChanges.modified, ...greetingChanges.deleted]) ? 'background: #FBCFE8;' : 'background: transparent; text-decoration: underline;'"
                    @click="toggleCategorySelection([...greetingChanges.new, ...greetingChanges.modified, ...greetingChanges.deleted])"
                    :disabled="syncing"
                  >
                    {{ isCategoryFullySelected([...greetingChanges.new, ...greetingChanges.modified, ...greetingChanges.deleted]) ? '取消全选' : '全选此类' }}
                  </button>
                </div>

                <!-- 新增 -->
                <div v-if="greetingChanges.new.length > 0" class="space-y-1">
                  <div class="text-xs font-bold px-2 py-1 rounded" style="background: #DCFCE7; color: #166534;">
                    + 新增 {{ greetingChanges.new.length }} 条
                  </div>
                  <ul class="space-y-1 pl-2">
                    <li
                      v-for="entry in greetingChanges.new"
                      :key="entry.id"
                      class="flex items-center gap-2 text-sm px-3 py-2 rounded-lg cursor-pointer transition-colors"
                      :style="selectedIds.has(entry.id) ? 'background: #DCFCE7; color: #166534;' : 'background: #F0FDF4; color: #166534; opacity: 0.7;'"
                      @click="toggleEntry(entry.id)"
                    >
                      <input type="checkbox" :checked="selectedIds.has(entry.id)" @change="toggleEntry(entry.id)" class="flex-shrink-0" style="accent-color: #16A34A;" :disabled="syncing" />
                      <span class="font-medium flex-1">{{ entry.name || '未命名条目' }}</span>
                    </li>
                  </ul>
                </div>

                <!-- 修改 -->
                <div v-if="greetingChanges.modified.length > 0" class="space-y-1">
                  <div class="text-xs font-bold px-2 py-1 rounded" style="background: #FEF3C7; color: #92400E;">
                    ✎ 修改 {{ greetingChanges.modified.length }} 条
                  </div>
                  <ul class="space-y-1 pl-2">
                    <li
                      v-for="entry in greetingChanges.modified"
                      :key="entry.id"
                      class="flex items-center gap-2 text-sm px-3 py-2 rounded-lg cursor-pointer transition-colors"
                      :style="selectedIds.has(entry.id) ? 'background: #FEF3C7; color: #92400E;' : 'background: #FFFBEB; color: #92400E; opacity: 0.7;'"
                      @click="toggleEntry(entry.id)"
                    >
                      <input type="checkbox" :checked="selectedIds.has(entry.id)" @change="toggleEntry(entry.id)" class="flex-shrink-0" style="accent-color: #D97706;" :disabled="syncing" />
                      <span class="font-medium flex-1">{{ entry.name || '未命名条目' }}</span>
                      <span v-if="entry.synced_version && entry.version" class="text-xs opacity-75">v{{ entry.synced_version }}→v{{ entry.version }}</span>
                    </li>
                  </ul>
                </div>

                <!-- 删除 -->
                <div v-if="greetingChanges.deleted.length > 0" class="space-y-1">
                  <div class="text-xs font-bold px-2 py-1 rounded" style="background: #FEE2E2; color: #991B1B;">
                    - 删除 {{ greetingChanges.deleted.length }} 条
                  </div>
                  <ul class="space-y-1 pl-2">
                    <li
                      v-for="entry in greetingChanges.deleted"
                      :key="entry.id"
                      class="flex items-center gap-2 text-sm px-3 py-2 rounded-lg cursor-pointer transition-colors"
                      :style="selectedIds.has(entry.id) ? 'background: #FEE2E2; color: #991B1B; text-decoration: line-through;' : 'background: #FEF2F2; color: #991B1B; opacity: 0.7; text-decoration: line-through;'"
                      @click="toggleEntry(entry.id)"
                    >
                      <input type="checkbox" :checked="selectedIds.has(entry.id)" @change="toggleEntry(entry.id)" class="flex-shrink-0" style="accent-color: #DC2626;" :disabled="syncing" />
                      <span class="font-medium flex-1">{{ entry.name || '未命名条目' }}</span>
                    </li>
                  </ul>
                </div>
              </div>

              <!-- 无变更时 -->
              <div v-if="totalChanges === 0" class="text-center py-8">
                <p class="text-sm" style="color: #A8A29E;">暂无变更</p>
              </div>
            </div>

            <!-- 底部按钮栏 -->
            <div class="flex items-center justify-end gap-3 p-5 border-t-2 border-dashed" style="border-color: #FDE68A;">
              <button
                class="btn-secondary text-sm"
                @click="emit('close')"
                :disabled="syncing"
              >
                稍后再说
              </button>
              <button
                class="btn-primary text-sm flex items-center gap-1.5"
                :disabled="syncing || !canSync"
                @click="handleSyncSelective"
              >
                <svg v-if="syncing" class="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
                </svg>
                <svg v-else class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                  <polyline points="23 4 23 10 17 10"/>
                  <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
                </svg>
                {{ syncButtonText }}
              </button>
            </div>
          </div>
        </Transition>
      </div>
    </Transition>
  </Teleport>
</template>
