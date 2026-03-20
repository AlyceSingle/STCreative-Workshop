<script setup>
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import adminApi from '@/api/admin'
import CustomSelect from '../components/CustomSelect.vue'

const router = useRouter()


// ── 管理员登录状态 ────────────────────────────────────────────────────
const adminLoggedIn = ref(false)
const loginForm = ref({ username: '', password: '' })
const loginError = ref('')
const loginLoading = ref(false)

async function checkLogin() {
  try {
    await adminApi.checkLogin(); //axios会自动处理错误的http码
    adminLoggedIn.value = true;
    localStorage.setItem('isAdmin', 'true')
  } catch {
    adminLoggedIn.value = false
    localStorage.removeItem('isAdmin')
  }
}

async function doLogin() {
  loginError.value = ''
  loginLoading.value = true
  try {
    await adminApi.login(loginForm.value.username, loginForm.value.password)
    adminLoggedIn.value = true
    localStorage.setItem('isAdmin', 'true')
    activeTab.value = 'applications'
    await loadApplications()
  } catch {
    loginError.value = '网络错误，请稍后再试'
  } finally {
    loginLoading.value = false
  }
}

async function doLogout() {
  await adminApi.logout()
  adminLoggedIn.value = false
  localStorage.removeItem('isAdmin')
}

// ── Tab 切换 ──────────────────────────────────────────────────────────
const activeTab = ref('applications')
const sidebarOpen = ref(window.innerWidth >= 1024)

function switchTab(tab) {
  activeTab.value = tab
  if (window.innerWidth < 1024) sidebarOpen.value = false // 手机端点击后自动收起
  if (tab === 'applications') loadApplications()
  else if (tab === 'users') loadUsers()
  else if (tab === 'packs') loadPacks()
  else if (tab === 'workshops') loadWorkshopApps() //TODO：函数未定义？
  else if (tab === 'workshop-manage') loadAllWorkshops()
}

// ── 申请管理 ──────────────────────────────────────────────────────────
const applications = ref([])
const appFilter = ref('pending')
const appLoading = ref(false)
const reviewModal = ref(null)  // { app, action }
const reviewNote = ref('')
const reviewLoading = ref(false)

async function loadApplications() {
  appLoading.value = true
  try {
    const data = await adminApi.fetchApplications(appFilter.value)
    applications.value = data.data || []
  } catch {
    applications.value = []
  } finally {
    appLoading.value = false
  }
}

function openReview(app, action) {
  reviewModal.value = { app, action }
  reviewNote.value = ''
}

async function submitReview() {
  if (!reviewModal.value) return
  reviewLoading.value = true
  try {
    await adminApi.reviewApplication(reviewModal.value.app.id, reviewModal.value.action, reviewNote.value)
    reviewModal.value = null
    await loadApplications()
  } finally {
    reviewLoading.value = false
  }
}

// ── 用户管理 ──────────────────────────────────────────────────────────
const users = ref([])
const userPage = ref(1)
const userPagination = ref({})
const userQuery = ref('')
const userRoleFilter = ref('')
const userBanFilter = ref('')
const usersLoading = ref(false)

async function loadUsers(page = 1) {
  usersLoading.value = true
  userPage.value = page
  try {
    const params = new URLSearchParams({ page, limit: 20 })
    if (userQuery.value) params.append('q', userQuery.value)
    if (userRoleFilter.value) params.append('role', userRoleFilter.value)
    if (userBanFilter.value) params.append('is_banned', userBanFilter.value)

    const data = await adminApi.fetchUsers(page, userQuery.value)
    users.value = data.data || []
    userPagination.value = data.pagination || {}
  } catch {
    users.value = []
  } finally {
    usersLoading.value = false
  }
}

async function changeRole(userId, role) {
  if (!confirm(`确认将此用户角色改为「${roleLabel(role)}」？`)) return
  await adminApi.changeUserRole(userId, role)
  await loadUsers(userPage.value)
}

async function deleteUser(userId, username) {
  if (!confirm(`确认删除用户「${username}」？此操作不可恢复，其所有模组也将被删除。`)) return
  await adminApi.deleteUser(userId)
  await loadUsers(userPage.value)
}

async function changeBanStatus(userId, isBanned, username) {
  const action = isBanned ? '封禁' : '解封'
  if (!confirm(`确认${action}用户「${username}」？`)) return
  await adminApi.changeBanStatus(userId, isBanned)
  await loadUsers(userPage.value)
}

// ── 模组管理 ──────────────────────────────────────────────────────────
const packs = ref([])
const packPage = ref(1)
const packPagination = ref({})
const packQuery = ref('')
const packWorkshopFilter = ref('')
const packSortFilter = ref('latest')
const packsLoading = ref(false)

async function loadPacks(page = 1) {
  packsLoading.value = true
  packPage.value = page
  try {
    const params = new URLSearchParams({ page, limit: 20 })
    if (packQuery.value) params.append('q', packQuery.value)
    if (packWorkshopFilter.value) params.append('workshop_id', packWorkshopFilter.value)
    if (packSortFilter.value) params.append('sort', packSortFilter.value)

    const data = await adminApi.fetchPacks(page, packQuery.value)
    packs.value = data.data || []
    packPagination.value = data.pagination || {}
  } catch {
    packs.value = []
  } finally {
    packsLoading.value = false
  }
}

async function deletePack(packId, title) {
  if (!confirm(`确认删除模组「${title}」？`)) return
  await adminApi.deletePack(packId)
  await loadPacks(packPage.value)
}

