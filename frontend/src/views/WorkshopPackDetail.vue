<script setup>
import { onMounted, computed, ref, watch } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useWorkshopStore } from '@/stores/workshop'
import { useAuthStore } from '@/stores/auth'
import ConfirmModal from '@/components/ConfirmModal.vue'

const router = useRouter()
const route = useRoute()
const workshopStore = useWorkshopStore()
const authStore = useAuthStore()

const packId = computed(() => parseInt(route.params.packId))
const pack = computed(() => workshopStore.currentPack)
const isOwner = computed(() => authStore.user && pack.value && authStore.user.id === pack.value.author.id)
const isAdmin = computed(() => authStore.user && authStore.user.role === 'admin')
const canAddEntry = computed(() => isOwner.value || isAdmin.value)

// 批量导入文件输入
const batchFileInput = ref(null)

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
  
  // 转换为 TavernHelper WorldbookEntry 格式
  const stEntries = entriesToExport.map(entry => ({
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
  }))

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

  const blob = new Blob([JSON.stringify(stEntries, null, 2)], { type: 'application/json' })
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

async function handleBatchImport(event) {
  const file = event.target.files[0]
  if (!file) return

  const reader = new FileReader()
  reader.onload = async (e) => {
    try {
      const data = JSON.parse(e.target.result)
      const entriesToImport = Array.isArray(data) ? data : [data]
      
      // 预处理导入的数据，映射到后端期望的格式
      const processedEntries = entriesToImport.map(entry => {
        // 尝试从嵌套结构映射，如果已经是扁平结构则保留
        const result = {
          name: entry.name || '未命名条目',
          enabled: entry.enabled !== undefined ? !!entry.enabled : true,
          content: entry.content || '',
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
          result.scan_depth = entry.scan_depth || 'same_as_global'
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
      })

      const ok = await workshopStore.createEntries(packId.value, processedEntries)
      if (ok) {
        await workshopStore.fetchPack(packId.value) // 重新加载列表
        workshopStore.stNotification = { type: 'success', message: `成功导入 ${processedEntries.length} 条条目` }
      }
    } catch (err) {
      console.error('批量导入失败:', err)
      workshopStore.error = '批量导入失败：无效的 JSON 文件'
    }
  }
  reader.readAsText(file)
  event.target.value = ''
}

// 判断用户是否可编辑某条目（条目作者本人 或 pack 作者 或 管理员）
function canEditEntry(entry) {
  if (!authStore.user) return false
  return authStore.user.id === entry.author_id || isOwner.value || isAdmin.value
}
const isStEnv = computed(() => workshopStore.isSillyTavernEnv())

// 返回工坊时携带分区参数
function goBackToWorkshop() {
  const slug = pack.value?.workshop?.slug || pack.value?.section || null
  router.push({
    name: 'workshop',
    query: slug ? { workshop: slug } : {},
  })
}

onMounted(async () => {
  await workshopStore.initStExtensionMode()
  const result = await workshopStore.fetchPack(packId.value)
  if (!result) {
    router.push({ name: 'workshop' })
    return
  }
  // 按 pack 所属工坊设置世界书名称
  const slug = result.workshop?.slug || result.section
  if (slug) {
    workshopStore.loadWorldbookForSection(slug)
  }
  await workshopStore.scanSubscribedPacks()
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
// 导出条目选择（独立状态，避免与订阅弹窗混淆）
const exportEntryIds = ref([])

async function handleSubscribe() {
  if (!authStore.isLoggedIn) { authStore.loginWithDiscord(); return }
  // 取消订阅：无需确认，直接执行
  if (pack.value?.is_subscribed) {
    workshopStore.toggleSubscribe(pack.value)
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
  
  showSubConfirm.value = true
}

function handleOpenExport() {
  if (!pack.value || !pack.value.entries || pack.value.entries.length === 0) return
  // 初始化导出条目选择列表（默认全选）
  exportEntryIds.value = pack.value.entries.map(e => e.id)
  showExportConfirm.value = true
}

async function confirmSubscribe() {
  showSubConfirm.value = false
  // 如果用户修改了世界书名称，更新 store 中的状态
  if (targetWorldbookName.value.trim()) {
    const slug = pack.value?.workshop?.slug || pack.value?.section || 'default'
    workshopStore.setWorldbookName(slug, targetWorldbookName.value.trim())
  }
  // 传入选中的条目 ID 列表
  await workshopStore.toggleSubscribe(pack.value, selectedEntryIds.value)
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
  return type === 'constant' ? '🔵 蓝灯（常驻）' : '🟢 绿灯（触发词）'
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
        <span>⚡ 已连接到 SillyTavern 扩展 — 订阅将直接插入世界书「{{ workshopStore.worldbookName }}」</span>
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
          <span>{{ pack.entry_count }} 条条目</span>
          <span>{{ new Date(pack.created_at).toLocaleDateString('zh-CN') }} 发布</span>
          <span v-if="isStEnv && pack.is_subscribed" style="color:#16A34A; font-weight:700;">✓ 已插入世界书</span>
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
            :style="pack.is_subscribed
              ? 'background:#F0FDF4; color:#16A34A; border:2.5px solid #22C55E; box-shadow:3px 3px 0 #22C55E;'
              : 'background:#FFFBF0; color:#A8A29E; border:2.5px solid #E7E5E4; box-shadow:3px 3px 0 #E7E5E4;'"
            @click="handleSubscribe"
            :disabled="workshopStore.stLoading"
          >
            <svg class="sub-icon w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12 22c1.1 0 2-.9 2-2H10c0 1.1.9 2 2 2z"/>
              <path d="M18 16V11a6 6 0 0 0-5-5.91V4a1 1 0 0 0-2 0v1.09A6 6 0 0 0 6 11v5l-2 2v1h16v-1l-2-2z"/>
            </svg>
            <span v-if="workshopStore.stLoading">处理中…</span>
            <template v-else>
              <span v-if="workshopStore.isFromStExtension() && workshopStore.stConnected">
                {{ pack.is_subscribed ? '取消订阅' : '订阅到 ST' }}（{{ pack.sub_count }}）
              </span>
              <span v-else>
                {{ pack.is_subscribed ? '取消订阅' : '订阅' }}（{{ pack.sub_count }}）
              </span>
            </template>
          </button>

          <!-- 作者操作 -->
          <template v-if="isOwner">
            <RouterLink
              :to="{ name: 'workshop-pack-edit', params: { packId: pack.id } }"
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

      <!-- 条目列表 -->
      <div class="flex items-center justify-between mb-3">
        <h2 class="font-bold text-lg" style="font-family:'Fredoka',sans-serif; color:#EA580C;">
          条目列表
        </h2>
        <div class="flex items-center gap-2">
          <template v-if="canAddEntry">
            <input type="file" ref="batchFileInput" class="hidden" accept=".json" @change="handleBatchImport" />
            <button type="button" class="btn-secondary text-sm py-1.5 px-3" @click="triggerBatchImport">
            导入 JSON
            </button>
          </template>
          <button type="button" class="btn-secondary text-sm py-1.5 px-3" @click="handleOpenExport">
            导出 JSON
          </button>
          <RouterLink
            v-if="canAddEntry"
            :to="{ name: 'workshop-entry-new', params: { packId: pack.id } }"
            class="btn-primary text-sm"
          >
            添加条目
          </RouterLink>
        </div>
      </div>

      <!-- 无条目 -->
      <div
        v-if="!pack.entries || !pack.entries.length"
        class="flex flex-col items-center justify-center py-12 gap-3"
        style="border:2px dashed #FED7AA; border-radius:16px;"
      >
        <p class="text-sm font-semibold" style="color:#C0B8B0; font-family:'Fredoka',sans-serif;">
          此模组还没有条目
        </p>
        <RouterLink
          v-if="canAddEntry"
          :to="{ name: 'workshop-entry-new', params: { packId: pack.id } }"
          class="btn-primary text-sm"
        >
          添加第一条
        </RouterLink>
      </div>

      <!-- 条目卡片 -->
      <div v-else class="flex flex-col gap-3">
        <div
          v-for="entry in pack.entries"
          :key="entry.id"
          class="p-4 flex flex-col gap-2"
          style="background:white; border:2px solid #FED7AA; border-radius:14px;"
        >
          <div class="flex items-start justify-between gap-2">
            <div class="flex items-center gap-2 flex-wrap">
              <!-- 启用状态 -->
              <span
                class="text-xs font-bold px-2 py-0.5 rounded-full"
                :style="entry.enabled
                  ? 'background:#DCFCE7; color:#16A34A; border:1.5px solid #22C55E;'
                  : 'background:#F3F4F6; color:#9CA3AF; border:1.5px solid #D1D5DB;'"
              >
                {{ entry.enabled ? '启用' : '禁用' }}
              </span>
              <!-- 策略类型 -->
              <span class="text-xs font-bold px-2 py-0.5 rounded-full" style="background:#FFF7ED; color:#EA580C; border:1.5px solid #FDBA74;">
                {{ strategyLabel(entry.strategy_type) }}
              </span>
            </div>

            <!-- 编辑/删除（条目作者或 pack 作者） -->
            <div v-if="canEditEntry(entry)" class="flex items-center gap-2 flex-shrink-0">
              <RouterLink
                :to="{ name: 'workshop-entry-edit', params: { packId: pack.id, entryId: entry.id } }"
                class="text-xs font-bold px-3 py-1 rounded-full transition-colors"
                style="color:#EA580C; border:1.5px solid #FDBA74; background:#FFFBF0;"
              >
                编辑
              </RouterLink>
              <button
                class="text-xs font-bold px-3 py-1 rounded-full transition-colors"
                style="color:#EF4444; border:1.5px solid #FECACA; background:#FEF2F2;"
                @click="handleDeleteEntry(entry.id)"
              >
                删除
              </button>
            </div>
          </div>

          <!-- 名称 -->
          <h3 class="font-bold text-sm" style="font-family:'Fredoka',sans-serif; color:#431407;">
            {{ entry.name }}
          </h3>

          <!-- 触发词 -->
          <div v-if="entry.keys && entry.keys.length" class="flex flex-wrap gap-1.5">
            <span
              v-for="key in entry.keys"
              :key="key"
              class="tag-badge"
            >
              {{ key }}
            </span>
          </div>

          <!-- 内容预览 -->
          <p
            v-if="entry.content"
            class="text-xs line-clamp-3"
            style="color:#78716C; font-family:'Nunito',sans-serif; background:#FFFBF0; border-radius:8px; padding:8px; border:1px solid #FED7AA;"
          >
            {{ entry.content }}
          </p>
        </div>
      </div>

    </template>
  </div>

  <!-- 订阅确认弹窗 -->
  <ConfirmModal
    v-if="showSubConfirm"
    title="订阅模组"
    confirm-text="确认订阅"
    cancel-text="取消"
    @confirm="confirmSubscribe"
    @cancel="showSubConfirm = false"
  >
    <div class="flex flex-col gap-4">
      <p v-html="`确定要订阅 <strong>${pack?.title}</strong> 吗？`"></p>
      
      <div v-if="workshopStore.isFromStExtension() && workshopStore.stConnected" class="flex flex-col gap-1.5 p-3 rounded-xl bg-[#F0FDF4] border border-[#DCFCE7]">
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
      <div v-if="pack?.entries && pack.entries.length > 0" class="flex flex-col gap-2 p-3 rounded-xl bg-[#FFFBF0] border border-[#FDBA74]">
        <div class="flex items-center justify-between">
          <label class="text-[10px] font-bold text-[#78350F] uppercase tracking-wider">选择要插入的条目</label>
          <button 
            @click.stop="selectedEntryIds = selectedEntryIds.length === pack.entries.length ? [] : pack.entries.map(e => e.id)"
            class="text-[10px] font-bold px-2 py-0.5 rounded"
            style="background:#FFF7ED; color:#EA580C; border:1px solid #FDBA74;"
          >
            {{ selectedEntryIds.length === pack.entries.length ? '取消全选' : '全选' }}
          </button>
        </div>
        <div class="max-h-[200px] overflow-y-auto custom-scrollbar flex flex-col gap-1">
          <label 
            v-for="entry in pack.entries" 
            :key="entry.id"
            class="flex items-start gap-2 p-2 rounded-lg hover:bg-[#FFF7ED] transition-colors cursor-pointer"
            style="border:1px solid transparent;"
            :style="selectedEntryIds.includes(entry.id) ? 'background:#FFF7ED; border-color:#FDBA74;' : ''"
          >
            <input 
              type="checkbox"
              :value="entry.id"
              v-model="selectedEntryIds"
              class="mt-0.5 flex-shrink-0"
              style="accent-color:#F97316;"
            />
            <div class="flex-1 min-w-0">
              <div class="text-xs font-bold truncate" style="color:#431407;">{{ entry.name }}</div>
              <div v-if="entry.content" class="text-[10px] line-clamp-1 mt-0.5" style="color:#78716C;">{{ entry.content }}</div>
            </div>
          </label>
        </div>
        <p class="text-[10px] text-[#78350F] opacity-80">
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
      <div v-if="pack?.entries && pack.entries.length > 0" class="flex flex-col gap-2 p-3 rounded-xl bg-[#FFFBF0] border border-[#FDBA74]">
        <div class="flex items-center justify-between">
          <label class="text-[10px] font-bold text-[#78350F] uppercase tracking-wider">待导出条目</label>
          <button 
            @click.stop="exportEntryIds = exportEntryIds.length === pack.entries.length ? [] : pack.entries.map(e => e.id)"
            class="text-[10px] font-bold px-2 py-0.5 rounded"
            style="background:#FFF7ED; color:#EA580C; border:1px solid #FDBA74;"
          >
            {{ exportEntryIds.length === pack.entries.length ? '取消全选' : '全选' }}
          </button>
        </div>
        <div class="max-h-[300px] overflow-y-auto custom-scrollbar flex flex-col gap-1">
          <label 
            v-for="entry in pack.entries" 
            :key="entry.id"
            class="flex items-start gap-2 p-2 rounded-lg hover:bg-[#FFF7ED] transition-colors cursor-pointer"
            style="border:1px solid transparent;"
            :style="exportEntryIds.includes(entry.id) ? 'background:#FFF7ED; border-color:#FDBA74;' : ''"
          >
            <input 
              type="checkbox"
              :value="entry.id"
              v-model="exportEntryIds"
              class="mt-0.5 flex-shrink-0"
              style="accent-color:#F97316;"
            />
            <div class="flex-1 min-w-0">
              <div class="text-xs font-bold truncate" style="color:#431407;">{{ entry.name }}</div>
              <div v-if="entry.content" class="text-[10px] line-clamp-1 mt-0.5" style="color:#78716C;">{{ entry.content }}</div>
            </div>
          </label>
        </div>
        <p class="text-[10px] text-[#78350F] opacity-80">
          已选择 {{ exportEntryIds.length }} / {{ pack.entries.length }} 条
        </p>
      </div>
    </div>
  </ConfirmModal>
</template>
