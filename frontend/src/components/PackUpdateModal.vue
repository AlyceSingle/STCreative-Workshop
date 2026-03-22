<script setup>
import { computed, ref, onMounted } from 'vue'

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

// 选中的条目ID集合
const selectedIds = ref(new Set())

// 初始化：默认全选
onMounted(() => {
  selectAll()
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

// 同步选中的更新
function handleSyncSelective() {
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

              <!-- 新增条目 -->
              <div v-if="newEntries.length > 0" class="space-y-2">
                <div class="flex items-center justify-between">
                  <h4 class="flex items-center gap-2 text-sm font-bold" style="color: #16A34A;">
                    <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                      <circle cx="12" cy="12" r="10"/>
                      <line x1="12" y1="8" x2="12" y2="16"/>
                      <line x1="8" y1="12" x2="16" y2="12"/>
                    </svg>
                    新增条目（{{ newEntries.length }}）
                  </h4>
                  <button
                    class="text-xs font-bold px-2 py-1 rounded-md transition-colors"
                    style="color: #16A34A;"
                    :style="isCategoryFullySelected(newEntries) ? 'background: #DCFCE7;' : 'background: transparent; text-decoration: underline;'"
                    @click="toggleCategorySelection(newEntries)"
                    :disabled="syncing"
                  >
                    {{ isCategoryFullySelected(newEntries) ? '取消全选' : '全选此类' }}
                  </button>
                </div>
                <ul class="space-y-1.5 pl-6">
                  <li
                    v-for="entry in newEntries"
                    :key="entry.id"
                    class="flex items-center gap-2 text-sm px-3 py-2 rounded-lg cursor-pointer transition-colors"
                    :style="selectedIds.has(entry.id) ? 'background: #DCFCE7; color: #166534;' : 'background: #F0FDF4; color: #166534; opacity: 0.6;'"
                    @click="toggleEntry(entry.id)"
                  >
                    <input
                      type="checkbox"
                      :checked="selectedIds.has(entry.id)"
                      @change="toggleEntry(entry.id)"
                      class="flex-shrink-0"
                      style="accent-color: #16A34A;"
                      :disabled="syncing"
                    />
                    <span class="font-medium flex-1">{{ entry.name || '未命名条目' }}</span>
                    <span v-if="entry.entry_type" class="text-xs opacity-75">({{ entry.entry_type }})</span>
                  </li>
                </ul>
              </div>

              <!-- 修改条目 -->
              <div v-if="modifiedEntries.length > 0" class="space-y-2">
                <div class="flex items-center justify-between">
                  <h4 class="flex items-center gap-2 text-sm font-bold" style="color: #D97706;">
                    <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                    </svg>
                    修改条目（{{ modifiedEntries.length }}）
                  </h4>
                  <button
                    class="text-xs font-bold px-2 py-1 rounded-md transition-colors"
                    style="color: #D97706;"
                    :style="isCategoryFullySelected(modifiedEntries) ? 'background: #FEF3C7;' : 'background: transparent; text-decoration: underline;'"
                    @click="toggleCategorySelection(modifiedEntries)"
                    :disabled="syncing"
                  >
                    {{ isCategoryFullySelected(modifiedEntries) ? '取消全选' : '全选此类' }}
                  </button>
                </div>
                <ul class="space-y-1.5 pl-6">
                  <li
                    v-for="entry in modifiedEntries"
                    :key="entry.id"
                    class="flex items-center gap-2 text-sm px-3 py-2 rounded-lg cursor-pointer transition-colors"
                    :style="selectedIds.has(entry.id) ? 'background: #FEF3C7; color: #92400E;' : 'background: #FFFBEB; color: #92400E; opacity: 0.6;'"
                    @click="toggleEntry(entry.id)"
                  >
                    <input
                      type="checkbox"
                      :checked="selectedIds.has(entry.id)"
                      @change="toggleEntry(entry.id)"
                      class="flex-shrink-0"
                      style="accent-color: #D97706;"
                      :disabled="syncing"
                    />
                    <span class="font-medium flex-1">{{ entry.name || '未命名条目' }}</span>
                    <span v-if="entry.synced_version && entry.version" class="text-xs opacity-75">
                      v{{ entry.synced_version }}→v{{ entry.version }}
                    </span>
                  </li>
                </ul>
              </div>

              <!-- 删除条目 -->
              <div v-if="deletedEntries.length > 0" class="space-y-2">
                <div class="flex items-center justify-between">
                  <h4 class="flex items-center gap-2 text-sm font-bold" style="color: #DC2626;">
                    <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                      <circle cx="12" cy="12" r="10"/>
                      <line x1="8" y1="12" x2="16" y2="12"/>
                    </svg>
                    删除条目（{{ deletedEntries.length }}）
                  </h4>
                  <button
                    class="text-xs font-bold px-2 py-1 rounded-md transition-colors"
                    style="color: #DC2626;"
                    :style="isCategoryFullySelected(deletedEntries) ? 'background: #FEE2E2;' : 'background: transparent; text-decoration: underline;'"
                    @click="toggleCategorySelection(deletedEntries)"
                    :disabled="syncing"
                  >
                    {{ isCategoryFullySelected(deletedEntries) ? '取消全选' : '全选此类' }}
                  </button>
                </div>
                <ul class="space-y-1.5 pl-6">
                  <li
                    v-for="entry in deletedEntries"
                    :key="entry.id"
                    class="flex items-center gap-2 text-sm px-3 py-2 rounded-lg cursor-pointer transition-colors"
                    :style="selectedIds.has(entry.id) ? 'background: #FEE2E2; color: #991B1B; text-decoration: line-through;' : 'background: #FEF2F2; color: #991B1B; opacity: 0.6; text-decoration: line-through;'"
                    @click="toggleEntry(entry.id)"
                  >
                    <input
                      type="checkbox"
                      :checked="selectedIds.has(entry.id)"
                      @change="toggleEntry(entry.id)"
                      class="flex-shrink-0"
                      style="accent-color: #DC2626;"
                      :disabled="syncing"
                    />
                    <span class="font-medium flex-1">{{ entry.name || '未命名条目' }}</span>
                    <span v-if="entry.entry_type" class="text-xs opacity-75">({{ entry.entry_type }})</span>
                  </li>
                </ul>
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
                :disabled="syncing || selectedCount === 0"
                @click="handleSyncSelective"
              >
                <svg v-if="syncing" class="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
                </svg>
                <svg v-else class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                  <polyline points="23 4 23 10 17 10"/>
                  <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
                </svg>
                {{ syncing ? '同步中...' : '同步选中更新' }}
              </button>
            </div>
          </div>
        </Transition>
      </div>
    </Transition>
  </Teleport>
</template>