// 工坊申请相关
const workshopApps = ref([])
const workshopAppFilter = ref('pending')
const workshopAppsLoading = ref(false)

// 工坊管理相关（合并后只保留一次定义）
const allWorkshops = ref([])
const workshopStatusFilter = ref('')
const workshopTypeFilter = ref('')
const allWorkshopsLoading = ref(false)
const workshopQuery = ref('')
const availableWorkshops = ref([])  // 用于模组筛选的工坊列表

// 加载可用工坊（修复变量顺序错误）
async function loadAvailableWorkshops() {
  try {
    const data = await adminApi.fetchWorkshopApplications(workshopAppFilter.value)
    workshopApps.value = data.data || []
    availableWorkshops.value = data.data || []
  } catch {
    availableWorkshops.value = []
  }
}

async function loadAllWorkshops() {
  allWorkshopsLoading.value = true
  try {
    const params = new URLSearchParams({ status: 'all' })
    if (workshopStatusFilter.value) params.set('status', workshopStatusFilter.value)
    if (workshopTypeFilter.value) params.append('type', workshopTypeFilter.value)
    if (workshopQuery.value.trim()) params.append('search', workshopQuery.value.trim())

    const data = await adminApi.fetchAllWorkshops(params)
    allWorkshops.value = data.data || []
  } catch {
    allWorkshops.value = []
  } finally {
    allWorkshopsLoading.value = false
  }
}

async function deleteWorkshop(id, name) {
  if (!confirm(`确认删除工坊「${name}」？其下所有模组将失去所属工坊关联。`)) return
  await adminApi.deleteWorkshop(id)
  await loadAllWorkshops()
}

const userDetail = ref(null)
const userDetailLoading = ref(false)

async function loadUserDetail(userId) {
  userDetailLoading.value = true
  userDetail.value = { loading: true }  // 先打开弹窗显示加载态
  try {
    const data = await adminApi.fetchUserDetail(userId)
    if (data) {
      userDetail.value = data.data
    } else {
      userDetail.value = null
    }
  } catch {
    userDetail.value = null
  } finally {
    userDetailLoading.value = false
  }
}

// ── 辅助 ──────────────────────────────────────────────────────────────
const STATUS_MAP = { pending: '待审核', approved: '已通过', rejected: '已拒绝' }
const STATUS_COLOR = {
  pending:  'background:#FEF9C3; color:#854D0E; border-color:#EAB308;',
  approved: 'background:#DCFCE7; color:#14532D; border-color:#22C55E;',
  rejected: 'background:#FEE2E2; color:#991B1B; border-color:#FCA5A5;',
}
function roleLabel(r) {
  return { user: '普通用户', creator: '创作者', admin: '管理员' }[r] || r
}
function roleStyle(r) {
  if (r === 'admin')   return 'background:#FEE2E2; color:#991B1B; border-color:#FCA5A5;'
  if (r === 'creator') return 'background:#DCFCE7; color:#14532D; border-color:#22C55E;'
  return 'background:#F1F5F9; color:#475569; border-color:#CBD5E1;'
}
function avatarUrl(discordId, avatar) {
  if (avatar) return `https://cdn.discordapp.com/avatars/${discordId}/${avatar}.png`
  return `https://cdn.discordapp.com/embed/avatars/${parseInt(discordId) % 5}.png`
}
function fmtDate(d) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' })
}

onMounted(async () => {
  await checkLogin()
  if (adminLoggedIn.value) {
    await loadApplications()
    await loadAvailableWorkshops()  // 加载工坊列表供筛选使用
  }
})
</script>

