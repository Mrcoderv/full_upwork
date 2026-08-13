<template>
  <div class="messaging-container">
    <div class="messaging-header">
      <h2><span class="icon">💬</span> Meddelanden</h2>
      <button class="btn-primary" @click="openNewConversationModal">
        <span class="plus-icon">+</span> Ny konversation
      </button>
    </div>

    <div class="messaging-body">
      <!-- Conversation List Sidebar -->
      <div class="conversation-sidebar">
        <div class="search-box">
          <input
            type="text"
            v-model="searchFilter"
            placeholder="Sök konversation..."
            class="search-input"
          />
        </div>

        <div v-if="loadingConversations" class="loading-state">
          Laddar konversationer...
        </div>

        <div v-else-if="filteredConversations.length === 0" class="empty-state">
          Inga konversationer hittades.
        </div>

        <ul v-else class="conversation-list">
          <li
            v-for="conv in filteredConversations"
            :key="conv._id"
            :class="['conversation-item', { active: selectedConversation && selectedConversation._id === conv._id }]"
            @click="selectConversation(conv)"
          >
            <div class="conv-avatar">
              {{ getAvatarInitials(conv) }}
            </div>
            <div class="conv-details">
              <div class="conv-top">
                <span class="conv-title">{{ getConversationTitle(conv) }}</span>
                <span v-if="conv.lastMessageAt" class="conv-time">{{ formatDate(conv.lastMessageAt) }}</span>
              </div>
              <div class="conv-subject">{{ conv.subject || 'Inget ämne' }}</div>
              <div class="conv-preview">
                {{ conv.lastMessage ? conv.lastMessage.body : 'Inga meddelanden ännu' }}
              </div>
            </div>
            <div v-if="conv.unreadCount > 0" class="unread-badge">
              {{ conv.unreadCount }}
            </div>
          </li>
        </ul>
      </div>

      <!-- Message View / Thread Area -->
      <div class="message-area">
        <div v-if="!selectedConversation" class="no-selection">
          <div class="placeholder-icon">✉️</div>
          <h3>Välj en konversation</h3>
          <p>Välj en konversation i listan till vänster eller starta en ny.</p>
        </div>

        <template v-else>
          <!-- Thread Header -->
          <div class="thread-header">
            <div class="thread-info">
              <h3>{{ getConversationTitle(selectedConversation) }}</h3>
              <span class="thread-subject">Ämne: {{ selectedConversation.subject || 'Inget ämne' }}</span>
              <span v-if="selectedConversation.studentId" class="thread-student-badge">
                Elev: {{ selectedConversation.studentId.name }}
              </span>
            </div>
          </div>

          <!-- Thread Message Feed -->
          <div class="message-feed" ref="messageFeed">
            <div v-if="loadingMessages" class="loading-state">
              Laddar meddelanden...
            </div>

            <div v-else-if="messages.length === 0" class="empty-state">
              Inga meddelanden i denna konversation än.
            </div>

            <div
              v-else
              v-for="msg in messages"
              :key="msg._id"
              :class="['message-bubble-wrapper', { 'mine': isMyMessage(msg) }]"
            >
              <div class="message-bubble">
                <div class="message-meta">
                  <span class="sender-name">{{ msg.senderId ? msg.senderId.name : 'Okänd' }}</span>
                  <span class="message-time">{{ formatFullDate(msg.createdAt) }}</span>
                </div>
                <div class="message-text">{{ msg.body }}</div>
              </div>
            </div>
          </div>

          <!-- Message Reply Box -->
          <div class="reply-box">
            <textarea
              v-model="replyBody"
              placeholder="Skriv ett meddelande..."
              rows="3"
              @keydown.enter.exact.prevent="sendReply"
            ></textarea>
            <div class="reply-actions">
              <span class="hint">Tryck Enter för att skicka</span>
              <button class="btn-send" :disabled="!replyBody.trim() || sending" @click="sendReply">
                {{ sending ? 'Skickar...' : 'Skicka' }}
              </button>
            </div>
          </div>
        </template>
      </div>
    </div>

    <!-- New Conversation Modal -->
    <div v-if="showNewModal" class="modal-overlay" @click.self="closeNewConversationModal">
      <div class="modal-card">
        <div class="modal-header">
          <h3>Ny konversation</h3>
          <button class="close-btn" @click="closeNewConversationModal">✕</button>
        </div>

        <div class="modal-body">
          <div class="form-group">
            <label>Mottagare <span class="required">*</span></label>
            <select v-model="selectedRecipientId" class="form-control">
              <option value="" disabled>Välj mottagare...</option>
              <option v-for="r in recipientOptions" :key="r._id" :value="r._id">
                {{ r.name }} ({{ formatRole(r.roles) }}) - {{ r.email }}
              </option>
            </select>
          </div>

          <div class="form-group">
            <label>Ämne</label>
            <input
              type="text"
              v-model="newSubject"
              placeholder="Ange ämne..."
              class="form-control"
            />
          </div>

          <div class="form-group">
            <label>Meddelande <span class="required">*</span></label>
            <textarea
              v-model="newBody"
              placeholder="Skriv ditt meddelande..."
              rows="4"
              class="form-control"
            ></textarea>
          </div>
        </div>

        <div class="modal-footer">
          <button class="btn-secondary" @click="closeNewConversationModal">Avbryt</button>
          <button
            class="btn-primary"
            :disabled="!selectedRecipientId || !newBody.trim() || starting"
            @click="startNewConversation"
          >
            {{ starting ? 'Startar...' : 'Starta konversation' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import { messagingApi } from '@/api/messaging'
import store from '@/store/store'

export default {
  name: 'MessagingView',
  data() {
    return {
      conversations: [],
      selectedConversation: null,
      messages: [],
      recipientOptions: [],
      searchFilter: '',
      loadingConversations: false,
      loadingMessages: false,
      sending: false,
      starting: false,
      replyBody: '',
      showNewModal: false,
      selectedRecipientId: '',
      newSubject: '',
      newBody: '',
    }
  },
  computed: {
    currentUserId() {
      if (!store.state.user) return null
      return store.state.user.userId || store.state.user._id || null
    },
    filteredConversations() {
      if (!this.searchFilter.trim()) return this.conversations
      const query = this.searchFilter.toLowerCase()
      return this.conversations.filter(c => {
        const title = this.getConversationTitle(c).toLowerCase()
        const subject = (c.subject || '').toLowerCase()
        return title.includes(query) || subject.includes(query)
      })
    }
  },
  mounted() {
    this.fetchConversations()
    this.fetchRecipients()
  },
  methods: {
    async fetchConversations() {
      this.loadingConversations = true
      try {
        const res = await messagingApi.getConversations()
        this.conversations = res.data || []
      } catch (err) {
        console.error('Kunde inte hämta konversationer:', err)
      } finally {
        this.loadingConversations = false
      }
    },

    async fetchRecipients() {
      try {
        const res = await messagingApi.getRecipients()
        this.recipientOptions = res.data || []
      } catch (err) {
        console.error('Kunde inte hämta mottagare:', err)
      }
    },

    async selectConversation(conv) {
      this.selectedConversation = conv
      this.loadingMessages = true
      try {
        const res = await messagingApi.getMessages(conv._id)
        this.messages = res.data || []
        
        // Mark as read if unread
        if (conv.unreadCount > 0) {
          await messagingApi.markAsRead(conv._id)
          conv.unreadCount = 0
        }
        
        this.$nextTick(() => {
          this.scrollToBottom()
        })
      } catch (err) {
        console.error('Kunde inte hämta meddelanden:', err)
      } finally {
        this.loadingMessages = false
      }
    },

    async sendReply() {
      if (!this.replyBody.trim() || !this.selectedConversation || this.sending) return
      this.sending = true
      try {
        const payload = {
          conversationId: this.selectedConversation._id,
          body: this.replyBody.trim(),
        }
        const res = await messagingApi.sendMessage(payload)
        this.messages.push(res.data)
        this.selectedConversation.lastMessage = res.data
        this.selectedConversation.lastMessageAt = new Date().toISOString()
        this.replyBody = ''
        this.$nextTick(() => {
          this.scrollToBottom()
        })
      } catch (err) {
        console.error('Kunde inte skicka meddelande:', err)
      } finally {
        this.sending = false
      }
    },

    openNewConversationModal() {
      this.selectedRecipientId = ''
      this.newSubject = ''
      this.newBody = ''
      this.showNewModal = true
    },

    closeNewConversationModal() {
      this.showNewModal = false
    },

    async startNewConversation() {
      if (!this.selectedRecipientId || !this.newBody.trim() || this.starting) return
      this.starting = true
      try {
        const payload = {
          participantIds: [this.selectedRecipientId],
          subject: this.newSubject.trim() || 'Inget ämne',
          body: this.newBody.trim(),
        }
        await messagingApi.sendMessage(payload)
        this.closeNewConversationModal()
        await this.fetchConversations()
        if (this.conversations.length > 0) {
          this.selectConversation(this.conversations[0])
        }
      } catch (err) {
        console.error('Kunde inte starta konversation:', err)
      } finally {
        this.starting = false
      }
    },

    isMyMessage(msg) {
      if (!msg.senderId) return false
      const senderId = typeof msg.senderId === 'object' ? msg.senderId._id : msg.senderId
      return senderId === this.currentUserId
    },

    getConversationTitle(conv) {
      if (!conv || !conv.participants) return 'Konversation'
      const others = conv.participants.filter(p => p._id !== this.currentUserId)
      if (others.length === 0) return 'Mig själv'
      return others.map(p => p.name || p.email).join(', ')
    },

    getAvatarInitials(conv) {
      const title = this.getConversationTitle(conv)
      return title.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase()
    },

    formatRole(roles) {
      if (!roles || roles.length === 0) return 'Användare'
      const roleMap = {
        admin: 'Admin',
        systemadmin: 'Systemadmin',
        teacher: 'Lärare',
        student: 'Elev',
        syv: 'SYV',
        specped: 'Specialpedagog',
        coordinator: 'Praktiksamordnare',
      }
      return roleMap[roles[0]] || roles[0]
    },

    formatDate(dateStr) {
      if (!dateStr) return ''
      const d = new Date(dateStr)
      const now = new Date()
      if (d.toDateString() === now.toDateString()) {
        return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      }
      return d.toLocaleDateString([], { month: 'short', day: 'numeric' })
    },

    formatFullDate(dateStr) {
      if (!dateStr) return ''
      const d = new Date(dateStr)
      return d.toLocaleString([], {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    },

    scrollToBottom() {
      const feed = this.$refs.messageFeed
      if (feed) {
        feed.scrollTop = feed.scrollHeight
      }
    },
  },
}
</script>

<style scoped>
.messaging-container {
  max-width: 1200px;
  margin: 1.5rem auto;
  padding: 0 1rem;
  font-family: inherit;
}

.messaging-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1.25rem;
}

.messaging-header h2 {
  font-size: 1.5rem;
  font-weight: 700;
  color: #111827;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin: 0;
}

.btn-primary {
  background-color: #2563eb;
  color: white;
  border: none;
  padding: 0.6rem 1.2rem;
  border-radius: 0.375rem;
  font-weight: 600;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  transition: background-color 0.2s;
}

.btn-primary:hover {
  background-color: #1d4ed8;
}

.btn-primary:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.messaging-body {
  display: grid;
  grid-template-columns: 320px 1fr;
  background: #ffffff;
  border: 1px solid #e5e7eb;
  border-radius: 0.5rem;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
  min-height: 580px;
  overflow: hidden;
}

/* Sidebar */
.conversation-sidebar {
  border-right: 1px solid #e5e7eb;
  display: flex;
  flex-direction: column;
  background: #f9fafb;
}

.search-box {
  padding: 0.75rem;
  border-bottom: 1px solid #e5e7eb;
}

.search-input {
  width: 100%;
  padding: 0.5rem 0.75rem;
  border: 1px solid #d1d5db;
  border-radius: 0.375rem;
  font-size: 0.875rem;
}

.conversation-list {
  list-style: none;
  margin: 0;
  padding: 0;
  overflow-y: auto;
  flex: 1;
}

.conversation-item {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.875rem 1rem;
  border-bottom: 1px solid #f3f4f6;
  cursor: pointer;
  transition: background 0.15s;
  position: relative;
}

.conversation-item:hover {
  background: #f3f4f6;
}

.conversation-item.active {
  background: #eff6ff;
  border-left: 4px solid #2563eb;
}

.conv-avatar {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: #3b82f6;
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  font-size: 0.9rem;
  flex-shrink: 0;
}

.conv-details {
  flex: 1;
  min-width: 0;
}

.conv-top {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
}

.conv-title {
  font-weight: 600;
  font-size: 0.9rem;
  color: #1f2937;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.conv-time {
  font-size: 0.75rem;
  color: #9ca3af;
}

.conv-subject {
  font-size: 0.8rem;
  font-weight: 500;
  color: #4b5563;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.conv-preview {
  font-size: 0.8rem;
  color: #6b7280;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.unread-badge {
  background-color: #ef4444;
  color: white;
  border-radius: 9999px;
  padding: 0.15rem 0.45rem;
  font-size: 0.75rem;
  font-weight: 700;
}

/* Message Area */
.message-area {
  display: flex;
  flex-direction: column;
  background: #ffffff;
}

.no-selection {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: #6b7280;
  padding: 2rem;
  text-align: center;
}

.placeholder-icon {
  font-size: 3rem;
  margin-bottom: 1rem;
}

.thread-header {
  padding: 1rem 1.25rem;
  border-bottom: 1px solid #e5e7eb;
  background: #ffffff;
}

.thread-info h3 {
  margin: 0 0 0.25rem 0;
  font-size: 1.1rem;
  color: #111827;
}

.thread-subject {
  font-size: 0.85rem;
  color: #4b5563;
  display: block;
}

.thread-student-badge {
  display: inline-block;
  margin-top: 0.25rem;
  background: #f3f4f6;
  color: #374151;
  font-size: 0.75rem;
  padding: 0.2rem 0.5rem;
  border-radius: 0.25rem;
  font-weight: 500;
}

.message-feed {
  flex: 1;
  padding: 1.25rem;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 1rem;
  max-height: 400px;
}

.message-bubble-wrapper {
  display: flex;
  justify-content: flex-start;
}

.message-bubble-wrapper.mine {
  justify-content: flex-end;
}

.message-bubble {
  max-width: 70%;
  padding: 0.75rem 1rem;
  border-radius: 0.75rem;
  background: #f3f4f6;
  color: #1f2937;
}

.message-bubble-wrapper.mine .message-bubble {
  background: #2563eb;
  color: white;
}

.message-meta {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  font-size: 0.75rem;
  margin-bottom: 0.25rem;
  opacity: 0.85;
}

.message-text {
  font-size: 0.925rem;
  line-height: 1.4;
  white-space: pre-wrap;
}

/* Reply box */
.reply-box {
  padding: 1rem;
  border-top: 1px solid #e5e7eb;
  background: #f9fafb;
}

.reply-box textarea {
  width: 100%;
  border: 1px solid #d1d5db;
  border-radius: 0.375rem;
  padding: 0.75rem;
  font-size: 0.9rem;
  resize: vertical;
}

.reply-actions {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 0.5rem;
}

.hint {
  font-size: 0.75rem;
  color: #9ca3af;
}

.btn-send {
  background: #2563eb;
  color: white;
  border: none;
  padding: 0.5rem 1rem;
  border-radius: 0.375rem;
  font-weight: 600;
  cursor: pointer;
}

.btn-send:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* Modal */
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  background: rgba(0, 0, 0, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.modal-card {
  background: white;
  width: 100%;
  max-width: 500px;
  border-radius: 0.5rem;
  box-shadow: 0 10px 25px rgba(0, 0, 0, 0.15);
  overflow: hidden;
}

.modal-header {
  padding: 1rem 1.25rem;
  border-bottom: 1px solid #e5e7eb;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.modal-header h3 {
  margin: 0;
  font-size: 1.1rem;
}

.close-btn {
  background: none;
  border: none;
  font-size: 1.2rem;
  cursor: pointer;
  color: #6b7280;
}

.modal-body {
  padding: 1.25rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.form-group label {
  font-size: 0.85rem;
  font-weight: 600;
  color: #374151;
}

.required {
  color: #ef4444;
}

.form-control {
  width: 100%;
  padding: 0.6rem;
  border: 1px solid #d1d5db;
  border-radius: 0.375rem;
  font-size: 0.9rem;
}

.modal-footer {
  padding: 1rem 1.25rem;
  border-top: 1px solid #e5e7eb;
  display: flex;
  justify-content: flex-end;
  gap: 0.75rem;
  background: #f9fafb;
}

.btn-secondary {
  background: white;
  border: 1px solid #d1d5db;
  padding: 0.5rem 1rem;
  border-radius: 0.375rem;
  cursor: pointer;
}

.loading-state, .empty-state {
  padding: 1.5rem;
  text-align: center;
  color: #6b7280;
  font-size: 0.9rem;
}
</style>
