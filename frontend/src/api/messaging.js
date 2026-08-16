import client from './client'

export const messagingApi = {
  getConversations() {
    return client.get('/conversations')
  },

  getMessages(conversationId, params = {}) {
    return client.get(`/conversations/${conversationId}/messages`, { params })
  },

  sendMessage(data) {
    return client.post('/messages', data)
  },

  markAsRead(conversationId) {
    return client.post(`/conversations/${conversationId}/read`)
  },

  getUnreadCount() {
    return client.get('/unread-count')
  },

  getRecipients(params = {}) {
    return client.get('/recipients', { params })
  },
}

