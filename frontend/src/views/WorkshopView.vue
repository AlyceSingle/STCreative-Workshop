<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useWorkshopStore } from '@/stores/workshop'
import WorkshopPackCard from '@/components/WorkshopPackCard.vue'
import { DEFAULT_TAGS } from '@/config/sections'

const router = useRouter()
const route = useRoute()
const authStore = useAuthStore()
const workshopStore = useWorkshopStore()

// ── 工坊 slug ──────────────────────────────────────────────────────────
// null 表示显示全部工坊（不默认进入某个工坊）
const workshopSlug = computed(() => route.query.workshop || null)

const currentWorkshop = computed(() =>
  workshopStore.workshops.find(w => w.slug === workshopSlug.value) || null
)
const workshopLabel = computed(() =>
  currentWorkshop.value?.name || workshopSlug.value || '全部'
)

// ── 世界书编辑 ────────────────────────────────────────────────────────
const worldbookEditing = ref(false)
const worldbookDraft = ref('')

function startEditWorldbook() {
  worldbookDraft.value = workshopStore.worldbookName
  worldbookEditing.value = true
}
function saveWorldbook() {
  const name = worldbookDraft.value.trim()
  if (!name) return
  workshopStore.setWorldbookName(workshopSlug.value || 'default', name)
  worldbookEditing.value = false
}
function cancelEditWorldbook() {
  worldbookEditing.value = false
}

// 恢复该工坊的默认世界书名称（来自工坊 worldbook 字段）
function restoreDefaultWorldbook() {
  const defaultName = currentWorkshop.value?.worldbook
  if (!workshopSlug.value || !defaultName) return
  workshopStore.setWorldbookName(workshopSlug.value, defaultName)
  worldbookEditing.value = false
}

// ── 搜索（400ms debounce）————————————————————————————————————————————
// 初始值读取 URL 中的 ?q= 参数（从主页弹窗跳转过来时自动填入）
const searchInput = ref(String(route.query.q || ''))
const activeSearch = ref(String(route.query.q || ''))
// ?mine=1：仅展示当前登录用户自己的模组
const showMine = computed(() => route.query.mine === '1')
let debounceTimer = null
watch(searchInput, (val) => {
  clearTimeout(debounceTimer)
  debounceTimer = setTimeout(() => { activeSearch.value = val.trim() }, 400)
})

// ── 排序 ──────────────────────────────────────────────────────────────
const currentSort = ref('popular') // 'popular' | 'newest'

// ── 动态映射 ──────────────────────────────────────────────────────────
const activeWorldbookName = ref(null)
const showMappingPanel = ref(false)
const showMappingModal = ref(false)  // 控制大屏模态框
const mappingSortKey = ref('order') // 'order' | 'depth' | 'uid' | 'name' | 'content'
const mappingSortOrder = ref('asc') // 'asc' | 'desc'

const selectedMappingEntry = ref(null)
const showEntryDetailModal = ref(false)

function openEntryDetail(entry) {
  selectedMappingEntry.value = entry
  showEntryDetailModal.value = true
}

const sortedMappingEntries = computed(() => {
  const name = workshopStore.worldbookName
  const entries = workshopStore.worldbookEntriesMap[name]
  if (!entries || !entries.length) return []
  
  return [...entries].sort((a, b) => {
    let res = 0
    if (mappingSortKey.value === 'order') {
      res = (a.position?.order ?? 0) - (b.position?.order ?? 0)
    } else if (mappingSortKey.value === 'depth') {
      res = (a.position?.depth ?? 0) - (b.position?.depth ?? 0)
    } else if (mappingSortKey.value === 'uid') {
      res = (a.uid ?? 0) - (b.uid ?? 0)
    } else if (mappingSortKey.value === 'name') {
      res = (a.name || '').localeCompare(b.name || '')
    } else if (mappingSortKey.value === 'content') {
      res = (a.content?.length ?? 0) - (b.content?.length ?? 0)
    }
    return mappingSortOrder.value === 'asc' ? res : -res
  })
})

