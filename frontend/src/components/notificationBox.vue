<template>
  <div class="notification-box">
    <div v-if="notifications.length === 0">Inga nya notiser</div>
    <ul v-else>
      <li v-for="n in notifications" :key="n._id">
        {{ n.message }}
        <a v-if="n.meta && n.meta.url" :href="n.meta.url">Se elev</a>
        <button @click="dismissNotification(n._id)">✖</button>
      </li>
    </ul>

    <div v-if="error" class="error">{{ error }}</div>
  </div>
</template>

<script>
  import client from '@/api/client.js'
  import { useToast } from '@/composables/useToast.js'

  export default {
    props: {
      notifications: {
        type: Array,
        required: true,
      },
    },
    emits: ['notification-dismissed'],
    setup() {
      const toast = useToast()
      return { toast }
    },
    data() {
      return {
        error: null,
      }
    },
    methods: {
      async dismissNotification(id) {
        try {
          await client.put(`/notifications/${id}/resolve`)
          this.$emit('notification-dismissed', id)
        } catch (error) {
          this.error = 'Kunde inte ta bort notisen.'
        }
      },
    },
  }
</script>

<style scoped>
  .notification-box {
    border: none;
    border-radius: 0;
  }
</style>