<template>
  <div class="min-h-screen" style="background:#FFFBF0;">

    <!-- ═══ 未登录：显示登录表单 ═══════════════════════════════════════ -->
    <div v-if="!adminLoggedIn" class="max-w-sm mx-auto mt-16">
      <div class="card p-8 flex flex-col gap-5">
        <div class="text-center">
          <div class="w-14 h-14 rounded-full mx-auto mb-3 flex items-center justify-center" style="background:#FFF7ED; border:2px solid #FDBA74;">
            <svg class="w-7 h-7" viewBox="0 0 24 24" fill="none" stroke="#F97316" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
              <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
            </svg>
          </div>
          <h1 class="text-xl font-bold" style="font-family:'Fredoka',sans-serif; color:#9A3412;">管理后台登录</h1>
        </div>
        <div class="flex flex-col gap-3">
          <input v-model="loginForm.username" class="input text-sm" placeholder="用户名" @keyup.enter="doLogin" />
          <input v-model="loginForm.password" class="input text-sm" type="password" placeholder="密码" @keyup.enter="doLogin" />
        </div>
        <div v-if="loginError" class="text-sm rounded-xl px-3 py-2 font-semibold" style="background:#FEF2F2; color:#EF4444; border:1.5px solid #FECACA;">{{ loginError }}</div>
        <button class="btn-primary" :disabled="loginLoading" @click="doLogin">
          {{ loginLoading ? '登录中…' : '登录' }}
        </button>
      </div>
    </div>

    <!-- ═══ 已登录：管理后台 ════════════════════════════════════════════ -->
    <div v-else class="flex min-h-screen overflow-hidden" style="background:#FFFBF0;">

      <!-- 移动端遮罩 -->
      <div v-if="sidebarOpen" class="fixed inset-0 z-30 lg:hidden" style="background:rgba(0,0,0,0.35);" @click="sidebarOpen = false"></div>

      <!-- 左侧固定导航栏 -->
      <aside class="fixed lg:static inset-y-0 left-0 z-40 w-60 flex-shrink-0 flex flex-col transition-all duration-300 ease-in-out"
             :class="sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:-ml-60'"
             style="background:#FFF7ED; border-right:2.5px solid #FDBA74;">
        <!-- 顶部标题 -->
        <div class="p-6 flex items-center justify-between" style="border-bottom:1.5px solid #FED7AA;">
          <div class="flex items-center gap-3">
            <div class="w-10 h-10 rounded-full flex items-center justify-center" style="background:#FFF7ED; border:2px solid #FDBA74;">
              <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="#F97316" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
              </svg>
            </div>
            <h1 class="text-lg font-bold" style="font-family:'Fredoka',sans-serif; color:#9A3412;">管理后台</h1>
          </div>
          <button class="lg:hidden p-1.5 rounded-xl transition-colors text-orange-600 hover:bg-orange-100" @click="sidebarOpen=false">
            <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        <!-- 导航菜单 -->
        <nav class="flex-1 p-4 flex flex-col gap-2">
          <button
            class="nav-btn"
            :class="{ 'is-active': activeTab === 'applications' }"
            @click="switchTab('applications')"
          >
            <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
              <polyline points="14 2 14 8 20 8"></polyline>
              <line x1="16" y1="13" x2="8" y2="13"></line>
              <line x1="16" y1="17" x2="8" y2="17"></line>
              <polyline points="10 9 9 9 8 9"></polyline>
            </svg>
            <span>申请管理</span>
          </button>

          <button
            class="nav-btn"
            :class="{ 'is-active': activeTab === 'workshops' }"
            @click="switchTab('workshops')"
          >
            <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
              <polyline points="9 22 9 12 15 12 15 22"></polyline>
            </svg>
            <span>工坊申请</span>
          </button>

          <button
            class="nav-btn"
            :class="{ 'is-active': activeTab === 'workshop-manage' }"
            @click="switchTab('workshop-manage')"
          >
            <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect x="2" y="7" width="20" height="14" rx="2" ry="2"></rect>
              <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"></path>
            </svg>
            <span>工坊管理</span>
          </button>

          <button
            class="nav-btn"
            :class="{ 'is-active': activeTab === 'users' }"
            @click="switchTab('users')"
          >
            <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
              <circle cx="12" cy="7" r="4"></circle>
            </svg>
            <span>用户管理</span>
          </button>

          <button
            class="nav-btn"
            :class="{ 'is-active': activeTab === 'packs' }"
            @click="switchTab('packs')"
          >
            <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <line x1="16.5" y1="9.4" x2="7.5" y2="4.21"></line>
              <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path>
              <polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline>
              <line x1="12" y1="22.08" x2="12" y2="12"></line>
            </svg>
            <span>模组管理</span>
          </button>
        </nav>

        <!-- 底部退出按钮 -->
        <div class="p-4" style="border-top:1.5px solid #FED7AA;">
          <button class="w-full px-4 py-2.5 rounded-xl font-bold text-sm transition-all flex items-center justify-center gap-2"
            style="background:#FEE2E2; color:#991B1B; border:1.5px solid #FCA5A5;"
            @click="doLogout">
            <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
              <polyline points="16 17 21 12 16 7"></polyline>
              <line x1="21" y1="12" x2="9" y2="12"></line>
            </svg>
            <span>退出登录</span>
          </button>
        </div>
      </aside>

      <!-- 右侧主内容区 -->
      <div class="flex-1 flex flex-col min-w-0 h-screen overflow-y-auto">
        <!-- 顶部控制栏 (包含折叠按钮) -->
        <div class="sticky top-0 z-20 px-4 py-3 lg:px-8 lg:py-6 flex items-center gap-4" style="background:rgba(255,251,240,0.9); backdrop-filter:blur(8px);">
          <button @click="sidebarOpen = !sidebarOpen" class="flex items-center justify-center w-10 h-10 flex-shrink-0 rounded-xl transition-colors cursor-pointer" style="background:#FFF7ED; border:2.5px solid #FDBA74; color:#F97316; box-shadow:2px 2px 0 #FDBA74;">
            <svg v-if="!sidebarOpen" class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/>
            </svg>
            <svg v-else class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
          <h2 class="text-xl font-bold lg:hidden" style="font-family:'Fredoka',sans-serif; color:#9A3412;">管理后台</h2>
        </div>

        <main class="flex-1 px-4 pb-4 lg:px-8 lg:pb-8 max-w-7xl w-full mx-auto">

      <!-- ─── 申请管理 ──────────────────────────────────────────────── -->
      <div v-if="activeTab==='applications'">
        <div class="flex gap-2 mb-4 flex-wrap">
          <button v-for="f in [{k:'pending',l:'待审核'},{k:'approved',l:'已通过'},{k:'rejected',l:'已拒绝'},{k:'all',l:'全部'}]" :key="f.k"
            class="px-4 py-1.5 rounded-full text-xs font-bold transition-all"
            :style="appFilter===f.k ? 'background:#431407; color:white;' : 'background:#FFF7ED; color:#78350F; border:1.5px solid #FDBA74;'"
            @click="appFilter=f.k; loadApplications()">
            {{ f.l }}
          </button>
        </div>
        <div v-if="appLoading" class="flex justify-center py-12">
          <div class="w-8 h-8 rounded-full animate-spin" style="border:3px solid #FED7AA; border-top-color:#F97316;"></div>
        </div>
        <div v-else-if="!applications.length" class="text-center py-12 text-sm" style="color:#A8A29E; font-family:'Nunito',sans-serif;">暂无记录</div>
        <div v-else class="flex flex-col gap-3">
          <div v-for="app in applications" :key="app.id" class="card p-4 flex flex-col sm:flex-row sm:items-start gap-4">
            <img :src="app.user.avatar ? avatarUrl(app.user.discord_id, app.user.avatar) : avatarUrl(app.user.discord_id, null)"
              class="w-10 h-10 rounded-full object-cover flex-shrink-0" style="border:2px solid #FDBA74;" />
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2 flex-wrap mb-1">
                <span class="font-bold text-sm" style="font-family:'Fredoka',sans-serif; color:#431407;">{{ app.user.username }}</span>
                <span class="text-xs px-2 py-0.5 rounded-full border font-bold" :style="STATUS_COLOR[app.status]">{{ STATUS_MAP[app.status] }}</span>
              </div>
              <p class="text-xs mb-2" style="color:#A8A29E; font-family:'Nunito',sans-serif;">申请于 {{ fmtDate(app.applied_at) }}</p>
              <p class="text-sm rounded-xl px-3 py-2" style="background:#FFFBF0; border:1.5px solid #FED7AA; color:#78350F; font-family:'Nunito',sans-serif; white-space:pre-wrap; word-break:break-word;">{{ app.reason }}</p>
              <div v-if="app.platform || app.published_works" class="flex flex-col gap-1 mt-1.5">
                <p v-if="app.platform" class="text-xs" style="color:#78716C; font-family:'Nunito',sans-serif;">
                  <span class="font-bold" style="color:#431407;">发布平台：</span>{{ app.platform }}
                </p>
                <p v-if="app.published_works" class="text-xs" style="color:#78716C; font-family:'Nunito',sans-serif; white-space:pre-wrap; word-break:break-word;">
                  <span class="font-bold" style="color:#431407;">已发布作品：</span>{{ app.published_works }}
                </p>
              </div>
              <p v-if="app.admin_note" class="text-xs mt-1.5" style="color:#EF4444; font-family:'Nunito',sans-serif;">备注：{{ app.admin_note }}</p>
            </div>
            <div v-if="app.status==='pending'" class="flex gap-2 flex-shrink-0">
              <button class="btn-primary text-xs px-3 py-1.5" @click="openReview(app,'approve')">通过</button>
              <button class="btn-danger text-xs px-3 py-1.5" @click="openReview(app,'reject')">拒绝</button>
            </div>
          </div>
        </div>
      </div>

      <!-- ─── 工坊管理 ──────────────────────────────────────────────── -->
      <div v-if="activeTab==='workshop-manage'">
        <!-- 筛选栏 -->
        <div class="flex gap-3 mb-4 flex-wrap items-center">
          <CustomSelect
            v-model="workshopStatusFilter"
            :options="[
              { value: '', label: '全部状态' },
              { value: 'active', label: '已上线' },
              { value: 'pending', label: '待审核' },
              { value: 'rejected', label: '已拒绝' }
            ]"
            @update:modelValue="loadAllWorkshops"
          />

          <CustomSelect
            v-model="workshopTypeFilter"
            :options="[
              { value: '', label: '全部类型' },
              { value: 'builtin', label: '内置工坊' },
              { value: 'user', label: '用户创建' }
            ]"
            @update:modelValue="loadAllWorkshops"
          />

          <input v-model="workshopQuery" class="input text-sm flex-1" style="min-width: 200px;" placeholder="搜索工坊名称或slug…" @keyup.enter="loadAllWorkshops" />
          <button class="btn-secondary text-sm" @click="loadAllWorkshops">搜索</button>
        </div>
        <div v-if="allWorkshopsLoading" class="flex justify-center py-12">
          <div class="w-8 h-8 rounded-full animate-spin" style="border:3px solid #FED7AA; border-top-color:#F97316;"></div>
        </div>
        <div v-else-if="!allWorkshops.length" class="text-center py-12 text-sm" style="color:#A8A29E; font-family:'Nunito',sans-serif;">暂无工坊</div>
        <div v-else class="flex flex-col gap-3">
          <div v-for="w in allWorkshops" :key="w.id" class="card p-4 flex flex-col sm:flex-row sm:items-start gap-4">
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2 flex-wrap mb-1">
                <span class="font-bold text-base" style="font-family:'Fredoka',sans-serif; color:#431407;">{{ w.name }}</span>
                <span class="text-xs px-2 py-0.5 rounded-full border font-bold"
                  :style="w.status==='active' ? 'background:#DCFCE7;color:#14532D;border-color:#22C55E;'
                        : w.status==='rejected' ? 'background:#FEE2E2;color:#991B1B;border-color:#FCA5A5;'
                        : 'background:#FEF9C3;color:#854D0E;border-color:#FDE047;'">
                  {{ w.status==='active' ? '已上线' : w.status==='rejected' ? '已拒绝' : '待审核' }}
                </span>
              </div>
              <p class="text-xs mb-1" style="color:#A8A29E; font-family:'Nunito',sans-serif;">
                slug: {{ w.slug }} · 申请人：{{ w.author ? w.author.username : '内置' }} · {{ fmtDate(w.created_at) }}
              </p>
              <p v-if="w.description" class="text-sm rounded-xl px-3 py-2 mt-1 whitespace-pre-line" style="background:#FFFBF0; border:1.5px solid #FED7AA; color:#78350F; font-family:'Nunito',sans-serif; word-break:break-word; white-space:pre-line;">{{ w.description }}</p>
            </div>
            <div class="flex flex-col gap-2 flex-shrink-0 sm:w-24">
              <button v-if="w.author_id !== null" class="btn-secondary text-xs px-3 py-1.5 w-full text-center" @click="router.push({ name: 'workshop-edit', params: { id: w.id } })">编辑</button>
              <button v-if="w.author_id !== null" class="btn-danger text-xs px-3 py-1.5 w-full text-center" @click="deleteWorkshop(w.id, w.name)">删除</button>
            </div>
          </div>
        </div>
      </div>

      <!-- ─── 用户管理 ──────────────────────────────────────────────── -->
      <div v-if="activeTab==='users'">
        <!-- 筛选栏 -->
        <div class="flex gap-3 mb-4 flex-wrap items-center">
          <CustomSelect
            v-model="userRoleFilter"
            :options="[
              { value: '', label: '全部角色' },
              { value: 'user', label: '普通用户' },
              { value: 'creator', label: '创作者' },
              { value: 'admin', label: '管理员' }
            ]"
            placeholder="全部角色"
            @update:modelValue="loadUsers(1)"
          />

          <CustomSelect
            v-model="userBanFilter"
            :options="[
              { value: '', label: '全部状态' },
              { value: '0', label: '正常' },
              { value: '1', label: '已封禁' }
            ]"
            placeholder="全部状态"
            @update:modelValue="loadUsers(1)"
          />

          <input v-model="userQuery" class="input text-sm flex-1" style="min-width: 200px;" placeholder="搜索用户名…" @keyup.enter="loadUsers(1)" />
          <button class="btn-secondary text-sm" @click="loadUsers(1)">搜索</button>
        </div>
        <div v-if="usersLoading" class="flex justify-center py-12">
          <div class="w-8 h-8 rounded-full animate-spin" style="border:3px solid #FED7AA; border-top-color:#F97316;"></div>
        </div>
        <div v-else class="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div v-for="u in users" :key="u.id"
            class="card flex flex-col xl:flex-row p-4 items-start xl:items-center justify-between gap-4 cursor-pointer hover:brightness-95 transition-all"
            @click="loadUserDetail(u.id)"
          >
            <div class="flex items-center gap-3 w-full xl:w-auto overflow-hidden">
              <img :src="u.avatar ? avatarUrl(u.discord_id, u.avatar) : avatarUrl(u.discord_id, null)"
                class="w-11 h-11 rounded-full object-cover flex-shrink-0" style="border:2px solid #FDBA74;" />
              <div class="flex flex-col min-w-0">
                <p class="font-bold text-sm truncate" style="font-family:'Fredoka',sans-serif; color:#431407;">{{ u.username }}</p>
                <div class="flex items-center gap-1.5 mt-1">
                  <span class="text-xs px-1.5 py-0.5 rounded-full border font-bold flex-shrink-0" :style="roleStyle(u.role)">{{ roleLabel(u.role) }}</span>
                  <span v-if="u.is_banned" class="text-xs px-1.5 py-0.5 rounded-full border font-bold flex-shrink-0" style="background:#FEE2E2; color:#991B1B; border-color:#FCA5A5;">已封禁</span>
                </div>
              </div>
            </div>
            <div class="flex gap-1.5 flex-wrap flex-shrink-0 w-full xl:w-auto justify-end" @click.stop>
              <button v-if="!u.is_banned" class="text-xs px-2.5 py-1.5 rounded-xl font-bold cursor-pointer transition-all whitespace-nowrap" style="background:#FEF9C3; color:#854D0E; border:1.5px solid #FDE047;" @click="changeBanStatus(u.id, true, u.username)">封禁</button>
              <button v-else class="text-xs px-2.5 py-1.5 rounded-xl font-bold cursor-pointer transition-all whitespace-nowrap" style="background:#DCFCE7; color:#14532D; border:1.5px solid #22C55E;" @click="changeBanStatus(u.id, false, u.username)">解封</button>
              <button v-if="u.role!=='creator'" class="text-xs px-2.5 py-1.5 rounded-xl font-bold cursor-pointer transition-all whitespace-nowrap" style="background:#DCFCE7; color:#14532D; border:1.5px solid #22C55E;" @click="changeRole(u.id,'creator')">升为创作者</button>
              <button v-if="u.role!=='user'" class="text-xs px-2.5 py-1.5 rounded-xl font-bold cursor-pointer transition-all whitespace-nowrap" style="background:#F1F5F9; color:#475569; border:1.5px solid #CBD5E1;" @click="changeRole(u.id,'user')">降为普通</button>
              <button class="text-xs px-2.5 py-1.5 rounded-xl font-bold cursor-pointer transition-all whitespace-nowrap" style="background:#FEE2E2; color:#991B1B; border:1.5px solid #FCA5A5;" @click="deleteUser(u.id,u.username)">删除</button>
            </div>
          </div>
        </div>
        <div v-if="userPagination.totalPages>1" class="flex items-center justify-center gap-3 mt-6">
          <button class="btn-secondary text-sm" :disabled="userPage<=1" @click="loadUsers(userPage-1)">上一页</button>
          <span class="text-sm" style="color:#A8A29E; font-family:'Nunito',sans-serif;">{{ userPage }} / {{ userPagination.totalPages }}</span>
          <button class="btn-secondary text-sm" :disabled="userPage>=userPagination.totalPages" @click="loadUsers(userPage+1)">下一页</button>
        </div>
      </div>

      <!-- ─── 模组管理 ──────────────────────────────────────────────── -->
      <div v-if="activeTab==='packs'">
        <!-- 筛选栏 -->
        <div class="flex gap-3 mb-4 flex-wrap items-center">
          <CustomSelect
            v-model="packWorkshopFilter"
            :options="[
              { value: '', label: '全部工坊' },
              ...availableWorkshops.filter(w => w.status === 'active').map(w => ({ value: String(w.id), label: w.name }))
            ]"
            placeholder="全部工坊"
            @update:modelValue="loadPacks(1)"
          />

          <CustomSelect
            v-model="packSortFilter"
            :options="[
              { value: 'latest', label: '最新创建' },
              { value: 'hot', label: '最热门' },
              { value: 'entries', label: '最多条目' }
            ]"
            @update:modelValue="loadPacks(1)"
          />

          <input v-model="packQuery" class="input text-sm flex-1" style="min-width: 200px;" placeholder="搜索模组标题…" @keyup.enter="loadPacks(1)" />
          <button class="btn-secondary text-sm" @click="loadPacks(1)">搜索</button>
        </div>
        <div v-if="packsLoading" class="flex justify-center py-12">
          <div class="w-8 h-8 rounded-full animate-spin" style="border:3px solid #FED7AA; border-top-color:#F97316;"></div>
        </div>
        <div v-else class="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div v-for="p in packs" :key="p.id" class="card flex-row p-4 items-center gap-3">
            <div class="flex-1 min-w-0">
              <p class="font-bold text-sm truncate" style="font-family:'Fredoka',sans-serif; color:#431407;">{{ p.title }}</p>
              <p class="text-xs" style="color:#A8A29E; font-family:'Nunito',sans-serif;">
                {{ p.author.username }} · {{ p.entry_count }} 条目 · {{ p.like_count }} 赞 · {{ p.sub_count }} 订阅 · {{ fmtDate(p.created_at) }}
              </p>
            </div>
            <span class="text-xs px-2.5 py-1 rounded-full border font-bold flex-shrink-0"
              style="background:#FFF7ED;color:#78350F;border-color:#FDBA74;">
              {{ p.workshop_name || p.section || '未知工坊' }}
            </span>
            <div class="flex gap-2 flex-shrink-0">
              <button class="btn-secondary text-xs px-3 py-1.5" @click="router.push({ name: 'workshop-pack-edit', params: { packId: p.id } })">编辑</button>
              <button class="btn-danger text-xs px-3 py-1.5" @click="deletePack(p.id,p.title)">删除</button>
            </div>
          </div>
        </div>
        <div v-if="packPagination.totalPages>1" class="flex items-center justify-center gap-3 mt-6">
          <button class="btn-secondary text-sm" :disabled="packPage<=1" @click="loadPacks(packPage-1)">上一页</button>
          <span class="text-sm" style="color:#A8A29E; font-family:'Nunito',sans-serif;">{{ packPage }} / {{ packPagination.totalPages }}</span>
          <button class="btn-secondary text-sm" :disabled="packPage>=packPagination.totalPages" @click="loadPacks(packPage+1)">下一页</button>
        </div>
      </div>

      <!-- ─── 工坊申请 ──────────────────────────────────────────────── -->
      <div v-if="activeTab==='workshops'">
        <div class="flex gap-2 mb-4 flex-wrap">
          <button v-for="f in [{k:'pending',l:'待审核'},{k:'active',l:'已通过'},{k:'rejected',l:'已拒绝'},{k:'all',l:'全部'}]" :key="f.k"
            class="px-4 py-1.5 rounded-full text-xs font-bold transition-all"
            :style="workshopAppFilter===f.k ? 'background:#431407; color:white;' : 'background:#FFF7ED; color:#78350F; border:1.5px solid #FDBA74;'"
            @click="workshopAppFilter=f.k; loadWorkshopApps()">
            {{ f.l }}
          </button>
        </div>
        <div v-if="workshopAppsLoading" class="flex justify-center py-12">
          <div class="w-8 h-8 rounded-full animate-spin" style="border:3px solid #FED7AA; border-top-color:#F97316;"></div>
        </div>
        <div v-else-if="!workshopApps.length" class="text-center py-12 text-sm" style="color:#A8A29E; font-family:'Nunito',sans-serif;">暂无记录</div>
        <div v-else class="flex flex-col gap-3">
          <div v-for="w in workshopApps" :key="w.id" class="card p-4 flex flex-col sm:flex-row sm:items-start gap-4">
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2 flex-wrap mb-1">
                <span class="font-bold text-base" style="font-family:'Fredoka',sans-serif; color:#431407;">{{ w.name }}</span>
                <span class="text-xs px-2 py-0.5 rounded-full border font-bold"
                  :style="w.status==='active' ? 'background:#DCFCE7;color:#14532D;border-color:#22C55E;'
                        : w.status==='rejected' ? 'background:#FEE2E2;color:#991B1B;border-color:#FCA5A5;'
                        : 'background:#FEF9C3;color:#854D0E;border-color:#FDE047;'">
                  {{ w.status==='active' ? '已通过' : w.status==='rejected' ? '已拒绝' : '待审核' }}
                </span>
              </div>
              <p class="text-xs mb-1" style="color:#A8A29E; font-family:'Nunito',sans-serif;">
                申请人：{{ w.author ? w.author.username : '内置' }} · 申请于 {{ fmtDate(w.created_at) }}
              </p>
              <p v-if="w.description" class="text-sm rounded-xl px-3 py-2 mt-1" style="background:#FFFBF0; border:1.5px solid #FED7AA; color:#78350F; font-family:'Nunito',sans-serif; word-break:break-word;">{{ w.description }}</p>
              <p v-if="w.worldbook" class="text-xs mt-1" style="color:#78716C; font-family:'Nunito',sans-serif;">
                <span class="font-bold" style="color:#431407;">默认世界书：</span>{{ w.worldbook }}
              </p>
            </div>
            <div v-if="w.status==='pending'" class="flex gap-2 flex-shrink-0">
              <button class="btn-primary text-xs px-3 py-1.5" @click="approveWorkshop(w.id)">通过</button>
              <button class="btn-danger text-xs px-3 py-1.5" @click="rejectWorkshop(w.id)">拒绝</button>
            </div>
          </div>
        </div>
      </div>

        </main>
      </div>
    </div>

    <!-- ═══ 用户详情弹窗 ══════════════════════════════════════════════════ -->
    <Teleport to="body">
      <Transition enter-active-class="transition duration-200 ease-out" enter-from-class="opacity-0" enter-to-class="opacity-100"
        leave-active-class="transition duration-150 ease-in" leave-from-class="opacity-100" leave-to-class="opacity-0">
        <div v-if="userDetail" class="fixed inset-0 z-50 flex items-center justify-center p-4" style="background:rgba(0,0,0,0.35);" @click.self="userDetail=null">
          <div class="w-full max-w-lg flex flex-col gap-4 max-h-[85vh]" style="background:#FFFBF0; border:2.5px solid #FDBA74; border-radius:20px; box-shadow:6px 6px 0 #FDBA74; overflow:hidden;">

            <!-- 加载态 -->
            <div v-if="userDetail.loading" class="flex items-center justify-center py-16">
              <div class="w-8 h-8 rounded-full animate-spin" style="border:3px solid #FED7AA; border-top-color:#F97316;"></div>
            </div>

            <!-- 内容 -->
            <template v-else>
              <!-- 顶部：用户信息 -->
              <div class="flex items-center gap-4 px-6 pt-6 pb-4" style="border-bottom:1.5px solid #FED7AA;">
                <img :src="userDetail.user.avatar" class="w-12 h-12 rounded-full object-cover flex-shrink-0" style="border:2px solid #FDBA74;" />
                <div class="flex-1 min-w-0">
                  <p class="font-bold text-lg leading-tight truncate" style="font-family:'Fredoka',sans-serif; color:#431407;">{{ userDetail.user.username }}</p>
                  <div class="flex items-center gap-2 mt-1 flex-wrap">
                    <span class="text-xs px-2 py-0.5 rounded-full border font-bold" :style="roleStyle(userDetail.user.role)">{{ roleLabel(userDetail.user.role) }}</span>
                    <span class="text-xs" style="color:#A8A29E; font-family:'Nunito',sans-serif;">注册于 {{ fmtDate(userDetail.user.created_at) }}</span>
                  </div>
                </div>
                <button class="flex-shrink-0 p-1.5 rounded-full transition-colors" style="color:#A8A29E; border:1.5px solid #E7E5E4;" @click="userDetail=null">
                  <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                  </svg>
                </button>
              </div>

              <!-- 统计栏 -->
              <div class="flex gap-6 px-6 text-center">
                <div v-if="userDetail.user.role==='creator' || userDetail.user.role==='admin'">
                  <p class="text-2xl font-bold" style="font-family:'Fredoka',sans-serif; color:#F97316;">{{ userDetail.workshops.length }}</p>
                  <p class="text-xs" style="color:#A8A29E; font-family:'Nunito',sans-serif;">工坊数</p>
                </div>
                <div>
                  <p class="text-2xl font-bold" style="font-family:'Fredoka',sans-serif; color:#F97316;">{{ userDetail.packs.length }}</p>
                  <p class="text-xs" style="color:#A8A29E; font-family:'Nunito',sans-serif;">模组数</p>
                </div>
                <div>
                  <p class="text-2xl font-bold" style="font-family:'Fredoka',sans-serif; color:#F97316;">{{ userDetail.entry_count }}</p>
                  <p class="text-xs" style="color:#A8A29E; font-family:'Nunito',sans-serif;">条目总数</p>
                </div>
              </div>

              <!-- 内容区 -->
              <div class="px-6 pb-6 overflow-y-auto flex-1 flex flex-col gap-5">
                <!-- 工坊列表：仅创作者/管理员显示 -->
                <div v-if="userDetail.user.role==='creator' || userDetail.user.role==='admin'">
                  <p class="text-sm font-bold mb-3" style="font-family:'Fredoka',sans-serif; color:#78350F;">工坊列表</p>
                  <div v-if="!userDetail.workshops.length" class="text-sm text-center py-4" style="color:#A8A29E; font-family:'Nunito',sans-serif;">暂无工坊</div>
                  <div v-else class="flex flex-col gap-2">
                    <div v-for="w in userDetail.workshops" :key="w.id"
                      class="flex items-center gap-3 px-3 py-2.5 rounded-xl"
                      style="background:#FFF7ED; border:1.5px solid #FED7AA;"
                    >
                      <div class="flex-1 min-w-0">
                        <p class="font-bold text-sm truncate" style="font-family:'Fredoka',sans-serif; color:#431407;">{{ w.name }}</p>
                        <p class="text-xs mt-0.5" style="color:#A8A29E; font-family:'Nunito',sans-serif;">
                          {{ w.slug }} · {{ fmtDate(w.created_at) }}
                        </p>
                      </div>
                      <span class="text-xs px-2 py-0.5 rounded-full border font-bold flex-shrink-0"
                        :style="w.status==='active' ? 'background:#DCFCE7;color:#14532D;border-color:#22C55E;'
                              : w.status==='rejected' ? 'background:#FEE2E2;color:#991B1B;border-color:#FCA5A5;'
                              : 'background:#FEF9C3;color:#854D0E;border-color:#FDE047;'">
                        {{ w.status==='active' ? '已上线' : w.status==='rejected' ? '已拒绝' : '待审核' }}
                      </span>
                    </div>
                  </div>
                </div>

                <!-- 模组列表 -->
                <div>
                  <p class="text-sm font-bold mb-3" style="font-family:'Fredoka',sans-serif; color:#78350F;">模组列表</p>
                  <div v-if="!userDetail.packs.length" class="text-sm text-center py-4" style="color:#A8A29E; font-family:'Nunito',sans-serif;">暂无模组</div>
                  <div v-else class="flex flex-col gap-2">
                    <div v-for="pack in userDetail.packs" :key="pack.id"
                      class="flex items-center gap-3 px-3 py-2.5 rounded-xl"
                      style="background:#FFF7ED; border:1.5px solid #FED7AA;"
                    >
                      <div class="flex-1 min-w-0">
                        <p class="font-bold text-sm truncate" style="font-family:'Fredoka',sans-serif; color:#431407;">{{ pack.title }}</p>
                        <p class="text-xs mt-0.5" style="color:#A8A29E; font-family:'Nunito',sans-serif;">
                          {{ pack.entry_count }} 条目 · {{ pack.like_count }} 赞 · {{ pack.sub_count }} 订阅 · {{ fmtDate(pack.created_at) }}
                        </p>
                      </div>
                      <span class="text-xs px-2 py-0.5 rounded-full border font-bold flex-shrink-0"
                        style="background:#FFF7ED;color:#78350F;border-color:#FDBA74;">
                        {{ pack.workshop_name || pack.section || '未知工坊' }}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </template>
          </div>
        </div>
      </Transition>
    </Teleport>

    <!-- ═══ 审批弹窗 ═════════════════════════════════════════════════════ -->
    <Teleport to="body">
      <Transition enter-active-class="transition duration-200 ease-out" enter-from-class="opacity-0" enter-to-class="opacity-100"
        leave-active-class="transition duration-150 ease-in" leave-from-class="opacity-100" leave-to-class="opacity-0">
        <div v-if="reviewModal" class="fixed inset-0 z-50 flex items-center justify-center p-4" style="background:rgba(0,0,0,0.35);" @click.self="reviewModal=null">
          <div class="w-full max-w-sm p-6 flex flex-col gap-4" style="background:#FFFBF0; border:2.5px solid #FDBA74; border-radius:20px; box-shadow:6px 6px 0 #FDBA74;">
            <h3 class="font-bold text-lg" style="font-family:'Fredoka',sans-serif; color:#431407;">
              {{ reviewModal.action==='approve' ? '通过申请' : '拒绝申请' }}
            </h3>
            <p class="text-sm" style="color:#78716C; font-family:'Nunito',sans-serif;">
              用户：<strong>{{ reviewModal.app.user.username }}</strong>
            </p>
            <div>
              <label class="block text-sm font-bold mb-1.5" style="font-family:'Fredoka',sans-serif; color:#431407;">
                管理员备注（可选）
              </label>
              <textarea v-model="reviewNote" class="input resize-none text-sm" rows="3"
                :placeholder="reviewModal.action==='approve' ? '欢迎加入…（可不填）' : '请说明拒绝原因…'"
                style="font-family:'Nunito',sans-serif;"></textarea>
            </div>
            <div class="flex gap-3">
              <button v-if="reviewModal.action==='approve'" class="btn-primary flex-1" :disabled="reviewLoading" @click="submitReview">
                {{ reviewLoading ? '处理中…' : '确认通过' }}
              </button>
              <button v-else class="btn-danger flex-1" :disabled="reviewLoading" @click="submitReview">
                {{ reviewLoading ? '处理中…' : '确认拒绝' }}
              </button>
              <button class="btn-secondary flex-1" @click="reviewModal=null">取消</button>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>

  </div>
</template>

<style scoped>
/* 导航按钮样式 */
.nav-btn {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.625rem 1rem;
  border-radius: 0.75rem;
  font-family: 'Fredoka', sans-serif;
  font-size: 0.875rem;
  font-weight: 700;
  text-align: left;
  background: transparent;
  color: #78350F;
  border: none;
  transition: all 0.15s;
  cursor: pointer;
}

.nav-btn:hover {
  background: #FFF7ED;
  transform: translateX(2px);
}

.nav-btn.is-active {
  background: #F97316;
  color: white;
  box-shadow: 3px 3px 0 #C2410C;
  transform: translateX(2px);
}

.nav-icon {
  width: 1.25rem;
  height: 1.25rem;
  flex-shrink: 0;
}
</style>