async function autoMapWorldbook() {
  const name = workshopStore.worldbookName
  if (!name || !workshopStore.stConnected) return
  
  await workshopStore.fetchWorldbookEntries(name)
  if (workshopStore.worldbookEntriesMap[name]?.length > 0) {
    activeWorldbookName.value = name
    showMappingPanel.value = true
  }
}

// 当连接到 ST 且进入了某个工坊（且世界书名变化）时，自动映射
watch([() => workshopStore.stConnected, () => workshopStore.worldbookName], ([connected, name]) => {
  if (connected && name && workshopSlug.value) {
    autoMapWorldbook()
  }
}, { immediate: true })

// ── Tag 多选过滤 ──────────────────────────────────────────────────────
const activeTags = ref([])

// 已加载的 packs 中出现的额外 tag（不含预设 4 个）
const extraTags = computed(() => {
  const seen = new Set()
  workshopStore.packs.forEach(p => {
    (p.tags || []).forEach(t => {
      if (!DEFAULT_TAGS.includes(t)) seen.add(t)
    })
  })
  return [...seen]
})
const allFilterTags = computed(() => [...DEFAULT_TAGS, ...extraTags.value])

function toggleTag(tag) {
  const idx = activeTags.value.indexOf(tag)
  if (idx >= 0) {
    activeTags.value.splice(idx, 1)
  } else {
    activeTags.value.push(tag)
  }
}

function clearTags() {
  activeTags.value = []
}

// 在已加载的 packs 中做客户端多 tag 过滤（后端只支持单 tag）
const filteredPacks = computed(() => {
  if (!activeTags.value.length) return workshopStore.packs
  return workshopStore.packs.filter(p =>
    activeTags.value.every(t => (p.tags || []).includes(t))
  )
})

// ── 登录 toast ────────────────────────────────────────────────────────
const showLoginToast = ref(false)
onMounted(() => {
  if (route.query.login === 'required') {
    showLoginToast.value = true
    setTimeout(() => { showLoginToast.value = false }, 3000)
  }
})

// ST 扩展通知 toast（4.5s 自动消失）
watch(() => workshopStore.stNotification, (notif) => {
  if (notif) {
    setTimeout(() => {
      workshopStore.stNotification = null
    }, 4500)
  }
})

// ── 数据加载 ─────────────────────────────────────────────────────────
const isStEnv = computed(() => workshopStore.isSillyTavernEnv())

async function load(page = 1) {
  await workshopStore.fetchPacks(page, {
    workshop: workshopSlug.value || undefined,
    search: activeSearch.value || undefined,
    // 后端单 tag 过滤：若只选了一个 tag 则直接传给后端，多选时后端不过滤（客户端处理）
    tag: activeTags.value.length === 1 ? activeTags.value[0] : undefined,
    // ?mine=1：仅显示当前用户自己的模组
    authorId: showMine.value ? authStore.user?.id : undefined,
    sort: currentSort.value,
  })
}

// 工坊/搜索/mine/排序 变化时重新拉第 1 页（tag 变化只影响客户端过滤，不重新请求）
watch([workshopSlug, activeSearch, showMine, currentSort], () => load(1))

// 工坊切换时重新加载对应世界书名称，并关闭编辑态
watch(workshopSlug, (newSlug) => {
  if (newSlug) workshopStore.loadWorldbookForSection(newSlug)
  worldbookEditing.value = false
})

onMounted(async () => {
  // ST 扩展模式初始化
  await workshopStore.initStExtensionMode()
  // 先加载工坊列表（loadWorldbookForSection 需要 workshops 数据作 fallback）
  await workshopStore.fetchWorkshops()
  if (workshopSlug.value) workshopStore.loadWorldbookForSection(workshopSlug.value)
  await load(1)
  await workshopStore.scanSubscribedPacks()
})

