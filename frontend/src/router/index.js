import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const routes = [
  // ── 主页（官网介绍）────────────────────────────────────────
  {
    path: '/',
    name: 'home',
    component: () => import('@/views/HomeView.vue'),
  },

  // ── 创意工坊 ───────────────────────────────────────────────
  {
    path: '/workshop',
    name: 'workshop',
    component: () => import('@/views/WorkshopView.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/workshop/new',
    name: 'workshop-pack-new',
    component: () => import('@/views/WorkshopPackEditor.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/workshop/create',
    name: 'workshop-create',
    component: () => import('@/views/WorkshopCreate.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/workshop/edit/:id',
    name: 'workshop-edit',
    component: () => import('@/views/WorkshopEdit.vue'),
    meta: { requiresAuth: true },
    props: true,
  },
  {
    path: '/workshop/:packId',
    name: 'workshop-pack-detail',
    component: () => import('@/views/WorkshopPackDetail.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/workshop/:packId/edit',
    name: 'workshop-pack-edit',
    component: () => import('@/views/WorkshopPackEditor.vue'),
    meta: { requiresAuth: true },
    props: true,
  },
  {
    path: '/workshop/:packId/entries/new',
    name: 'workshop-entry-new',
    component: () => import('@/views/WorkshopEntryEditor.vue'),
    meta: { requiresAuth: true },
    props: true,
  },
  {
    path: '/workshop/:packId/entries/:entryId/edit',
    name: 'workshop-entry-edit',
    component: () => import('@/views/WorkshopEntryEditor.vue'),
    meta: { requiresAuth: true },
    props: true,
  },

  // ── 个人主页 ──────────────────────────────────────────────
  {
    path: '/profile',
    name: 'profile',
    component: () => import('@/views/ProfileView.vue'),
    meta: { requiresAuth: true },
  },

  // ── 旧路由（保留，不从 Navbar 入口暴露）───────────────────
  {
    path: '/story/:id',
    name: 'story-detail',
    component: () => import('@/views/StoryDetailView.vue'),
    meta: { requiresAuth: true },
    props: true,
  },
  {
    path: '/upload',
    name: 'upload',
    component: () => import('@/views/UploadView.vue'),
    meta: { requiresAuth: true },
  },

  // ── 创作者申请 ────────────────────────────────────────────
  {
    path: '/creator/apply',
    name: 'creator-apply',
    component: () => import('@/views/CreatorApplyView.vue'),
    meta: { requiresAuth: true },
  },

  // ── 管理后台（自行管理鉴权，无需 requiresAuth） ───────────
  {
    path: '/admin',
    name: 'admin',
    component: () => import('@/views/AdminView.vue'),
  },

  // ── OAuth 回调（弹窗模式用）────────────────────────────────
  {
    path: '/oauth-callback',
    name: 'oauth-callback',
    component: () => import('@/views/OAuthCallbackView.vue'),
  },
]

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
  scrollBehavior(to, from, savedPosition) {
    if (savedPosition) return savedPosition
    return { top: 0, behavior: 'smooth' }
  },
})

router.beforeEach(async (to) => {
  if (to.meta.requiresAuth) {
    const authStore = useAuthStore()
    if (!authStore.initialized) {
      await authStore.fetchMe()
    }
    
    // 检查是否有管理员登录状态（通过一个简单的 cookie 判断，或者如果当前是管理员跳转，可以加个放行）
    // 为了简单起见，如果请求能通过后端，前端我们暂时先尝试放行
    // 由于前端路由守卫只看 authStore.isLoggedIn，如果没登录会跳转到 home
    // 我们可以加一个标记，如果知道是管理员，就不拦截
    const isAdminSession = document.cookie.includes('connect.sid'); // 这只是个粗略判断
    // 更好的方式：管理员登录后可能设置了 localStorage 或者可以直接调用 api 判断
    const hasAdminFlag = localStorage.getItem('isAdmin') === 'true';

    if (!authStore.isLoggedIn && !hasAdminFlag) {
      // 在跳转前弹出提示，这样更及时
      window.alert('请先登录后再游览工坊内容')
      return { name: 'home' }
    }
  }
})

export default router
