<template>
  <div class="scrollable-view">
    <v-container class="py-5">
      <v-card class="pa-5 mb-5">
        <v-card-title class="text-h4 font-weight-bold pa-0">Aktivitetsflöde</v-card-title>
        <p class="text-body-2 text-grey mt-2">
          Hantera meddelanden i kursinstansers aktivitetsflöde.
        </p>
      </v-card>

      <v-card class="pa-5 mb-5">
        <v-card-title class="text-h5 pa-0">Välj kursinstans</v-card-title>
        <v-card-text class="pa-0 mt-3">
          <div class="d-flex align-center gap-2">
            <v-select
              v-model="selectedInstanceId"
              :items="instanceOptions"
              label="Kursinstans"
              item-title="title"
              item-value="value"
              class="flex-grow-1"
              clearable
              @update:modelValue="loadFeed"
            />
          </div>
        </v-card-text>
      </v-card>

      <v-card v-if="selectedInstanceId" class="pa-5 mb-5">
        <div class="d-flex align-center justify-space-between">
          <v-card-title class="text-h5 pa-0">Meddelanden</v-card-title>
          <v-btn size="small" variant="tonal" prepend-icon="mdi-refresh" :loading="feedLoading" @click="loadFeed">
            Uppdatera
          </v-btn>
        </div>

        <v-progress-linear v-if="feedLoading" indeterminate color="primary" class="my-4" />

        <v-alert v-else-if="feedError" type="error" class="my-3">{{ feedError }}</v-alert>

        <v-table v-else dense class="mt-3">
          <thead>
            <tr>
              <th class="text-left">Meddelande</th>
              <th class="text-left">Skapat</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="item in feed" :key="item.id || item._id">
              <td>{{ item.text }}</td>
              <td>{{ formatDateTime(item.createdAt) }}</td>
            </tr>
            <tr v-if="feed.length === 0">
              <td colspan="2" class="text-center text-grey">Inga meddelanden.</td>
            </tr>
          </tbody>
        </v-table>

        <v-card-text class="pa-0 mt-4">
          <v-text-field
            v-model="newMessage"
            label="Nytt meddelande"
            variant="outlined"
            density="compact"
            hide-details
            class="mb-2"
          />
          <v-btn size="small" color="primary" :disabled="!newMessage.trim() || posting" :loading="posting" @click="postMessage">
            Skicka
          </v-btn>
        </v-card-text>
      </v-card>
    </v-container>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import client from '@/api/client.js'
import { useToast } from '@/composables/useToast.js'

const toast = useToast()

const instances = ref([])
const selectedInstanceId = ref(null)
const feed = ref([])
const feedLoading = ref(false)
const feedError = ref(null)
const newMessage = ref('')
const posting = ref(false)

const instanceOptions = computed(() =>
  instances.value.map((i) => ({
    title: `${i.courseName}${i.courseCode ? ` (${i.courseCode})` : ''}`,
    value: i._id,
  }))
)

const formatDateTime = (d) => {
  if (!d) return '–'
  return new Date(d).toLocaleString('sv-SE')
}

const loadFeed = async () => {
  if (!selectedInstanceId.value) { feed.value = []; return }
  feedLoading.value = true
  feedError.value = null
  try {
    const { data } = await client.get(`/course-instances/${selectedInstanceId.value}/activity-feed`)
    feed.value = data.activityFeed || []
  } catch (err) {
    feedError.value = 'Kunde inte hämta aktivitetsflöde.'
    toast.error(feedError.value)
  } finally {
    feedLoading.value = false
  }
}

const postMessage = async () => {
  if (!newMessage.value.trim() || !selectedInstanceId.value) return
  posting.value = true
  try {
    await client.put(`/course-instances/${selectedInstanceId.value}/activity-feed`, { text: newMessage.value.trim() })
    newMessage.value = ''
    toast.success('Meddelande skickat.')
    await loadFeed()
  } catch (err) {
    toast.error('Kunde inte skicka meddelande.')
  } finally {
    posting.value = false
  }
}

onMounted(async () => {
  try {
    const { data } = await client.get('/course-instances')
    instances.value = Array.isArray(data) ? data : []
  } catch {
    toast.error('Kunde inte hämta kursinstanser.')
  }
})
</script>
