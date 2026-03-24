<script setup>
import { computed } from 'vue'

import ConfirmModal from '@/components/ConfirmModal.vue'

const props = defineProps({
  packTitle: {
    type: String,
    default: '',
  },
  entries: {
    type: Array,
    default: () => [],
  },
  selectedEntryIds: {
    type: Array,
    default: () => [],
  },
  targetWorldbookName: {
    type: String,
    default: '',
  },
  characterConfirmed: {
    type: Boolean,
    default: false,
  },
  showWorldbookSelector: {
    type: Boolean,
    default: false,
  },
  defaultWorldbookName: {
    type: String,
    default: '',
  },
  worldbookList: {
    type: Array,
    default: () => [],
  },
  resyncMode: {
    type: Boolean,
    default: false,
  },
})

const emit = defineEmits([
  'confirm',
  'cancel',
  'update:selectedEntryIds',
  'update:targetWorldbookName',
  'update:characterConfirmed',
])

const selectedEntryIdsModel = computed({
  get: () => props.selectedEntryIds,
  set: value => emit('update:selectedEntryIds', value),
})

const targetWorldbookNameModel = computed({
  get: () => props.targetWorldbookName,
  set: value => emit('update:targetWorldbookName', value),
})

const characterConfirmedModel = computed({
  get: () => props.characterConfirmed,
  set: value => emit('update:characterConfirmed', value),
})

const worldbookEntries = computed(() => props.entries.filter(entry => entry.entry_type === 'worldbook' || !entry.entry_type))
const regexEntries = computed(() => props.entries.filter(entry => entry.entry_type === 'regex'))
const greetingEntries = computed(() => props.entries.filter(entry => entry.entry_type === 'greeting'))
const worldbookOptions = computed(() => props.worldbookList.filter(name => name !== props.defaultWorldbookName))
const hasRiskyContent = computed(() => {
  const selectedIds = new Set(props.selectedEntryIds)
  return props.entries.some(entry => selectedIds.has(entry.id) && (entry.entry_type === 'regex' || entry.entry_type === 'greeting'))
})

function toggleSelectAll() {
  if (props.selectedEntryIds.length === props.entries.length) {
    selectedEntryIdsModel.value = []
    return
  }

  selectedEntryIdsModel.value = props.entries.map(entry => entry.id)
}

function isEntrySelected(entryId) {
  return props.selectedEntryIds.includes(entryId)
}
</script>

