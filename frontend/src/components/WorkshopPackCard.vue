<script setup>
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useWorkshopStore } from '@/stores/workshop'
import { useAuthStore } from '@/stores/auth'
import ConfirmModal from '@/components/ConfirmModal.vue'

const props = defineProps({
  pack: {
    type: Object,
    required: true,
  },
})

const router = useRouter()
const workshopStore = useWorkshopStore()
const authStore = useAuthStore()

const isOwner = computed(() => authStore.user && authStore.user.id === props.pack.author.id)

const entryCountLabel = computed(() => {
  const p = props.pack
  const parts = []
  if (p.count_worldbook > 0) parts.push(`${p.count_worldbook} 世界书`)
  if (p.count_regex > 0) parts.push(`${p.count_regex} 正则`)
  if (p.count_greeting > 0) parts.push(`${p.count_greeting} 开场白`)
  if (parts.length === 0) return `${p.entry_count || 0} 条条目`
  return parts.join(' · ')
})

const isSubscribedLocally = computed(() => {
  if (workshopStore.isFromStExtension() && workshopStore.stConnected) {
    return !!workshopStore.subscribedPacksInST[props.pack.id]
  }
  if (workshopStore.isSillyTavernEnv()) {
    return !!workshopStore.subscribedPacksInST[props.pack.id]
  }
  return !!props.pack.is_subscribed
})

// 订阅确认弹窗状态
const showSubConfirm = ref(false)
const targetWorldbookName = ref('')
// 条目选择（所有条目 ID 的列表，默认全部选中）
const selectedEntryIds = ref([])
// 弹窗中显示的条目列表
const modalEntries = ref([])
// 用户确认已进入正确角色卡
const isCharacterConfirmed = ref(false)

// 计算是否有包含风险类型的条目（正则/开场白）被选中
const hasRiskyContent = computed(() => {
  const selectedEntries = modalEntries.value.filter(e => selectedEntryIds.value.includes(e.id))
  return selectedEntries.some(e => e.entry_type === 'regex' || e.entry_type === 'greeting')
})

async function handleLike(e) {
  e.stopPropagation()
  if (!authStore.isLoggedIn) {
    authStore.loginWithDiscord()
    return
  }
  await workshopStore.toggleLike(props.pack.id)
}

async function handleSubscribe(e) {
  e.stopPropagation()
  if (!authStore.isLoggedIn) {
    authStore.loginWithDiscord()
    return
  }
  const currentlySubscribed = isSubscribedLocally.value

  // 取消订阅：无需确认，直接执行
  if (currentlySubscribed) {
    await workshopStore.toggleSubscribe(props.pack, null, 'unsubscribe')
    return
  }
  // 订阅：弹出确认框，初始化目标世界书名称
  // 如果是 ST 扩展模式，先获取世界书列表
  if (workshopStore.isFromStExtension() && workshopStore.stConnected) {
    await workshopStore.fetchWorldbookList()
  }
  targetWorldbookName.value = workshopStore.worldbookName
  
  // 获取完整的 pack 数据（含条目列表），如果当前 pack 数据中没有 entries
  let packData = props.pack
  if (!packData.entries || packData.entries.length === 0) {
    const fullPack = await workshopStore.fetchPack(props.pack.id)
    if (fullPack) packData = fullPack
  }
  
  // 初始化弹窗条目列表
  modalEntries.value = packData.entries || []
  
  // 初始化条目选择列表（默认全选）
  selectedEntryIds.value = modalEntries.value.map(e => e.id)
  
  // 重置确认状态
  isCharacterConfirmed.value = false
  
  showSubConfirm.value = true
}

async function confirmSubscribe() {
  // 如果有风险内容且未确认，则拦截（双重保险，UI 上应已禁用按钮）
  if (hasRiskyContent.value && !isCharacterConfirmed.value) return

  showSubConfirm.value = false
  // 如果用户修改了世界书名称，更新 store 中的状态
  if (targetWorldbookName.value.trim()) {
    const slug = props.pack.workshop?.slug || props.pack.section || 'default'
    workshopStore.setWorldbookName(slug, targetWorldbookName.value.trim())
  }
  // 传入选中的条目 ID 列表，并强制操作方向
  await workshopStore.toggleSubscribe(props.pack, selectedEntryIds.value, 'subscribe')
}

function cancelSubscribe() {
  showSubConfirm.value = false
}

function goToDetail() {
  router.push({ name: 'workshop-pack-detail', params: { packId: props.pack.id } })
}
</script>

