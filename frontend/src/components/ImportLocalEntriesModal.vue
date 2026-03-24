<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import { useWorkshopStore } from '@/stores/workshop'

const props = defineProps({
  visible: {
    type: Boolean,
    default: false,
  },
})

const emit = defineEmits(['confirm', 'cancel', 'close'])

const workshopStore = useWorkshopStore()

const loading = ref(false)
const worldbookList = ref([])
const selectedWorldbook = ref('')
const worldbookEntries = ref([])
const entriesLoading = ref(false)
const selectedEntryIndices = ref([])

const hasEntries = computed(() => worldbookEntries.value.length > 0)
const selectedCount = computed(() => selectedEntryIndices.value.length)

watch(selectedWorldbook, async (newVal) => {
  if (newVal) {
    await loadWorldbookEntries(newVal)
  } else {
    worldbookEntries.value = []
    selectedEntryIndices.value = []
  }
})

async function loadWorldbookList() {
  loading.value = true
  try {
    const list = await workshopStore.fetchWorldbookList()
    worldbookList.value = list || []
    if (worldbookList.value.length > 0) {
      selectedWorldbook.value = worldbookList.value[0]
    }
  } catch (err) {
    console.error('[ImportLocalEntries] 获取世界书列表失败:', err)
  } finally {
    loading.value = false
  }
}

async function loadWorldbookEntries(worldbookName) {
  entriesLoading.value = true
  selectedEntryIndices.value = []
  try {
    await workshopStore.fetchWorldbookEntries(worldbookName)
    worldbookEntries.value = workshopStore.worldbookEntriesMap[worldbookName] || []
  } catch (err) {
    console.error(`[ImportLocalEntries] 获取世界书「${worldbookName}」条目失败:`, err)
    worldbookEntries.value = []
  } finally {
    entriesLoading.value = false
  }
}

function toggleSelectAll() {
  if (selectedEntryIndices.value.length === worldbookEntries.value.length) {
    selectedEntryIndices.value = []
  } else {
    selectedEntryIndices.value = worldbookEntries.value.map((_, idx) => idx)
  }
}

function isEntrySelected(idx) {
  return selectedEntryIndices.value.includes(idx)
}

function toggleEntry(idx) {
  const pos = selectedEntryIndices.value.indexOf(idx)
  if (pos === -1) {
    selectedEntryIndices.value.push(idx)
  } else {
    selectedEntryIndices.value.splice(pos, 1)
  }
}

function convertStEntryToSystem(entry) {
  const result = {
    name: entry.comment || entry.name || '未命名条目',
    enabled: entry.disable !== true && entry.disabled !== true,
    content: entry.content || '',
    entry_type: 'worldbook',
  }

  const strategyType = entry.constant ? 'constant' : (entry.vectorized ? 'vectorized' : 'selective')
  result.strategy_type = strategyType
  result.keys = Array.isArray(entry.key) ? entry.key : (Array.isArray(entry.keys) ? entry.keys : [])
  result.keys_secondary = Array.isArray(entry.keysecondary) ? entry.keysecondary : (Array.isArray(entry.keys_secondary) ? entry.keys_secondary : [])
  
  const selectiveLogicMap = {
    0: 'and_any',
    1: 'not_all',
    2: 'not_any',
    3: 'and_all',
  }
  result.keys_secondary_logic = selectiveLogicMap[entry.selectiveLogic] || 'and_any'
  result.scan_depth = entry.scanDepth ?? 'same_as_global'

  const ST_POSITION_MAP = {
    0: 'before_character_definition',
    1: 'after_character_definition',
    2: 'before_example_messages',
    3: 'after_example_messages',
    4: 'at_depth',
    5: 'before_author_note',
    6: 'after_author_note',
    7: 'at_depth',
    8: 'at_depth',
    9: 'before_system_prompt',
    10: 'after_system_prompt',
  }
  result.position_type = ST_POSITION_MAP[entry.position] || 'after_character_definition'
  result.position_depth = entry.depth ?? 4
  result.position_order = entry.order ?? 100
  result.position_role = entry.role || 'system'
  result.probability = entry.probability ?? 100
  result.recursion_prevent_incoming = !!entry.preventRecursion
  result.recursion_prevent_outgoing = !!entry.excludeRecursion
  result.recursion_delay_until = entry.delayUntilRecursion ? 1 : null
  result.effect_sticky = entry.sticky || null
  result.effect_cooldown = entry.cooldown || null
  result.effect_delay = entry.delay || null

  return result
}

function handleConfirm() {
  if (selectedEntryIndices.value.length === 0) {
    return
  }

  const selectedEntries = selectedEntryIndices.value.map(idx => {
    const entry = worldbookEntries.value[idx]
    return convertStEntryToSystem(entry)
  })

  emit('confirm', selectedEntries)
  handleClose()
}

function handleCancel() {
  emit('cancel')
  handleClose()
}

function handleClose() {
  selectedWorldbook.value = ''
  worldbookEntries.value = []
  selectedEntryIndices.value = []
  emit('close')
}

onMounted(() => {
  if (props.visible) {
    loadWorldbookList()
  }
})

