<template>
  <div class="scrollable-view">
    <v-container class="py-5">
      <v-card class="pa-5 mb-5">
        <v-card-title class="text-h4 font-weight-bold pa-0">Notifikationer</v-card-title>
        <p class="text-body-2 text-grey mt-2">
          Hantera och återställ notifikationer.
        </p>
      </v-card>

      <v-card class="pa-5 mb-5">
        <div class="d-flex align-center justify-space-between">
          <v-card-title class="text-h5 pa-0">Notifieringar</v-card-title>
          <v-btn size="small" variant="tonal" prepend-icon="mdi-refresh" :loading="loading" @click="loadNotifications">
            Uppdatera
          </v-btn>
        </div>

        <v-progress-linear v-if="loading" indeterminate color="primary" class="my-4" />
        <v-alert v-else-if="error" type="error" class="my-3">{{ error }}</v-alert>

        <v-table v-else dense class="mt-3">
          <thead>
            <tr>
              <th class="text-left">Meddelande</th>
              <th class="text-left">Typ</th>
              <th class="text-left">Status</th>
              <th class="text-left">Åtgärd</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="n in notifications" :key="n._id">
              <td>{{ n.message || '–' }}</td>
              <td>{{ n.type || '–' }}</td>
              <td>
                <v-chip size="x-small" :color="n.resolved ? 'success' : 'warning'">
                  {{ n.resolved ? 'Hanterad' : 'Obeglodd' }}
                </v-chip>
              </td>
              <td>
                <v-btn v-if="n.resolved" size="x-small" variant="tonal" color="warning" :loading="resettingId === n._id" @click="resetNotification(n._id)">
                  Återställ
                </v-btn>
              </td>
            </tr>
            <tr v-if="notifications.length === 0">
              <td colspan="4" class="text-center text-grey">Inga notifieringar.</td>
            </tr>
          </tbody>
        </v-table>
      </v-card>
    </v-container>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import client from '@/api/client.js'
import { useToast } from '@/composables/useToast.js'

const toast = useToast()

const notifications = ref([])
const loading = ref(true)
const error = ref(null)
const resettingId = ref(null)

const loadNotifications = async () => {
  loading.value = true
  error.value = null
  try {
    const { data } = await client.get('/notifications')
    notifications.value = Array.isArray(data) ? data : data.notifications || []
  } catch (err) {
    error.value = 'Kunde inte hämta notifieringar.'
    toast.error(error.value)
  } finally {
    loading.value = false
  }
}

const resetNotification = async (id) => {
  resettingId.value = id
  try {
    await client.put(`/notifications/${id}/reset`)
    toast.success('Notifiering återställd.')
    await loadNotifications()
  } catch (err) {
    toast.error('Kunde inte återställa notifiering.')
  } finally {
    resettingId.value = null
  }
}

onMounted(loadNotifications)
</script>
