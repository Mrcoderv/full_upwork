<template>
  <div class="message-input">
    <input
      v-model="draft"
      type="text"
      placeholder="Skriv ett meddelande..."
      :disabled="disabled"
      @keyup.enter="send"
    />
    <button :disabled="disabled || !draft.trim()" @click="send">Skicka</button>
  </div>
</template>

<script>
export default {
  name: 'MessageInput',
  props: {
    conversationId: { type: String, default: '' },
    disabled: { type: Boolean, default: false },
  },
  emits: ['send-message'],
  data() {
    return {
      draft: '',
    }
  },
  methods: {
    send() {
      const text = this.draft.trim()
      if (!text) return
      this.$emit('send-message', {
        _id: 'm' + Date.now(),
        body: text,
        senderId: 'currentUser',
        senderRole: 'user',
        createdAt: new Date(),
        readBy: [],
      })
      this.draft = ''
    },
  },
}
</script>

<style scoped>
.message-input {
  display: flex;
  flex: 1;
}

.message-input input {
  flex: 1;
  padding: 8px;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 14px;
}

.message-input button {
  margin-left: 8px;
  padding: 8px 16px;
  background: #1976d2;
  color: white;
  border: none;
  border-radius: 4px;
  font-size: 14px;
  cursor: pointer;
}

.message-input button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
</style>
