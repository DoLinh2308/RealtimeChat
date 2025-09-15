import axios from 'axios'

const API_ORIGIN = import.meta.env.VITE_API_URL || ''
export const api = axios.create({ baseURL: `${API_ORIGIN}/api` })

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

export const login = (username, password) => api.post('/auth/login', { username, password })
export const register = (username, password, displayName) => api.post('/auth/register', { username, password, displayName })
export const me = () => api.get('/users/me')
export const listConversations = () => api.get('/conversations')
export const createConversation = (payload) => api.post('/conversations', payload)
export const discoverConversations = () => api.get('/conversations/discover')
export const joinConversation = (id, code) => api.post(`/conversations/${id}/join`, { code })
export const directConversation = (userId) => api.post('/conversations/direct', { userId })
export const deleteConversation = (id) => api.delete(`/conversations/${id}`)
export const conversationMembers = (id) => api.get(`/conversations/${id}/members`)
export const conversationCode = (id) => api.get(`/conversations/${id}/code`)
export const history = (conversationId, page=1, pageSize=50) => api.get(`/messages/${conversationId}`, { params: { page, pageSize } })
export const sendMessage = (payload) => api.post('/messages', payload)
export const react = (messageId, emoji) => api.post(`/messages/${messageId}/reactions`, JSON.stringify(emoji), { headers: { 'Content-Type': 'application/json' } })
export const unreact = (messageId, emoji) => api.delete(`/messages/${messageId}/reactions/${encodeURIComponent(emoji)}`)
export const upload = (conversationId, file) => {
  const form = new FormData()
  form.append('conversationId', conversationId)
  form.append('file', file)
  return api.post('/messages/upload', form)
}
export const markRead = (conversationId) => api.post(`/messages/${conversationId}/read`)
export const searchMessages = (conversationId, q, page=1, pageSize=50) => api.get(`/messages/${conversationId}/search`, { params: { q, page, pageSize } })
export const mentionFeed = (unreadOnly=true, page=1, pageSize=50) => api.get('/messages/mentions', { params: { unreadOnly, page, pageSize } })