async function goToPage(page) {
  await load(page)
  window.scrollTo({ top: 0, behavior: 'smooth' })
}

// 创建模组时携带当前工坊 workshop 参数
const newModRoute = computed(() => ({
  name: 'workshop-pack-new',
  query: workshopSlug.value ? { workshop: workshopSlug.value } : {},
}))
</script>

<template>
  <div class="page-container py-8">

    <!-- 登录提示 toast -->
    <Transition
      enter-active-class="transition duration-300 ease-out"
      enter-from-class="opacity-0 -translate-y-3"
      enter-to-class="opacity-100 translate-y-0"
      leave-active-class="transition duration-200 ease-in"
      leave-from-class="opacity-100"
      leave-to-class="opacity-0"
    >
      <div
        v-if="showLoginToast"
        class="fixed top-20 left-1/2 -translate-x-1/2 z-50 px-5 py-3 rounded-xl text-sm font-bold shadow-lg"
        style="background:#FFF7ED; color:#EA580C; border:2px solid #FDBA74; box-shadow:3px 3px 0 #FDBA74;"
      >
        请先登录后再操作
      </div>
    </Transition>

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

    <!-- 页头 -->
    <div class="flex items-center justify-between mb-2 flex-wrap gap-3">
      <div class="flex items-center gap-3">
        <!-- 回到主页 -->
        <RouterLink to="/" class="btn-secondary text-sm">← 主页</RouterLink>
        <h1
          class="text-2xl font-bold"
          style="font-family: 'Fredoka', sans-serif; color: #EA580C;"
        >
          {{ workshopLabel }} 工坊
        </h1>
      </div>

      <div class="flex gap-2 flex-shrink-0">
        <!-- 工坊所有者：编辑工坊 -->
        <RouterLink
          v-if="currentWorkshop && currentWorkshop.author_id && authStore.user?.id === currentWorkshop.author_id"
          :to="{ name: 'workshop-edit', params: { id: currentWorkshop.id } }"
          class="btn-secondary text-sm"
        >
          <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
          </svg>
          编辑工坊
        </RouterLink>
        <!-- 已登录：创建模组 -->
        <RouterLink
          v-if="authStore.isLoggedIn && !authStore.loading"
          :to="newModRoute"
          class="btn-primary text-sm"
        >
          <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <line x1="12" y1="5" x2="12" y2="19"/>
            <line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
          创建模组
        </RouterLink>
        <!-- 未登录 -->
        <button
          v-else-if="!authStore.loading && !authStore.isLoggedIn"
          class="btn-secondary text-sm"
          @click="authStore.loginWithDiscord()"
        >
          登录
        </button>
      </div>
    </div>

    <!-- 世界书名称行（仅在选中某个工坊时显示） -->
    <div v-if="workshopSlug" class="flex items-start gap-2 mb-5 flex-wrap">
      <span class="text-xs font-semibold mt-1.5" style="color:#A8A29E; font-family:'Nunito',sans-serif; white-space:nowrap;">
        当前世界书：
      </span>
      <template v-if="!worldbookEditing">
        <span
          class="text-xs font-bold px-2.5 py-1 rounded-full"
          style="background:#FFF7ED; color:#78350F; border:1.5px solid #FDBA74; font-family:'Nunito',sans-serif; max-width:min(340px, calc(100vw - 120px)); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; display:inline-block;"
        >{{ workshopStore.worldbookName }}</span>
        <button
          @click="startEditWorldbook"
          class="p-1 rounded-full transition-colors flex-shrink-0"
          style="color:#A8A29E; border:1.5px solid #E7E5E4; background:#FFFBF0;"
          title="修改目标世界书名称"
        >
          <!-- 铅笔图标 -->
          <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
          </svg>
        </button>
      </template>
      <template v-else>
        <div class="flex flex-wrap items-center gap-2 w-full sm:w-auto">
          <input
            v-model="worldbookDraft"
            class="input text-xs py-1 w-full sm:w-auto"
            style="min-width:0; max-width:300px; font-family:'Nunito',sans-serif;"
            placeholder="输入世界书名称"
            @keyup.enter="saveWorldbook"
            @keyup.escape="cancelEditWorldbook"
            autofocus
          />
          <button class="btn-primary text-xs py-1 px-3" @click="saveWorldbook">保存</button>
          <button class="btn-secondary text-xs py-1 px-3" @click="cancelEditWorldbook">取消</button>
          <!-- 恢复该工坊的默认世界书名称 -->
          <button
            v-if="currentWorkshop?.worldbook"
            class="text-xs py-1 px-3 rounded-xl font-bold transition-colors"
            style="background:#FFF7ED; color:#78350F; border:1.5px solid #FDBA74; font-family:'Nunito',sans-serif;"
            @click="restoreDefaultWorldbook"
            title="恢复为该工坊的默认世界书名称"
          >恢复默认</button>
        </div>
      </template>
      <!-- ST 环境状态 -->
      <div v-if="workshopStore.isFromStExtension()" class="flex items-center gap-2 flex-wrap w-full sm:w-auto">
        <span
          v-if="workshopStore.stConnected"
          class="text-xs font-bold px-2.5 py-1 rounded-full"
          style="background:#DCFCE7; color:#16A34A; border:1.5px solid #22C55E; font-family:'Nunito',sans-serif;"
        >
          ⚡ 已连接到 SillyTavern 扩展
        </span>
        <span
          v-else
          class="text-xs font-bold px-2.5 py-1 rounded-full"
          style="background:#FEF2F2; color:#EF4444; border:1.5px solid #FECACA; font-family:'Nunito',sans-serif;"
        >
          ⚠ 未连接到 SillyTavern 扩展
        </span>
      </div>
    </div>

    <!-- 动态世界书条目映射 -->
    <div v-if="workshopStore.stConnected && workshopSlug" class="mb-6">
      <div
        class="card p-3"
        style="background: #FFFBF0; border: 2px solid #FDBA74; border-radius: 12px;"
      >
        <div class="flex items-center justify-between mb-0 flex-wrap gap-2">
          <div class="flex items-center gap-2">
            <h3 class="font-bold text-[13px]" style="font-family: 'Fredoka', sans-serif; color: #431407;">已连接世界书</h3>
            <button
              @click="autoMapWorldbook"
              class="p-0.5 rounded-full transition-colors flex-shrink-0"
              style="color:#F97316;"
              title="重新刷新"
            >
              <svg
                class="w-3 h-3"
                :class="{ 'animate-spin': workshopStore.loading }"
                viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"
              >
                <path d="M23 4v6h-6"/><path d="M1 20v-6h6"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
              </svg>
            </button>
          </div>
          
          <div class="flex items-center gap-3 ml-auto">
            <div v-if="workshopStore.worldbookEntriesMap[workshopStore.worldbookName]?.length" class="flex items-center gap-1.5">
              <span class="text-[11px] font-bold" style="color:#EA580C;">已同步 {{ workshopStore.worldbookEntriesMap[workshopStore.worldbookName].length }} 条</span>
              <div class="h-3 w-[1.5px] bg-[#FDBA74]"></div>
              <select v-model="mappingSortKey" class="text-[10px] font-bold p-0.5 rounded border border-[#FDBA74]" style="background:#FFFBF0; color:#78350F;">
                <option value="order">顺序</option>
                <option value="depth">深度</option>
                <option value="uid">UID</option>
                <option value="name">名称</option>
                <option value="content">字符</option>
              </select>
              <button 
                @click="mappingSortOrder = mappingSortOrder === 'asc' ? 'desc' : 'asc'"
                class="text-[10px] font-bold px-1 rounded border border-[#FDBA74]"
                style="background:#FFF7ED; color:#78350F;"
              >
                {{ mappingSortOrder === 'asc' ? '↑' : '↓' }}
              </button>
            </div>
            <button 
              @click="showMappingModal = true" 
              class="text-xs font-bold"
              style="color:#EA580C; min-width:34px;"
            >
              展开
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- 大屏映射查看模态框 -->
    <Teleport to="body">
      <Transition
        enter-active-class="transition duration-300 ease-out"
        enter-from-class="opacity-0"
        enter-to-class="opacity-100"
        leave-active-class="transition duration-200 ease-in"
        leave-from-class="opacity-100"
        leave-to-class="opacity-0"
      >
        <div
          v-if="showMappingModal"
          class="fixed inset-0 z-[150] flex items-center justify-center p-4 sm:p-10"
          style="background: rgba(67, 20, 7, 0.45);"
          @click.self="showMappingModal = false"
        >
          <div
            class="w-full max-w-5xl h-full max-h-[85vh] flex flex-col overflow-hidden"
            style="background:#FFFBF0; border:3px solid #FDBA74; border-radius:24px; box-shadow:10px 10px 0 #FDBA74;"
          >
            <!-- 页头 -->
            <div class="p-6 border-b-2 border-dashed border-[#FDBA74] flex items-center justify-between bg-white/50">
              <div>
                <h3 class="text-2xl font-bold" style="font-family:'Fredoka',sans-serif; color:#9A3412;">
                  世界书: {{ workshopStore.worldbookName }}
                </h3>
                <p class="text-sm font-bold mt-1" style="color:#EA580C;">
                  已同步 {{ workshopStore.worldbookEntriesMap[workshopStore.worldbookName]?.length || 0 }} 条条目
                </p>
              </div>
              
              <div class="flex items-center gap-4">
                <!-- 排序控制 -->
                <div class="flex items-center gap-2 px-4 py-2 rounded-2xl bg-[#FFF7ED] border border-[#FDBA74]">
                  <span class="text-xs font-bold text-[#A8A29E]">排序方式</span>
                  <select v-model="mappingSortKey" class="text-sm font-bold bg-transparent border-none focus:ring-0 text-[#78350F]">
                    <option value="order">执行顺序</option>
                    <option value="depth">插入深度</option>
                    <option value="uid">原始 UID</option>
                    <option value="name">条目名称</option>
                    <option value="content">字符长度</option>
                  </select>
                  <button 
                    @click="mappingSortOrder = mappingSortOrder === 'asc' ? 'desc' : 'asc'"
                    class="w-8 h-8 flex items-center justify-center rounded-full bg-white border border-[#FDBA74] text-[#78350F] transition-transform"
                    :class="{ 'rotate-180': mappingSortOrder === 'desc' }"
                  >
                    ↑
                  </button>
                </div>

                <button
                  @click="showMappingModal = false"
                  class="w-12 h-12 rounded-full flex items-center justify-center transition-colors shadow-sm"
                  style="color:#EA580C; border:2.5px solid #FDBA74; background:#FFF7ED;"
                >
                  <svg class="w-7 h-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                  </svg>
                </button>
              </div>
            </div>

            <!-- 列表内容 (大屏网格) -->
            <div class="flex-1 overflow-y-auto p-8 custom-scrollbar">
              <div 
                class="w-full"
                style="column-width: 220px; column-gap: 12px;"
              >
                <button
                  v-for="entry in sortedMappingEntries"
                  :key="entry.uid"
                  @click="openEntryDetail(entry)"
                  class="flex items-center w-full px-4 py-3 mb-3 rounded-xl border-2 font-bold transition-all duration-150 hover:scale-[1.02] active:scale-[0.98] text-left shadow-sm"
                  style="break-inside: avoid;"
                  :style="entry.enabled 
                    ? 'background: white; border-color: #FDBA74; color: #431407;' 
                    : 'background: #F5F5F4; border-color: #E7E5E4; color: #A8A29E;'"
                >
                  <div class="flex flex-col flex-1 truncate">
                    <div class="flex items-center gap-2 mb-1">
                      <span class="text-[10px] px-1.5 py-0.5 rounded-md bg-[#FFF7ED] text-[#EA580C] border border-[#FDBA74]">
                        {{ String(entry.position?.order ?? 0).padStart(3, '0') }}
                      </span>
                      <span class="truncate text-sm">{{ entry.name || '(未命名)' }}</span>
                    </div>
                    <div class="text-[10px] opacity-50 font-normal truncate">
                      {{ entry.content }}
                    </div>
                  </div>
                  
                  <div class="flex-shrink-0 ml-3">
                    <span v-if="entry.strategy?.type === 'constant'" class="w-3 h-3 rounded-full bg-blue-500 block shadow-[0_0_6px_rgba(59,130,246,0.5)]"></span>
                    <span v-else-if="entry.strategy?.type === 'selective'" class="w-3 h-3 rounded-full bg-green-500 block shadow-[0_0_6px_rgba(34,197,94,0.5)]"></span>
                    <span v-else class="text-sm">🔗</span>
                  </div>
                </button>
              </div>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>

    <!-- 详情模态框 (Teleport) -->
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
          @click.self="showEntryDetailModal = false"
        >
          <div
            class="w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden"
            style="background:#FFFBF0; border:3px solid #FDBA74; border-radius:24px; box-shadow:8px 8px 0 #FDBA74;"
          >
            <!-- 模态框页头 -->
            <div class="p-5 border-b-2 border-dashed border-[#FDBA74] flex items-center justify-between">
              <div>
                <h3 class="text-xl font-bold" style="font-family:'Fredoka',sans-serif; color:#9A3412;">
                  {{ selectedMappingEntry?.name || '未命名条目' }}
                </h3>
                <div class="flex gap-3 mt-1 text-xs font-bold" style="color:#A8A29E;">
                  <span>UID: {{ selectedMappingEntry?.uid }}</span>
                  <span>Order: {{ selectedMappingEntry?.position?.order }}</span>
                  <span>Depth: {{ selectedMappingEntry?.position?.depth }}</span>
                </div>
              </div>
              <button
                @click="showEntryDetailModal = false"
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
                {{ selectedMappingEntry?.content }}
              </div>
              
              <!-- 更多元数据 -->
              <div class="grid grid-cols-2 gap-4">
                <div class="p-3 rounded-xl bg-[#FFF7ED] border border-[#FDBA74]">
                  <span class="block text-[10px] text-[#A8A29E] uppercase font-bold">策略类型</span>
                  <span class="text-xs font-bold text-[#78350F]">{{ selectedMappingEntry?.strategy?.type }}</span>
                </div>
                <div class="p-3 rounded-xl bg-[#FFF7ED] border border-[#FDBA74]">
                  <span class="block text-[10px] text-[#A8A29E] uppercase font-bold">关键词</span>
                  <span class="text-xs font-bold text-[#78350F]">{{ selectedMappingEntry?.strategy?.keys?.join(', ') || '(无)' }}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>

    <!-- 搜索栏 + tag 过滤 -->
    <div class="flex flex-col gap-3 mb-6">
      <!-- 搜索输入与排序 -->
      <div class="flex items-center gap-2">
        <div class="relative flex-1">
          <svg class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style="color:#A8A29E;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input
            v-model="searchInput"
            type="text"
            class="input pl-9 text-sm"
            placeholder="搜索模组名称…"
            style="font-family:'Nunito',sans-serif;"
          />
        </div>
        <select v-model="currentSort" class="input w-32 text-sm" style="font-family:'Nunito',sans-serif;">
          <option value="popular">按热度排序</option>
          <option value="newest">按最新发布</option>
        </select>
      </div>

      <!-- Tag 过滤 chips -->
      <div class="flex flex-wrap gap-2">
        <button
          v-for="tag in allFilterTags"
          :key="tag"
          @click="toggleTag(tag)"
          class="text-xs font-bold px-3 py-1 rounded-full transition-all duration-150"
          :style="activeTags.includes(tag)
            ? 'background:#F97316; color:white; border:2px solid #EA580C; box-shadow:2px 2px 0 #EA580C;'
            : 'background:#FFF7ED; color:#78716C; border:2px solid #E7E5E4;'"
        >
          {{ tag }}
        </button>
        <button
          v-if="activeTags.length"
          @click="clearTags"
          class="text-xs font-bold px-3 py-1 rounded-full transition-all duration-150"
          style="background:#FEF2F2; color:#EF4444; border:2px solid #FECACA;"
        >
          ✕ 清除
        </button>
      </div>
    </div>

    <!-- 错误提示 -->
    <div
      v-if="workshopStore.error"
      class="mb-4 px-4 py-3 rounded-xl text-sm font-semibold"
      style="background: #FEF2F2; color: #EF4444; border: 1.5px solid #FECACA;"
    >
      {{ workshopStore.error }}
    </div>

    <!-- 加载状态 -->
    <div v-if="workshopStore.loading" class="flex flex-col items-center justify-center py-20 gap-3">
      <div
        class="w-10 h-10 rounded-full animate-spin"
        style="border: 3px solid #FED7AA; border-top-color: #F97316;"
      ></div>
      <p class="text-sm" style="color: #A8A29E; font-family: 'Nunito', sans-serif;">加载中…</p>
    </div>

    <!-- 空状态 -->
    <div
      v-else-if="!workshopStore.packs.length"
      class="flex flex-col items-center justify-center py-20 gap-4"
    >
      <svg class="w-16 h-16 opacity-30" viewBox="0 0 64 64" fill="none" stroke="#F97316" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <rect x="8" y="12" width="48" height="40" rx="6"/>
        <line x1="20" y1="26" x2="44" y2="26"/>
        <line x1="20" y1="34" x2="36" y2="34"/>
      </svg>
      <p class="text-base font-semibold" style="color: #C0B8B0; font-family: 'Fredoka', sans-serif;">
        {{ activeSearch || activeTags.length ? '没有匹配的模组' : '还没有任何模组' }}
      </p>
      <RouterLink
        v-if="authStore.isLoggedIn && !activeSearch && !activeTags.length"
        :to="newModRoute"
        class="btn-primary text-sm"
      >
        创建第一个模组
      </RouterLink>
    </div>

    <!-- Pack 列表 -->
    <div
      v-else
      class="grid gap-5"
      style="grid-template-columns: repeat(auto-fill, minmax(min(300px, 100%), 1fr));"
    >
      <WorkshopPackCard
        v-for="pack in filteredPacks"
        :key="pack.id"
        :pack="pack"
      />
    </div>

    <!-- 分页 -->
    <div
      v-if="workshopStore.pagination.totalPages > 1"
      class="flex items-center justify-center gap-2 mt-8 flex-wrap"
    >
      <button
        class="btn-secondary text-sm"
        :disabled="workshopStore.pagination.page <= 1"
        @click="goToPage(workshopStore.pagination.page - 1)"
      >
        上一页
      </button>
      <span class="text-sm px-2" style="color: #A8A29E; font-family: 'Nunito', sans-serif;">
        {{ workshopStore.pagination.page }} / {{ workshopStore.pagination.totalPages }}
      </span>
      <button
        class="btn-secondary text-sm"
        :disabled="workshopStore.pagination.page >= workshopStore.pagination.totalPages"
        @click="goToPage(workshopStore.pagination.page + 1)"
      >
        下一页
      </button>
    </div>

  </div>
</template>
