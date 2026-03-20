import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import authApi from '@/api/auth'

const TOKEN_KEY = 'workshop_auth_token'
const USER_KEY = 'workshop_auth_user'

export const useAuthStore = defineStore('auth', () => {
  const user = ref(null)
  const token = ref(null)
  const initialized = ref(false)
  const loading = ref(false)

  const isLoggedIn = computed(() => !!user.value)
  const isCreator = computed(() => user.value?.role === 'creator' || user.value?.role === 'admin')

  function loadFromStorage() {
    try {
      const storedToken = localStorage.getItem(TOKEN_KEY)
      const storedUser = localStorage.getItem(USER_KEY)
      if (storedToken && storedUser) {
        token.value = storedToken
        user.value = JSON.parse(storedUser)
        console.log('[Auth] 从 localStorage 恢复登录状态:', user.value?.username)
      }
    } catch (err) {
      console.error('[Auth] 读取 localStorage 失败:', err)
      clearStorage()
    }
  }

  function saveToStorage(newToken, newUser) {
    try {
      localStorage.setItem(TOKEN_KEY, newToken)
      localStorage.setItem(USER_KEY, JSON.stringify(newUser))
    } catch (err) {
      console.error('[Auth] 保存到 localStorage 失败:', err)
    }
  }

  function clearStorage() {
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(USER_KEY)
  }

  function getToken() {
    return token.value
  }

  function getAuthHeaders() {
    if (token.value) {
      return { 'Authorization': `Bearer ${token.value}` }
    }
    return {}
  }

  async function fetchMe() {
    loading.value = true
    console.log('[Auth] fetchMe 开始')
    try {
      const data = await authApi.fetchMe()
      console.log('[Auth] fetchMe 响应数据:', data)
      if (data) {
        user.value = data
        if (token.value) {
          saveToStorage(token.value, data)
        }
      } else {
        user.value = null
        token.value = null
        clearStorage()
      }
    } catch (err) {
      console.error('[Auth] fetchMe 错误:', err)
      user.value = null
      token.value = null
      clearStorage()
    } finally {
      initialized.value = true
      loading.value = false
    }
  }

  function loginWithDiscord() {
    const inIframe = window.parent && window.parent !== window
    if (inIframe) {
      const authKey = 'ws_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8)
      const origin = window.location.origin
      const authUrl = `${origin}/auth/discord?authKey=${encodeURIComponent(authKey)}`
      console.log('[Auth] iframe 模式，请求扩展打开 OAuth 弹窗:', authUrl)
      console.log('[Auth] authKey:', authKey)

      let pollCount = 0
      const maxPolls = 60
      const pollInterval = 2000

      async function pollForToken() {
        pollCount++
        console.log(`[Auth] 轮询 token (${pollCount}/${maxPolls})...`)

        try {
          const data = await authApi.pollToken(authKey)
          if (data.token && data.user) {
            console.log('[Auth] 获取到 token，用户:', data.user.username)
            token.value = data.token
            user.value = data.user
            saveToStorage(data.token, data.user)
            initialized.value = true
          } else if (pollCount < maxPolls) {
            setTimeout(pollForToken, pollInterval)
          } else {
            console.warn('[Auth] 轮询超时，未获取到 token')
          }
        } catch (err) {
          console.error('[Auth] 轮询错误:', err)
          if (pollCount < maxPolls) {
            setTimeout(pollForToken, pollInterval)
          }
        }
      }

      setTimeout(pollForToken, pollInterval)

      window.parent.postMessage({
        type: 'workshop_open_oauth',
        payload: { authUrl }
      }, '*')
    } else {
      window.location.href = '/auth/discord'
    }
  }

  async function logout() {
    try {
      await authApi.logout()
    } catch (err) {
      console.error('[Auth] 登出请求失败:', err)
    } finally {
      user.value = null
      token.value = null
      clearStorage()
    }
  }

  async function init() {
    if (initialized.value) return
    loadFromStorage()
    if (token.value) {
      await fetchMe()
    } else {
      await fetchMe()
    }
  }

  return {
    user,
    token,
    initialized,
    loading,
    isLoggedIn,
    isCreator,
    getToken,
    getAuthHeaders,
    fetchMe,
    loginWithDiscord,
    logout,
    init,
  }
})
