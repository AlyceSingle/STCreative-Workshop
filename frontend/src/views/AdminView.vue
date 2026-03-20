<script setup>
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import adminApi from '@/api/admin'

const router = useRouter()

const adminLoggedIn = ref(false)
const loginForm = ref({ username: '', password: '' })
const loginError = ref('')
const loginLoading = ref(false)

async function checkLogin() {
  try {
    await adminApi.checkLogin()
    adminLoggedIn.value = true
  } catch {
    adminLoggedIn.value = false
  }
}

async function doLogin() {
  loginError.value = ''
  loginLoading.value = true
  try {
    await adminApi.login(loginForm.value.username, loginForm.value.password)
    adminLoggedIn.value = true
    activeTab.value = 'applications'
    loadApplications()
  } catch (err) {
    loginError.value = err.message || err || '登录失败'
  } finally {
    loginLoading.value = false
  }
}

async function doLogout() {
  await adminApi.logout()
  adminLoggedIn.value = false
}

const activeTab = ref('applications')

function switchTab(tab) {
  activeTab.value = tab
  if (tab === 'applications') loadApplications()
  else if (tab === 'users') loadUsers()
  else if (tab === 'packs') loadPacks()
  else if (tab === 'workshops') loadWorkshopApps()
  else if (tab === 'workshop-manage') loadAllWorkshops()
}

const applications = ref([])
const appFilter = ref('pending')
const appLoading = ref(false)
const reviewModal = ref(null)
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

const users = ref([])
const userPage = ref(1)
const userPagination = ref({})
const userQuery = ref('')
const usersLoading = ref(false)

