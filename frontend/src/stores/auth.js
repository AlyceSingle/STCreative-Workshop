import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import authApi from '@/api/auth'

// localStorage 键名
const TOKEN_KEY = 'workshop_auth_token'
const USER_KEY = 'workshop_auth_user'
let activeLoginAttempt = null
let oauthMessageListenerBound = false

export const useAuthStore = defineStore('auth', () => {
  const user = ref(null)
  const token = ref(null)
  const initialized = ref(false)
  const loading = ref(false)

  const isLoggedIn = computed(() => !!user.value)

  /**
   * 从 localStorage 恢复认证状态
   */
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

  /**
   * 保存认证状态到 localStorage
   */
  function saveToStorage(newToken, newUser) {
    try {
      localStorage.setItem(TOKEN_KEY, newToken)
      localStorage.setItem(USER_KEY, JSON.stringify(newUser))
    } catch (err) {
      console.error('[Auth] 保存到 localStorage 失败:', err)
    }
  }

  /**
   * 清除 localStorage 中的认证状态
   */
  function clearStorage() {
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(USER_KEY)
  }

  function clearActiveLoginAttempt() {
    activeLoginAttempt = null
  }

  function saveLoginResult(newToken, newUser) {
    token.value = newToken
    user.value = newUser
    saveToStorage(newToken, newUser)
    initialized.value = true
    loading.value = false
    clearActiveLoginAttempt()
    console.log('[Auth] JWT 登录成功:', newUser?.username)
  }

  function ensureOAuthMessageListener() {
    if (oauthMessageListenerBound || typeof window === 'undefined') return

    window.addEventListener('message', async (event) => {
      const data = event.data || {}
      if (data.type !== 'workshop_oauth_result') return

      if (!activeLoginAttempt) return

      if (data.success) {
        console.log('[Auth] 收到 OAuth 完成消息，立即重试获取 token')
        window.setTimeout(() => {
          runTokenPolling(true)
        }, 150)
      } else {
        console.warn('[Auth] OAuth 登录未完成:', data.message || '未知原因')
        clearActiveLoginAttempt()
        loading.value = false
      }
    })

    oauthMessageListenerBound = true
  }

  function postOAuthRequestToHost(message) {
    const targets = []

    if (window.opener && window.opener !== window) {
      targets.push({ label: 'opener', win: window.opener })
    }

    if (window.parent && window.parent !== window && !targets.some(item => item.win === window.parent)) {
      targets.push({ label: 'parent', win: window.parent })
    }

    if (targets.length === 0) {
      console.warn('[Auth] 未找到可用的宿主窗口，无法请求打开 OAuth 弹窗')
      return false
    }

    for (const target of targets) {
      try {
        console.log('[Auth] 发送 OAuth 打开请求到宿主窗口:', {
          target: target.label,
          type: message.type,
        })
        target.win.postMessage(message, '*')
      } catch (err) {
        console.warn('[Auth] 发送 OAuth 打开请求失败:', {
          target: target.label,
          error: err?.message || err,
        })
      }
    }

    return true
  }

  async function runTokenPolling(forceImmediate = false) {
    if (!activeLoginAttempt) return

    const attempt = activeLoginAttempt
    if (forceImmediate) {
      attempt.nextDelay = 150
    }

    const currentDelay = attempt.nextDelay
    window.setTimeout(async () => {
      if (activeLoginAttempt !== attempt) return

      attempt.pollCount += 1
      console.log(`[Auth] 轮询 token (${attempt.pollCount}/${attempt.maxPolls})...`)

      try {
        const data = await authApi.pollToken(attempt.authKey)
        if (activeLoginAttempt !== attempt) return

        if (data.token && data.user) {
          saveLoginResult(data.token, data.user)
          return
        }

        console.log('[Auth] 本次轮询未获取到 token')
      } catch (err) {
        if (activeLoginAttempt !== attempt) return
        console.error('[Auth] 轮询错误:', err)
      }

      if (attempt.pollCount >= attempt.maxPolls) {
        console.warn('[Auth] 轮询超时，未获取到 token')
        clearActiveLoginAttempt()
        loading.value = false
        return
      }

      attempt.nextDelay = attempt.pollInterval
      runTokenPolling(false)
    }, currentDelay)
  }

  /**
   * 获取当前 token（供其他模块使用）
   */
  function getToken() {
    return token.value
  }

  /**
   * 获取带认证的 fetch 选项
   */
  function getAuthHeaders() {
    if (token.value) {
      return { 'Authorization': `Bearer ${token.value}` }
    }
    return {}
  }

  /**
   * 验证当前 token 是否有效，并刷新用户信息
   */
  async function fetchMe() {
    loading.value = true
    try {
      const data = await authApi.fetchMe()
      console.log('[Auth] fetchMe 响应数据:', data)
      if (data) {
        user.value = data
        // 如果是 JWT 模式，更新缓存的用户信息
        if (token.value) {
          saveToStorage(token.value, data)
        }
      } else {
        // 服务器返回 null，清除本地状态
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

  /**
   * 使用 Discord 登录
   * 在 iframe 模式下使用 JWT Token 流程
   */
  function loginWithDiscord() {
    const inIframe = window.parent && window.parent !== window
    if (inIframe) {
      ensureOAuthMessageListener()

      // iframe 模式：使用 JWT Token 流程
      // 生成唯一的 authKey
      const authKey = 'ws_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8)
      const origin = window.location.origin
      const authUrl = `${origin}/auth/discord?authKey=${encodeURIComponent(authKey)}`
      console.log('[Auth] iframe 模式，请求扩展打开 OAuth 弹窗:', authUrl)
      console.log('[Auth] authKey:', authKey)

      activeLoginAttempt = {
        authKey,
        pollCount: 0,
        maxPolls: 60,
        pollInterval: 2000,
        nextDelay: 2000,
      }
      loading.value = true

      // 延迟开始轮询，给 OAuth 流程一些时间
      runTokenPolling(false)

      // 发送请求给扩展，让扩展（父页面）打开 OAuth 弹窗
      postOAuthRequestToHost({
        type: 'workshop_open_oauth',
        payload: { authUrl }
      })
    } else {
      // 非 iframe 模式：登录后回到当前页面
      const returnTo = `${window.location.pathname}${window.location.search}${window.location.hash}`
      const loginUrl = `/auth/discord?returnTo=${encodeURIComponent(returnTo)}`
      window.location.href = loginUrl
    }
  }

  /**
   * 登出
   */
  async function logout() {
    try {
      await authApi.logout()
    } catch (err) {
      console.error('[Auth] 登出请求失败:', err)
    } finally {
      // 无论如何都清除本地状态
      user.value = null
      token.value = null
      clearStorage()
      clearActiveLoginAttempt()
      loading.value = false
    }
  }

  /**
   * 初始化：从 localStorage 恢复状态并验证
   */
  async function init() {
    if (initialized.value) return
    loadFromStorage()
    // 如果有 token，验证其有效性
    if (token.value) {
      await fetchMe()
    } else {
      // 没有 token，尝试用 session（非 iframe 模式）
      await fetchMe()
    }
  }

  return {
    user,
    token,
    initialized,
    loading,
    isLoggedIn,
    getToken,
    getAuthHeaders,
    fetchMe,
    loginWithDiscord,
    logout,
    init,
  }
})
