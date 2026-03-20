import axios from 'axios'

const TOKEN_KEY = 'workshop_auth_token'

const request = axios.create({
    baseURL: '',
    timeout: 30000,
    withCredentials: true,
    headers: {
        'Content-Type': 'application/json',
    },
})

request.interceptors.request.use(
    (config) => {
        const token = localStorage.getItem(TOKEN_KEY)
        if (token) {
            config.headers.Authorization = `Bearer ${token}`
        }
        return config
    },
    (error) => {
        console.error('[Axios] 请求拦截器错误:', error)
        return Promise.reject(error)
    }
)

request.interceptors.response.use(
    (response) => {
        return response.data
    },
    (error) => {
        const { response } = error

        if (response) {
            const { status, data } = response

            switch (status) {
                case 401:
                    console.warn('[Axios] 未授权，清除本地认证状态')
                    localStorage.removeItem(TOKEN_KEY)
                    localStorage.removeItem('workshop_auth_user')
                    if (window.location.pathname !== '/' && !window.location.pathname.startsWith('/auth/')) {
                        window.location.href = '/'
                    }
                    break
                case 403:
                    console.error('[Axios] 权限不足:', data?.error || '无权访问')
                    break
                case 404:
                    console.error('[Axios] 资源不存在:', data?.error || '请求的资源不存在')
                    break
                case 500:
                    console.error('[Axios] 服务器错误:', data?.error || '服务器内部错误')
                    break
                default:
                    console.error(`[Axios] 请求错误 (${status}):`, data?.error || error.message)
            }

            return Promise.reject(data?.error || error.message)
        }

        if (error.code === 'ECONNABORTED') {
            console.error('[Axios] 请求超时')
            return Promise.reject('请求超时，请稍后重试')
        }

        console.error('[Axios] 网络错误:', error.message)
        return Promise.reject('网络连接失败，请检查网络')
    }
)

const api = {
    get(url, config = {}) {
        return request.get(url, config)
    },
    post(url, data = {}, config = {}) {
        return request.post(url, data, config)
    },
    put(url, data = {}, config = {}) {
        return request.put(url, data, config)
    },
    delete(url, config = {}) {
        return request.delete(url, config)
    },
    patch(url, data = {}, config = {}) {
        return request.patch(url, data, config)
    },
}

export default api
