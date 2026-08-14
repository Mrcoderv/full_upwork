<template>
  <div class="message-bubble" :class="{ current: isCurrent }">
    <div class="bubble">
      <span class="body">{{ message.body }}</span>
      <span class="meta">
        {{ formatTime(message.createdAt) }}
        <span v-if="isCurrent" class="read-state">
          {{ isRead ? 'Läst' : 'Skickat' }}
        </span>
      </span>
    </div>
  </div>
</template>

<script>
export default {
  name: 'MessageBubble',
  props: {
    message: { type: Object, required: true },
    isCurrent: { type: Boolean, default: false },
  },
  computed: {
    isRead() {
      return Array.isArray(this.message.readBy) && this.message.readBy.length > 0
    },
  },
  methods: {
    formatTime(date) {
      if (!date) return ''
      return new Date(date).toLocaleString('sv-SE', {
        hour: '2-digit',
        minute: '2-digit',
      })
    },
  },
}
</script>

<style scoped>
.message-bubble {
  display: flex;
  margin-bottom: 12px;
}

.message-bubble.current {
  justify-content: flex-end;
}

.bubble {
  max-width: 70%;
  padding: 10px 14px;
  border-radius: 16px;
  background: #fff;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.08);
}

.message-bubble.current .bubble {
  background: #1976d2;
  color: white;
}

.body {
  display: block;
  font-size: 14px;
  line-height: 1.4;
}

.meta {
  display: block;
  margin-top: 4px;
  font-size: 11px;
  color: #999;
}

.message-bubble.current .meta {
  color: rgba(255, 255, 255, 0.8);
}

.read-state {
  margin-left: 6px;
}
</style>
