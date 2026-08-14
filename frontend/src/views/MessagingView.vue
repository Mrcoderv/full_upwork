<template>
  <div class="messaging-container">
    <div class="messaging-header">
      <h2><span class="icon">💬</span> Meddelanden</h2>
      <button class="btn-primary" @click="openNewConversationModal">
        <span class="plus-icon">+</span> Ny konversation
      </button>
    </div>

    <div v-if="errorMessage" class="error-banner">
      {{ errorMessage }}
      <button class="error-dismiss" @click="errorMessage = ''">×</button>
    </div>

    <div class="messaging-body">
      <!-- Conversation List Sidebar -->
      <div class="conversation-sidebar">
        <div class="search-box">
          <input
            v-model="searchFilter"
            type="text"
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
                {{ conv.lastMessage ? cutString(conv.lastMessage.body, 50) : 'Inga meddelanden ännu' }}
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
          <div class="placeholder-icon">💬</div>
          <h3>Välj en konversation</h3>
          <p>Välj en konversation från listan till vänster för att se meddelandena</p>
        </div>

        <!-- Message View -->
        <div v-if="selectedConversation" class="conversation-view">
          <div class="conversation-header">
            <v-icon left mdi="account-circle"></v-icon>
            <span class="conv-header-title">{{ getConversationTitle(selectedConversation) }}</span>

            <v-chip
              v-if="selectedConversation.studentId"
              color="info"
              small
              class="student-badge"