watch(() => props.visible, (newVal) => {
  if (newVal) {
    loadWorldbookList()
  }
})
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
        v-if="visible"
        class="fixed inset-0 z-[200] flex items-center justify-center p-4"
        style="background: rgba(67, 20, 7, 0.35);"
        @click.self="handleCancel"
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
            v-if="visible"
            class="w-full max-w-lg flex flex-col gap-4 p-6"
            style="
              background: #FFFBF0;
              border: 2.5px solid #FDBA74;
              border-radius: 20px;
              box-shadow: 6px 6px 0 #FDBA74;
            "
          >
            <div class="flex items-center gap-2.5">
              <svg class="w-5 h-5 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="#F97316" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                <polyline points="17 8 12 3 7 8"/>
                <line x1="12" y1="3" x2="12" y2="15"/>
              </svg>
              <h3
                class="font-bold text-base"
                style="font-family: 'Fredoka', sans-serif; color: #431407;"
              >
                从本地世界书导入
              </h3>
            </div>

            <div class="flex flex-col gap-3">
              <div class="flex flex-col gap-1.5">
                <label class="text-[10px] font-bold text-[#92400E] uppercase tracking-wider">选择世界书</label>
                <select
                  v-model="selectedWorldbook"
                  class="input text-sm py-1.5"
                  :disabled="loading"
                >
                  <option v-if="loading" value="">加载中...</option>
                  <option v-else-if="worldbookList.length === 0" value="">暂无世界书</option>
                  <option v-for="name in worldbookList" :key="name" :value="name">
                    {{ name }}
                  </option>
                </select>
              </div>

              <div v-if="entriesLoading" class="flex items-center justify-center py-8">
                <div class="animate-spin w-6 h-6 border-2 border-orange-400 border-t-transparent rounded-full"></div>
              </div>

              <div v-else-if="selectedWorldbook && !hasEntries" class="flex flex-col items-center justify-center py-6 gap-2" style="border:2px dashed #FED7AA; border-radius:12px;">
                <p class="text-sm" style="color:#78716C;">此世界书没有条目</p>
              </div>

              <div v-else-if="hasEntries" class="flex flex-col gap-3 p-3 rounded-xl bg-[#FFFBF0] border border-[#FDBA74] max-h-[40vh] overflow-y-auto custom-scrollbar">
                <div class="flex items-center justify-between pb-2 border-b border-[#FED7AA]">
                  <span class="text-xs font-bold text-[#78350F]">选择要导入的条目</span>
                  <button
                    class="text-[10px] font-bold px-2 py-0.5 rounded"
                    style="background:#FFF7ED; color:#EA580C; border:1px solid #FDBA74;"
                    @click="toggleSelectAll"
                  >
                    {{ selectedEntryIndices.length === worldbookEntries.length ? '取消全选' : '全选所有' }}
                  </button>
                </div>

                <div class="flex flex-col gap-1">
                  <label
                    v-for="(entry, idx) in worldbookEntries"
                    :key="idx"
                    class="flex items-start gap-2 p-2 rounded-lg hover:bg-[#FFF7ED] transition-colors cursor-pointer"
                    :style="isEntrySelected(idx) ? 'background:#FFF7ED;' : ''"
                  >
                    <input
                      type="checkbox"
                      :checked="isEntrySelected(idx)"
                      class="mt-0.5 flex-shrink-0"
                      style="accent-color:#F97316;"
                      @change="toggleEntry(idx)"
                    />
                    <div class="flex-1 min-w-0">
                      <div class="text-xs font-bold truncate text-[#431407]">{{ entry.comment || entry.name || '未命名条目' }}</div>
                      <div v-if="entry.content" class="text-[10px] line-clamp-1 mt-0.5 text-[#78716C]">{{ entry.content }}</div>
                      <div v-if="entry.key && entry.key.length" class="flex flex-wrap gap-1 mt-1">
                        <span v-for="key in entry.key.slice(0, 5)" :key="key" class="text-[9px] px-1.5 py-0.5 rounded" style="background:#FFF7ED; color:#EA580C; border:1px solid #FED7AA;">{{ key }}</span>
                        <span v-if="entry.key.length > 5" class="text-[9px] px-1.5 py-0.5 rounded" style="background:#FFF7ED; color:#78716C;">+{{ entry.key.length - 5 }}</span>
                      </div>
                    </div>
                  </label>
                </div>

                <p class="text-[10px] text-[#78350F] opacity-80 mt-2 border-t border-[#FED7AA] pt-2">
                  已选择 {{ selectedCount }} / {{ worldbookEntries.length }} 条
                </p>
              </div>
            </div>

            <div class="flex items-center justify-end gap-3 pt-1">
              <button
                class="btn-secondary text-sm"
                @click="handleCancel"
              >
                取消
              </button>
              <button
                class="btn-primary text-sm"
                :disabled="selectedCount === 0"
                @click="handleConfirm"
              >
                导入选中条目
              </button>
            </div>
          </div>
        </Transition>
      </div>
    </Transition>
  </Teleport>
</template>