<template>
  <ConfirmModal
    :title="resyncMode ? '重新同步到世界书' : '订阅模组'"
    :confirm-text="resyncMode ? '确认同步' : '确认订阅'"
    cancel-text="取消"
    :confirm-disabled="hasRiskyContent && !characterConfirmedModel"
    @confirm="emit('confirm')"
    @cancel="emit('cancel')"
  >
    <div class="flex flex-col gap-4">
      <p v-if="resyncMode" class="text-sm" style="color:#78716C;">
        将重新同步模组「<strong>{{ packTitle }}</strong>」到 SillyTavern 世界书。<br>
        <span class="text-xs text-orange-600">注意：这不会更改服务器端的订阅状态。</span>
      </p>
      <p v-else>
        确定要订阅 <strong>{{ packTitle }}</strong> 吗？
      </p>

      <div v-if="hasRiskyContent" class="flex flex-col gap-2 p-3 rounded-xl bg-orange-50 border border-orange-200">
        <div class="flex items-start gap-2">
          <svg class="w-5 h-5 mt-0.5 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="#EA580C" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 9v4"/>
            <path d="M12 17h.01"/>
            <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
          </svg>
          <div class="text-xs text-orange-800">
            <p class="font-bold mb-1">注意：此订阅包含正则脚本或开场白。</p>
            <p>这些内容会直接关联到当前选中的角色卡。如果当前未进入角色卡，或进入了错误的角色卡，可能会导致数据错乱。</p>
          </div>
        </div>
        <label class="flex items-center gap-2 mt-2 pt-2 border-t border-orange-200 cursor-pointer select-none">
          <input v-model="characterConfirmedModel" type="checkbox" class="w-4 h-4 text-orange-600 rounded focus:ring-orange-500 accent-orange-600" />
          <span class="text-xs font-bold text-orange-700">我确认 ST 当前已进入正确的角色卡</span>
        </label>
      </div>

      <div v-if="showWorldbookSelector && !hasRiskyContent" class="flex flex-col gap-1.5 p-3 rounded-xl bg-[#F0FDF4] border border-[#DCFCE7]">
        <label class="text-[10px] font-bold text-[#16A34A] uppercase tracking-wider">选择目标世界书</label>
        <select
          v-model="targetWorldbookNameModel"
          class="input text-sm py-1.5"
          style="border-color:#22C55E; background:white;"
        >
          <option v-if="defaultWorldbookName" :value="defaultWorldbookName">
            {{ defaultWorldbookName }} (工坊作者默认)
          </option>
          <option
            v-for="worldbookName in worldbookOptions"
            :key="worldbookName"
            :value="worldbookName"
          >
            {{ worldbookName }}
          </option>
        </select>
        <p class="text-[10px] text-[#16A34A] opacity-80 mt-1">
          * 条目将插入到所选世界书中。默认为工坊作者推荐的世界书。
        </p>
      </div>

      <div v-if="entries.length > 0" class="flex flex-col gap-3 p-3 rounded-xl bg-[#FFFBF0] border border-[#FDBA74] max-h-[50vh] overflow-y-auto custom-scrollbar">
        <div class="flex items-center justify-between pb-2 border-b border-[#FED7AA]">
          <span class="text-xs font-bold text-[#78350F]">选择要插入的条目</span>
          <button
            class="text-[10px] font-bold px-2 py-0.5 rounded"
            style="background:#FFF7ED; color:#EA580C; border:1px solid #FDBA74;"
            @click="toggleSelectAll"
          >
            {{ selectedEntryIds.length === entries.length ? '取消全选' : '全选所有' }}
          </button>
        </div>

        <template v-if="worldbookEntries.length > 0">
          <label class="text-[10px] font-bold text-[#92400E] uppercase tracking-wider mb-1">世界书条目 ({{ worldbookEntries.length }})</label>
          <div class="flex flex-col gap-1 mb-2">
            <label
              v-for="entry in worldbookEntries"
              :key="entry.id"
              class="flex items-start gap-2 p-2 rounded-lg hover:bg-[#FFF7ED] transition-colors cursor-pointer"
              :style="isEntrySelected(entry.id) ? 'background:#FFF7ED;' : ''"
            >
              <input
                v-model="selectedEntryIdsModel"
                type="checkbox"
                :value="entry.id"
                class="mt-0.5 flex-shrink-0"
                style="accent-color:#F97316;"
              />
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
            <label
              v-for="entry in regexEntries"
              :key="entry.id"
              class="flex items-start gap-2 p-2 rounded-lg hover:bg-[#FFF7ED] transition-colors cursor-pointer"
              :style="isEntrySelected(entry.id) ? 'background:#FFF7ED;' : ''"
            >
              <input
                v-model="selectedEntryIdsModel"
                type="checkbox"
                :value="entry.id"
                class="mt-0.5 flex-shrink-0"
                style="accent-color:#F97316;"
              />
              <div class="flex-1 min-w-0">
                <div class="text-xs font-bold truncate text-[#431407]">{{ entry.name }}</div>
              </div>
            </label>
          </div>
        </template>

        <template v-if="greetingEntries.length > 0">
          <label class="text-[10px] font-bold text-[#92400E] uppercase tracking-wider mb-1 mt-1">开场白 ({{ greetingEntries.length }})</label>
          <div class="flex flex-col gap-1 mb-2">
            <label
              v-for="entry in greetingEntries"
              :key="entry.id"
              class="flex items-start gap-2 p-2 rounded-lg hover:bg-[#FFF7ED] transition-colors cursor-pointer"
              :style="isEntrySelected(entry.id) ? 'background:#FFF7ED;' : ''"
            >
              <input
                v-model="selectedEntryIdsModel"
                type="checkbox"
                :value="entry.id"
                class="mt-0.5 flex-shrink-0"
                style="accent-color:#F97316;"
              />
              <div class="flex-1 min-w-0">
                <div class="text-xs font-bold truncate text-[#431407]">{{ entry.name }}</div>
                <div v-if="entry.content" class="text-[10px] line-clamp-1 mt-0.5 text-[#78716C]">{{ entry.content }}</div>
              </div>
            </label>
          </div>
        </template>

        <p class="text-[10px] text-[#78350F] opacity-80 mt-2 border-t border-[#FED7AA] pt-2">
          已选择 {{ selectedEntryIds.length }} / {{ entries.length }} 条
        </p>
      </div>
    </div>
  </ConfirmModal>
</template>