>
              Elev: {{ selectedConversation.studentId.name }}
            </v-chip>
          </div>
        </div>

        <!-- Message Thread -->
        <div v-if="selectedConversation" class="message-thread">
          <div class="thread-header">
            <span class="thread-subject">{{ selectedConversation.subject || 'Inget ämne' }}</span>
            <span v-if="selectedConversation.lastMessageAt" class="thread-time">
              {{ formatDate(selectedConversation.lastMessageAt) }}
            </span>
          </div>

          <div v-if="loadingMessages" class="loading-state">
            Laddar meddelanden...
          </div>

          <div v-else ref="messageFeed" class="message-feed">
            <MessageBubble
              v-for="message in selectedConversation.messages"
              :key="message._id"
              :message="message"
              :is-current="isCurrentMessage(message)"
            />
          </div>

          <div v-if="!loadingMessages && selectedConversation.messages.length === 0" class="empty-thread">
            Inga meddelanden ännu
          </div>
        </div>

        <!-- Message Input -->
        <div v-if="selectedConversation" class="message-input-area">
          <MessageInput
            :conversation-id="selectedConversation._id"
            :disabled="sendingMessage"
            @send-message="onMessageSent"
          />
        </div>
      </div>
    </div>

    <!-- New Conversation Modal -->
    <div v-if="showNewConversationModal" class="modal-overlay" @click.self="showNewConversationModal = false">
      <div class="modal-card">
        <div class="modal-header">
          <h3>Ny konversation</h3>
          <button class="modal-close" @click="showNewConversationModal = false">×</button>
        </div>
        <div class="modal-body">
          <label class="field-label">Mottagare</label>
          <div class="recipient-list">
            <label v-for="r in recipients" :key="r._id" class="recipient-option">
              <input
                v-model="selectedRecipientIds"
                type="checkbox"
                :value="r._id"
              />
              <span>{{ r.name }} <em>{{ r.email }}</em></span>
            </label>
            <div v-if="recipients.length === 0" class="empty-state">
              Inga mottagare tillgängliga
            </div>
          </div>
          <label class="field-label">Ämne</label>
          <input v-model="newSubject" type="text" placeholder="Ämne (valfritt)" class="modal-input" />
          <label class="field-label">Meddelande</label>
          <textarea
            v-model="newBody"
            rows="3"
            placeholder="Skriv ett meddelande..."
            class="modal-input"
          ></textarea>
        </div>
        <div class="modal-footer">
          <button class="btn-secondary" @click="showNewConversationModal = false">Avbryt</button>
          <button
            class="btn-primary"
            :disabled="selectedRecipientIds.length === 0 || !newBody.trim() || sendingMessage"
            @click="sendNewConversation"
          >
            {{ sendingMessage ? 'Skickar...' : 'Skicka' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import { ref, computed, onMounted, nextTick } from 'vue'
import { useRoute } from 'vue-router'
import store from '@/store/store.js'
import { messagingApi } from '@/api/messaging'
import MessageBubble from '@/components/MessageBubble.vue'
import MessageInput from '@/components/MessageInput.vue'

export default {
  name: 'MessagingView',
  components: {
    MessageBubble,
    MessageInput,
  },
  setup() {
    const conversations = ref([])
    const selectedConversation = ref(null)
    const searchFilter = ref('')
    const loadingConversations = ref(false)
    const loadingMessages = ref(false)
    const sendingMessage = ref(false)
    const errorMessage = ref('')

    // New conversation modal state
    const showNewConversationModal = ref(false)
    const recipients = ref([])
    const selectedRecipientIds = ref([])
    const newSubject = ref('')
    const newBody = ref('')

    const messageFeed = ref(null)
    const currentUserId = computed(
      () => store.state.user?.userId || store.state.user?._id
    )
    const route = useRoute()

    onMounted(async () => {
      await loadConversations()
      const requestedId = route.query.conversationId
      if (requestedId) {
        const target =
          conversations.value.find((conv) => conv._id === requestedId) ||
          conversations.value.find((conv) => conv._id?.toString() === requestedId)
        if (target) await selectConversation(target)
      }
    })

    const loadConversations = async () => {
      loadingConversations.value = true
      errorMessage.value = ''
      try {
        const { data } = await messagingApi.getConversations()
        conversations.value = data
      } catch (error) {
        errorMessage.value = error.message || 'Kunde inte hämta konversationer'
      } finally {
        loadingConversations.value = false
      }
    }

    const filteredConversations = computed(() => {
      const q = searchFilter.value.toLowerCase()
      if (!q) return conversations.value
      return conversations.value.filter((conv) => {
        const title = getConversationTitle(conv).toLowerCase()
        const subject = (conv.subject || '').toLowerCase()
        return title.includes(q) || subject.includes(q)
      })
    })

    const selectConversation = async (conv) => {
      selectedConversation.value = { ...conv, messages: [] }
      loadingMessages.value = true
      errorMessage.value = ''
      try {
        const { data } = await messagingApi.getMessages(conv._id)
        selectedConversation.value.messages = data
        if (conv.unreadCount > 0) {
          await messagingApi.markAsRead(conv._id)
          conv.unreadCount = 0
        }
        scrollToBottom()
      } catch (error) {
        errorMessage.value = error.message || 'Kunde inte hämta meddelanden'
      } finally {
        loadingMessages.value = false
      }
    }

    const onMessageSent = async (message) => {
      if (!selectedConversation.value || !message || !message.body) return
      sendingMessage.value = true
      errorMessage.value = ''
      try {
        const { data } = await messagingApi.sendMessage({
          conversationId: selectedConversation.value._id,
          body: message.body,
        })
        selectedConversation.value.messages.push(data)
        selectedConversation.value.lastMessageAt = new Date()
        selectedConversation.value.lastMessage = data
        scrollToBottom()
      } catch (error) {
        errorMessage.value = error.message || 'Kunde inte skicka meddelandet'
      } finally {
        sendingMessage.value = false
      }
    }

    const openNewConversationModal = async () => {
      showNewConversationModal.value = true
      errorMessage.value = ''
      try {
        const { data } = await messagingApi.getRecipients()
        recipients.value = data
      } catch (error) {
        errorMessage.value = error.message || 'Kunde inte hämta mottagare'
      }
    }

    const sendNewConversation = async () => {
      if (selectedRecipientIds.value.length === 0 || !newBody.value.trim()) return
      sendingMessage.value = true
      errorMessage.value = ''
      try {
        const { data } = await messagingApi.sendMessage({
          participantIds: selectedRecipientIds.value,
          subject: newSubject.value || 'Inget ämne',
          body: newBody.value,
        })
        showNewConversationModal.value = false
        newSubject.value = ''
        newBody.value = ''
        selectedRecipientIds.value = []
        await loadConversations()
        const created = conversations.value.find(
          (c) => String(c._id) === String(data.conversationId)
        )
        if (created) {
          await selectConversation(created)
        }
      } catch (error) {
        errorMessage.value = error.message || 'Kunde inte skicka meddelandet'
      } finally {
        sendingMessage.value = false
      }
    }

    const scrollToBottom = async () => {
      await nextTick()
      if (messageFeed.value) {
        messageFeed.value.scrollTop = messageFeed.value.scrollHeight
      }
    }

    const getOtherParticipant = (conv) => {
      const participants = conv.participants || []
      return participants.find(
        (p) => String(p._id) !== String(currentUserId.value)
      ) || null
    }

    const getConversationTitle = (conv) => {
      if (conv.studentId?.name) return conv.studentId.name
      const other = getOtherParticipant(conv)
      if (other?.name) return other.name
      return conv.subject || 'Okänt ämne'
    }

    const getAvatarInitials = (conv) => {
      const name = getConversationTitle(conv) || ''
      const parts = name.split(' ').filter(Boolean)
      return parts.slice(0, 2).map((p) => p.charAt(0)).join('')
    }

    const formatDate = (date) => {
      if (!date) return ''
      const d = new Date(date)
      const day = d.getDate()
      const month = d.getMonth() + 1
      const year = d.getFullYear()
      return `${day}.${month}.${year}`
    }

    const cutString = (str, maxLength) => {
      if (!str) return ''
      if (str.length <= maxLength) return str
      return str.substring(0, maxLength - 3) + '...'
    }

    const isCurrentMessage = (message) => {
      if (!message || !message.senderId) return false
      const senderId =
        typeof message.senderId === 'object' && message.senderId !== null
          ? message.senderId._id
          : message.senderId
      return String(senderId) === String(currentUserId.value)
    }

    return {
      conversations,
      selectedConversation,
      searchFilter,
      loadingConversations,
      loadingMessages,
      sendingMessage,
      errorMessage,
      showNewConversationModal,
      recipients,
      selectedRecipientIds,
      newSubject,
      newBody,
      messageFeed,
      filteredConversations,
      loadConversations,
      selectConversation,
      onMessageSent,
      openNewConversationModal,
      sendNewConversation,
      getAvatarInitials,
      getConversationTitle,
      formatDate,
      cutString,
      isCurrentMessage,
    }
  },
}
</script>

<style scoped>
.messaging-container {
  max-width: 100%;
  height: 100vh;
  background: #f7f9fc;
  display: flex;
  flex-direction: column;
}

.messaging-header {
  background: white;
  padding: 16px 24px;
  border-bottom: 1px solid #e0e0e0;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.messaging-header h2 {
  margin: 0;
  font-size: 18px;
}

.error-banner {
  background: #fdecea;
  color: #c62828;
  padding: 10px 24px;
  border-bottom: 1px solid #f5c6cb;
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 14px;
}

.error-dismiss {
  background: none;
  border: none;
  font-size: 18px;
  color: #c62828;
  cursor: pointer;
}

.messaging-body {
  display: flex;
  flex: 1;
  overflow: hidden;
}

.conversation-sidebar {
  width: 300px;
  background: #fff;
  border-right: 1px solid #e0e0e0;
  overflow-y: auto;
  padding: 16px;
  flex-shrink: 0;
}

.search-box {
  margin-bottom: 20px;
}

.search-input {
  width: 100%;
  padding: 8px;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 14px;
}

.loading-state,
.empty-state {
  padding: 20px;
  text-align: center;
  color: #666;
}

.conversation-list {
  list-style: none;
  padding: 0;
  margin: 0;
}

.conversation-item {
  padding: 12px 16px;
  border-bottom: 1px solid #f0f0f0;
  cursor: pointer;
  transition: background 0.2s;
}

.conversation-item:hover,
.conversation-item.active {
  background: #f0f7ff;
}

.conv-avatar {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: #e0e0e0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: bold;
  font-size: 14px;
  flex-shrink: 0;
}

.conv-details {
  margin-left: 56px;
}

.conv-title {
  font-weight: 600;
  font-size: 14px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.conv-time {
  font-size: 12px;
  color: #666;
  margin-left: 8px;
}

.conv-subject {
  font-size: 12px;
  color: #333;
  margin-top: 4px;
}

.conv-preview {
  font-size: 12px;
  color: #555;
  margin-top: 4px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 200px;
}

.unread-badge {
  background: #e53935;
  color: white;
  padding: 2px 6px;
  border-radius: 10px;
  font-size: 12px;
  margin-left: 4px;
}

.message-area {
  flex: 1;
  background: #f7f9fc;
  padding: 24px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
}

.no-selection {
  text-align: center;
  padding: 40px;
  color: #666;
}

.placeholder-icon {
  font-size: 48px;
  color: #d0d0d0;
  margin-bottom: 16px;
}

.conversation-view {
  margin-bottom: 24px;
}

.conversation-header {
  display: flex;
  align-items: center;
  margin-bottom: 16px;
}

.conv-header-title {
  font-size: 18px;
  margin-left: 8px;
}

.student-badge {
  margin-left: 8px;
  font-size: 12px;
}

.message-thread {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
}

.thread-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
}

.thread-subject {
  font-size: 14px;
  font-weight: 500;
}

.thread-time {
  font-size: 12px;
  color: #666;
}

.message-feed {
  flex: 1;
  overflow-y: auto;
}

.empty-thread {
  padding: 20px;
  color: #666;
  text-align: center;
}

.message-input-area {
  padding: 16px 0 0;
  border-top: 1px solid #e0e0e0;
  display: flex;
}

/* New conversation modal */
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.modal-card {
  background: white;
  border-radius: 8px;
  width: 480px;
  max-width: 95vw;
  max-height: 85vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 8px 30px rgba(0, 0, 0, 0.2);
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid #e0e0e0;
}

.modal-header h3 {
  margin: 0;
  font-size: 16px;
}

.modal-close {
  background: none;
  border: none;
  font-size: 22px;
  cursor: pointer;
  color: #666;
}

.modal-body {
  padding: 16px 20px;
  overflow-y: auto;
}

.field-label {
  display: block;
  font-size: 13px;
  font-weight: 600;
  margin: 12px 0 6px;
}

.recipient-list {
  max-height: 180px;
  overflow-y: auto;
  border: 1px solid #e0e0e0;
  border-radius: 4px;
  padding: 8px;
}

.recipient-option {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 4px;
  cursor: pointer;
  font-size: 14px;
}

.recipient-option em {
  color: #888;
  font-size: 12px;
}

.modal-input {
  width: 100%;
  padding: 8px;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 14px;
  font-family: inherit;
}

.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 16px 20px;
  border-top: 1px solid #e0e0e0;
}

.btn-primary {
  padding: 8px 16px;
  background: #1976d2;
  color: white;
  border: none;
  border-radius: 4px;
  font-size: 14px;
  cursor: pointer;
}

.btn-primary:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.btn-secondary {
  padding: 8px 16px;
  background: #fff;
  color: #333;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 14px;
  cursor: pointer;
}

.plus-icon {
  font-weight: bold;
  margin-right: 4px;
}
</style>
