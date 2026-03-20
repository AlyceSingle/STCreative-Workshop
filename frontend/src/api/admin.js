import request from '@/utils/request'

async function checkLogin() {
  return request.get('/api/admin/me')
}

async function login(username, password) {
  return request.post('/api/admin/login', { username, password })
}

async function logout() {
  return request.post('/api/admin/logout')
}

async function fetchApplications(status = 'pending') {
  return request.get(`/api/admin/applications?status=${status}`)
}

async function reviewApplication(appId, action, note = '') {
  return request.put(`/api/admin/applications/${appId}`, { action, note })
}

async function fetchUsers(page = 1, query = '') {
  const q = query ? `&q=${encodeURIComponent(query)}` : ''
  return request.get(`/api/admin/users?page=${page}&limit=20${q}`)
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

async function fetchPacks(page = 1, query = '') {
  const q = query ? `&q=${encodeURIComponent(query)}` : ''
  return request.get(`/api/admin/packs?page=${page}&limit=20${q}`)
}

async function deletePack(packId) {
  return request.delete(`/api/admin/packs/${packId}`)
}

async function fetchWorkshopApplications(status = 'pending') {
  return request.get(`/api/admin/workshops?status=${status}`)
}

async function approveWorkshop(id) {
  return request.post(`/api/admin/workshops/${id}/approve`)
}

async function rejectWorkshop(id) {
  return request.post(`/api/admin/workshops/${id}/reject`)
}

async function fetchAllWorkshops() {
  return request.get('/api/admin/workshops?status=all')
}

async function deleteWorkshop(id) {
  return request.delete(`/api/admin/workshops/${id}`)
}

export default {
  checkLogin,
  login,
  logout,
  fetchApplications,
  reviewApplication,
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
