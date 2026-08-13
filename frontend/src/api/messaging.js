import client from './client'

export const messagingApi = {
  getConversations() {
    return client.get('/conversations')
  },

  getMessages(conversationId) {
    return client.get(`/conversations/${conversationId}/messages`)
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

  getRecipients() {
    return client.get('/recipients')
  },
}