async function loadUsers(page = 1) {
  usersLoading.value = true
  userPage.value = page
  try {
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

const packs = ref([])
const packPage = ref(1)
const packPagination = ref({})
const packQuery = ref('')
const packsLoading = ref(false)

async function loadPacks(page = 1) {
  packsLoading.value = true
  packPage.value = page
  try {
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

const workshopApps = ref([])
const workshopAppFilter = ref('pending')
const workshopAppsLoading = ref(false)

async function loadWorkshopApps() {
  workshopAppsLoading.value = true
  try {
    const data = await adminApi.fetchWorkshopApplications(workshopAppFilter.value)
    workshopApps.value = data.data || []
  } catch {
    workshopApps.value = []
  } finally {
    workshopAppsLoading.value = false
  }
}

async function approveWorkshop(id) {
  if (!confirm('确认通过该工坊申请？')) return
  await adminApi.approveWorkshop(id)
  await loadWorkshopApps()
}

async function rejectWorkshop(id) {
  if (!confirm('确认拒绝该工坊申请？')) return
  await adminApi.rejectWorkshop(id)
  await loadWorkshopApps()
}

const allWorkshops = ref([])
const allWorkshopsLoading = ref(false)

async function loadAllWorkshops() {
  allWorkshopsLoading.value = true
  try {
    const data = await adminApi.fetchAllWorkshops()
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
  userDetail.value = { loading: true }
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
  if (adminLoggedIn.value) loadApplications()
})
</script>

<template>
  <div class="page-container py-8 max-w-5xl">

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

    <div v-else>
      <div class="flex items-center justify-between mb-6 flex-wrap gap-3">
        <h1 class="text-2xl font-bold" style="font-family:'Fredoka',sans-serif; color:#9A3412;">管理后台</h1>
        <button class="btn-secondary text-sm" @click="doLogout">退出登录</button>
      </div>

      <div class="flex gap-2 mb-6 flex-wrap">
        <button v-for="t in [{k:'applications',l:'申请管理'},{k:'workshops',l:'工坊申请'},{k:'workshop-manage',l:'工坊管理'},{k:'users',l:'用户管理'},{k:'packs',l:'模组管理'}]" :key="t.k"
          class="px-5 py-2 rounded-full font-bold text-sm transition-all duration-150"
          :style="activeTab===t.k ? 'background:#F97316; color:white; box-shadow:3px 3px 0 #C2410C; transform:rotate(-0.5deg);' : 'background:#FFF7ED; color:#78350F; border:2px solid #FDBA74;'"
          @click="switchTab(t.k)">
          {{ t.l }}
        </button>
      </div>

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

      <div v-if="activeTab==='workshop-manage'">
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
              <p v-if="w.description" class="text-sm rounded-xl px-3 py-2 mt-1" style="background:#FFFBF0; border:1.5px solid #FED7AA; color:#78350F; font-family:'Nunito',sans-serif; word-break:break-word;">{{ w.description }}</p>
            </div>
            <div class="flex flex-col gap-2 flex-shrink-0 sm:w-24">
              <button v-if="w.author_id !== null" class="btn-secondary text-xs px-3 py-1.5 w-full text-center" @click="router.push({ name: 'workshop-edit', params: { id: w.id } })">编辑</button>
              <button v-if="w.author_id !== null" class="btn-danger text-xs px-3 py-1.5 w-full text-center" @click="deleteWorkshop(w.id, w.name)">删除</button>
            </div>
          </div>
        </div>
      </div>

      <div v-if="activeTab==='users'">
        <div class="flex gap-2 mb-4">
          <input v-model="userQuery" class="input text-sm flex-1" placeholder="搜索用户名…" @keyup.enter="loadUsers(1)" />
          <button class="btn-secondary text-sm" @click="loadUsers(1)">搜索</button>
        </div>
        <div v-if="usersLoading" class="flex justify-center py-12">
          <div class="w-8 h-8 rounded-full animate-spin" style="border:3px solid #FED7AA; border-top-color:#F97316;"></div>
        </div>
        <div v-else class="flex flex-col gap-3">
          <div v-for="u in users" :key="u.id"
            class="card p-4 flex flex-col sm:flex-row sm:items-center gap-3 cursor-pointer hover:brightness-95 transition-all duration-150"
            @click="loadUserDetail(u.id)"
          >
            <img :src="u.avatar ? avatarUrl(u.discord_id, u.avatar) : avatarUrl(u.discord_id, null)"
              class="w-9 h-9 rounded-full object-cover flex-shrink-0" style="border:2px solid #FDBA74;" />
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2 flex-wrap">
                <span class="font-bold text-sm" style="font-family:'Fredoka',sans-serif; color:#431407;">{{ u.username }}</span>
                <span class="text-xs px-2 py-0.5 rounded-full border font-bold" :style="roleStyle(u.role)">{{ roleLabel(u.role) }}</span>
                <span v-if="u.is_banned" class="text-xs px-2 py-0.5 rounded-full font-bold" style="background:#FEE2E2;color:#991B1B;border:1px solid #FCA5A5;">已封禁</span>
              </div>
              <p class="text-xs mt-0.5" style="color:#A8A29E; font-family:'Nunito',sans-serif;">
                {{ u.email || '—' }} · 注册于 {{ fmtDate(u.created_at) }} · {{ u.pack_count || 0 }} 个模组
              </p>
            </div>
          </div>
        </div>
        <div v-if="userPagination.totalPages > 1" class="flex justify-center gap-2 mt-6">
          <button class="btn-secondary text-sm" :disabled="userPage === 1" @click="loadUsers(userPage - 1)">上一页</button>
          <span class="px-3 py-1.5 text-sm" style="color:#78350F;">{{ userPage }} / {{ userPagination.totalPages }}</span>
          <button class="btn-secondary text-sm" :disabled="userPage === userPagination.totalPages" @click="loadUsers(userPage + 1)">下一页</button>
        </div>
      </div>

      <div v-if="activeTab==='packs'">
        <div class="flex gap-2 mb-4">
          <input v-model="packQuery" class="input text-sm flex-1" placeholder="搜索模组标题…" @keyup.enter="loadPacks(1)" />
          <button class="btn-secondary text-sm" @click="loadPacks(1)">搜索</button>
        </div>
        <div v-if="packsLoading" class="flex justify-center py-12">
          <div class="w-8 h-8 rounded-full animate-spin" style="border:3px solid #FED7AA; border-top-color:#F97316;"></div>
        </div>
        <div v-else class="flex flex-col gap-3">
          <div v-for="p in packs" :key="p.id" class="card p-4 flex flex-col sm:flex-row sm:items-start gap-3">
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2 flex-wrap mb-1">
                <span class="font-bold text-sm" style="font-family:'Fredoka',sans-serif; color:#431407;">{{ p.title }}</span>
                <span class="text-xs" style="color:#A8A29E; font-family:'Nunito',sans-serif;">{{ p.workshop_name }}</span>
              </div>
              <p class="text-xs" style="color:#A8A29E; font-family:'Nunito',sans-serif;">
                作者：{{ p.author?.username || '—' }} · {{ fmtDate(p.created_at) }} · {{ p.entry_count }} 条目 · {{ p.sub_count }} 订阅
              </p>
            </div>
            <button class="btn-danger text-xs px-3 py-1.5 flex-shrink-0" @click="deletePack(p.id, p.title)">删除</button>
          </div>
        </div>
        <div v-if="packPagination.totalPages > 1" class="flex justify-center gap-2 mt-6">
          <button class="btn-secondary text-sm" :disabled="packPage === 1" @click="loadPacks(packPage - 1)">上一页</button>
          <span class="px-3 py-1.5 text-sm" style="color:#78350F;">{{ packPage }} / {{ packPagination.totalPages }}</span>
          <button class="btn-secondary text-sm" :disabled="packPage === packPagination.totalPages" @click="loadPacks(packPage + 1)">下一页</button>
        </div>
      </div>

      <div v-if="activeTab==='workshops'">
        <div class="flex gap-2 mb-4 flex-wrap">
          <button v-for="f in [{k:'pending',l:'待审核'},{k:'active',l:'已上线'},{k:'rejected',l:'已拒绝'},{k:'all',l:'全部'}]" :key="f.k"
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
                  {{ w.status==='active' ? '已上线' : w.status==='rejected' ? '已拒绝' : '待审核' }}
                </span>
              </div>
              <p class="text-xs mb-1" style="color:#A8A29E; font-family:'Nunito',sans-serif;">
                slug: {{ w.slug }} · 申请人：{{ w.author?.username || '内置' }} · {{ fmtDate(w.created_at) }}
              </p>
              <p v-if="w.description" class="text-sm rounded-xl px-3 py-2 mt-1" style="background:#FFFBF0; border:1.5px solid #FED7AA; color:#78350F; font-family:'Nunito',sans-serif; word-break:break-word;">{{ w.description }}</p>
            </div>
            <div v-if="w.status==='pending'" class="flex gap-2 flex-shrink-0">
              <button class="btn-primary text-xs px-3 py-1.5" @click="approveWorkshop(w.id)">通过</button>
              <button class="btn-danger text-xs px-3 py-1.5" @click="rejectWorkshop(w.id)">拒绝</button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div v-if="reviewModal" class="fixed inset-0 flex items-center justify-center p-4" style="background:rgba(0,0,0,0.4); z-index:100;">
      <div class="card p-6 w-full max-w-md flex flex-col gap-4">
        <h3 class="font-bold text-lg" style="font-family:'Fredoka',sans-serif; color:#431407;">
          {{ reviewModal.action === 'approve' ? '通过申请' : '拒绝申请' }}
        </h3>
        <textarea v-model="reviewNote" class="input resize-y" style="min-height:80px;" placeholder="审核备注（可选）"></textarea>
        <div class="flex gap-3 justify-end">
          <button class="btn-secondary text-sm" @click="reviewModal = null">取消</button>
          <button class="btn-primary text-sm" :disabled="reviewLoading" @click="submitReview">
            {{ reviewLoading ? '处理中…' : '确认' }}
          </button>
        </div>
      </div>
    </div>

    <div v-if="userDetail && !userDetail.loading" class="fixed inset-0 flex items-center justify-center p-4" style="background:rgba(0,0,0,0.4); z-index:100;" @click.self="userDetail = null">
      <div class="card p-6 w-full max-w-lg max-h-[80vh] overflow-y-auto flex flex-col gap-4">
        <div class="flex items-center justify-between">
          <h3 class="font-bold text-lg" style="font-family:'Fredoka',sans-serif; color:#431407;">用户详情</h3>
          <button class="text-sm" style="color:#A8A29E;" @click="userDetail = null">关闭</button>
        </div>
        <div class="flex items-center gap-3">
          <img :src="userDetail.user.avatar ? avatarUrl(userDetail.user.discord_id, userDetail.user.avatar) : avatarUrl(userDetail.user.discord_id, null)"
            class="w-12 h-12 rounded-full object-cover" style="border:2px solid #FDBA74;" />
          <div>
            <p class="font-bold" style="font-family:'Fredoka',sans-serif; color:#431407;">{{ userDetail.user.username }}</p>
            <p class="text-xs" style="color:#A8A29E;">{{ userDetail.user.email || '—' }}</p>
          </div>
        </div>
        <div class="flex flex-col gap-2">
          <div class="flex items-center gap-2">
            <span class="text-sm font-semibold" style="color:#78716C;">角色：</span>
            <span class="text-xs px-2 py-0.5 rounded-full border font-bold" :style="roleStyle(userDetail.user.role)">{{ roleLabel(userDetail.user.role) }}</span>
          </div>
          <div class="flex items-center gap-2">
            <span class="text-sm font-semibold" style="color:#78716C;">状态：</span>
            <span v-if="userDetail.user.is_banned" class="text-xs px-2 py-0.5 rounded-full font-bold" style="background:#FEE2E2;color:#991B1B;border:1px solid #FCA5A5;">已封禁</span>
            <span v-else class="text-xs px-2 py-0.5 rounded-full font-bold" style="background:#DCFCE7;color:#14532D;border:1px solid #22C55E;">正常</span>
          </div>
          <p class="text-sm" style="color:#78716C;">注册时间：{{ fmtDate(userDetail.user.created_at) }}</p>
          <p class="text-sm" style="color:#78716C;">模组数量：{{ userDetail.pack_count || 0 }}</p>
        </div>
        <div class="flex flex-wrap gap-2 mt-2">
          <button v-if="userDetail.user.role !== 'creator'" class="btn-secondary text-xs" @click="changeRole(userDetail.user.id, 'creator'); userDetail = null;">设为创作者</button>
          <button v-if="userDetail.user.role === 'creator'" class="btn-secondary text-xs" @click="changeRole(userDetail.user.id, 'user'); userDetail = null;">取消创作者</button>
          <button v-if="userDetail.user.role !== 'admin'" class="btn-secondary text-xs" @click="changeRole(userDetail.user.id, 'admin'); userDetail = null;">设为管理员</button>
          <button v-if="!userDetail.user.is_banned" class="btn-danger text-xs" @click="changeBanStatus(userDetail.user.id, true, userDetail.user.username); userDetail = null;">封禁用户</button>
          <button v-else class="btn-secondary text-xs" @click="changeBanStatus(userDetail.user.id, false, userDetail.user.username); userDetail = null;">解封用户</button>
          <button class="btn-danger text-xs" @click="deleteUser(userDetail.user.id, userDetail.user.username); userDetail = null;">删除用户</button>
        </div>
      </div>
    </div>
  </div>
</template>
