import request from '@/utils/request'

function buildQuery(params = {}) {
  const searchParams = params instanceof URLSearchParams ? params : new URLSearchParams()

  if (!(params instanceof URLSearchParams)) {
    Object.entries(params).forEach(([key, value]) => {
      if (value === undefined || value === null || value === '') return
      searchParams.append(key, String(value))
    })
  }

  const query = searchParams.toString()
  return query ? `?${query}` : ''
}

async function checkLogin() {
  return request.get('/api/admin/me')
}

async function login(username, password) {
  return request.post('/api/admin/login', { username, password })
}

async function logout() {
  return request.post('/api/admin/logout')
}

async function fetchUsers(params = {}) {
  return request.get(`/api/admin/users${buildQuery({ page: 1, limit: 20, ...params })}`)
}

async function changeUserRole(userId, role) {
  return request.put(`/api/admin/users/${userId}/role`, { role })
}

async function deleteUser(userId) {
  return request.delete(`/api/admin/users/${userId}`)
}

async function changeBanStatus(userId, isBanned) {
  return request.put(`/api/admin/users/${userId}/ban`, { is_banned: isBanned ? 1 : 0 })
}

async function fetchUserDetail(userId) {
  return request.get(`/api/admin/users/${userId}/detail`)
}

async function fetchPacks(params = {}) {
  return request.get(`/api/admin/packs${buildQuery({ page: 1, limit: 20, sort: 'latest', ...params })}`)
}

async function deletePack(packId) {
  return request.delete(`/api/admin/packs/${packId}`)
}

async function fetchWorkshopApplications(params = {}) {
  return request.get(`/api/admin/workshops${buildQuery({ status: 'pending', ...params })}`)
}

async function approveWorkshop(id) {
  return request.post(`/api/admin/workshops/${id}/approve`)
}

async function rejectWorkshop(id) {
  return request.post(`/api/admin/workshops/${id}/reject`)
}

async function fetchAllWorkshops(params = {}) {
  return request.get(`/api/admin/workshops${buildQuery({ status: 'all', ...params })}`)
}

async function deleteWorkshop(id) {
  return request.delete(`/api/admin/workshops/${id}`)
}

export default {
  checkLogin,
  login,
  logout,
  fetchUsers,
  changeUserRole,
  deleteUser,
  changeBanStatus,
  fetchUserDetail,
  fetchPacks,
  deletePack,
  fetchWorkshopApplications,
  approveWorkshop,
  rejectWorkshop,
  fetchAllWorkshops,
  deleteWorkshop,
}