<template>
  <div
    class="card flex flex-col gap-3 p-5 cursor-pointer"
    @click="goToDetail"
  >
    <!-- 作者 -->
    <div class="flex items-center gap-2">
      <img
        :src="pack.author.avatar"
        :alt="pack.author.username"
        class="w-7 h-7 rounded-full object-cover flex-shrink-0"
        style="border: 2px solid #FDBA74;"
      />
      <span class="text-xs font-semibold truncate" style="color: #A8A29E; font-family: 'Nunito', sans-serif;">
        {{ pack.author.display_name || pack.author.username }}
      </span>
      <span v-if="isOwner" class="ml-auto text-xs font-bold px-2 py-0.5 rounded-full" style="background: #FFF7ED; color: #EA580C; border: 1.5px solid #FDBA74;">
        我的
      </span>
    </div>

    <!-- 标题 -->
    <h3
      class="font-bold text-base leading-snug line-clamp-2"
      style="font-family: 'Fredoka', sans-serif; color: #431407;"
    >
      {{ pack.title }}
    </h3>

    <!-- 描述 -->
    <p
      v-if="pack.description"
      class="text-sm line-clamp-2 flex-1"
      style="color: #78716C; font-family: 'Nunito', sans-serif;"
    >
      {{ pack.description }}
    </p>
    <div v-else class="flex-1"></div>

    <!-- Tags -->
    <div v-if="pack.tags && pack.tags.length" class="flex flex-wrap gap-1.5">
      <span
        v-for="tag in pack.tags"
        :key="tag"
        class="tag-badge"
      >
        {{ tag }}
      </span>
    </div>

    <!-- 底部元数据 -->
    <div class="flex items-center justify-between mt-1 flex-wrap gap-2">
      <!-- 条目数 -->
      <span class="text-xs" style="color: #A8A29E; font-family: 'Nunito', sans-serif;">
        {{ entryCountLabel }}
      </span>

      <!-- 点赞 + 订阅按钮 -->
      <div class="flex items-center gap-2">
        <!-- 点赞 -->
        <button
          class="btn-action-like flex items-center gap-1 px-2.5 py-1 rounded-full transition-all duration-150 text-xs font-bold"
          :style="pack.is_liked
            ? 'background:#FFF7ED; color:#EA580C; border:2px solid #F97316; box-shadow:2px 2px 0 #F97316;'
            : 'background:#FFFBF0; color:#A8A29E; border:2px solid #E7E5E4; box-shadow:2px 2px 0 #E7E5E4;'"
          @click="handleLike"
          :title="pack.is_liked ? '取消点赞' : '点赞'"
        >
          <svg class="like-icon w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
          </svg>
          {{ pack.like_count }}
        </button>

        <!-- 订阅 -->
        <button
          class="btn-action-sub flex items-center gap-1 px-2.5 py-1 rounded-full transition-all duration-150 text-xs font-bold"
          :style="isSubscribedLocally
            ? 'background:#F0FDF4; color:#16A34A; border:2px solid #22C55E; box-shadow:2px 2px 0 #22C55E;'
            : 'background:#FFFBF0; color:#A8A29E; border:2px solid #E7E5E4; box-shadow:2px 2px 0 #E7E5E4;'"
          @click="handleSubscribe"
          :title="isSubscribedLocally ? '取消订阅' : '订阅'"
        >
          <svg class="sub-icon w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 22c1.1 0 2-.9 2-2H10c0 1.1.9 2 2 2z"/>
            <path d="M18 16V11a6 6 0 0 0-5-5.91V4a1 1 0 0 0-2 0v1.09A6 6 0 0 0 6 11v5l-2 2v1h16v-1l-2-2z"/>
          </svg>
          {{ pack.sub_count }}
        </button>
      </div>
    </div>
  </div>

  <!-- 订阅确认弹窗 -->
  <ConfirmModal
    v-if="showSubConfirm"
    title="订阅模组"
    confirm-text="确认订阅"
    cancel-text="取消"
    :confirm-disabled="hasRiskyContent && !isCharacterConfirmed"
    @confirm="confirmSubscribe"
    @cancel="cancelSubscribe"
  >
    <div class="flex flex-col gap-4">
      <p v-html="`确定要订阅「<strong>${pack.title}</strong>」吗？`"></p>

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
          @click.stop
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
      <div v-if="modalEntries && modalEntries.length > 0" class="flex flex-col gap-2 p-3 rounded-xl bg-[#FFFBF0] border border-[#FDBA74]">
        <div class="flex items-center justify-between">
          <label class="text-[10px] font-bold text-[#78350F] uppercase tracking-wider">选择要插入的条目</label>
          <button 
            @click.stop="selectedEntryIds = selectedEntryIds.length === modalEntries.length ? [] : modalEntries.map(e => e.id)"
            class="text-[10px] font-bold px-2 py-0.5 rounded"
            style="background:#FFF7ED; color:#EA580C; border:1px solid #FDBA74;"
          >
            {{ selectedEntryIds.length === modalEntries.length ? '取消全选' : '全选' }}
          </button>
        </div>
        <div class="max-h-[200px] overflow-y-auto custom-scrollbar flex flex-col gap-1">
          <label 
            v-for="entry in modalEntries" 
            :key="entry.id"
            class="flex items-start gap-2 p-2 rounded-lg hover:bg-[#FFF7ED] transition-colors cursor-pointer"
            style="border:1px solid transparent;"
            :style="selectedEntryIds.includes(entry.id) ? 'background:#FFF7ED; border-color:#FDBA74;' : ''"
            @click.stop
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
              <div v-if="entry.content" class="text-[10px] whitespace-pre-line mt-0.5" style="color:#78716C; white-space:pre-line;">{{ entry.content }}</div>
            </div>
          </label>
        </div>
        <p class="text-[10px] text-[#78350F] opacity-80">
          已选择 {{ selectedEntryIds.length }} / {{ modalEntries.length }} 条
        </p>
      </div>
    </div>
  </ConfirmModal>
</template>
