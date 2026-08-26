<template>
  <div class="scrollable-view">
    <v-container class="py-5">
      <v-card class="pa-5 mb-5">
        <v-card-title class="text-h4 font-weight-bold pa-0">Kursinnehåll</v-card-title>
        <p class="text-body-2 text-grey mt-2">
          Redigera innehåll för kursinstanser.
        </p>
      </v-card>

      <v-card class="pa-5 mb-5">
        <v-card-title class="text-h5 pa-0">Välj kursinstans</v-card-title>
        <v-card-text class="pa-0 mt-3">
          <v-select
            v-model="selectedInstanceId"
            :items="instanceOptions"
            label="Kursinstans"
            item-title="title"
            item-value="value"
            class="flex-grow-1"
            clearable
            @update:model-value="loadContent"
          />
        </v-card-text>
      </v-card>

      <v-card v-if="selectedInstanceId" class="pa-5">
        <div class="d-flex align-center justify-space-between">
          <v-card-title class="text-h5 pa-0">Innehåll</v-card-title>
          <v-btn size="small" variant="tonal" prepend-icon="mdi-refresh" :loading="contentLoading" @click="loadContent">
            Ladda
          </v-btn>
        </div>

        <v-progress-linear v-if="contentLoading" indeterminate color="primary" class="my-4" />
        <v-alert v-else-if="contentError" type="error" class="my-3">{{ contentError }}</v-alert>

        <v-card-text v-else class="pa-0 mt-3">
          <v-textarea
            v-model="content"
            label="Kursinnehåll (JSON eller text)"
            variant="outlined"
            rows="12"
            auto-grow
          />
          <div class="d-flex gap-2 mt-3">
            <v-btn size="small" color="primary" :loading="saving" @click="saveContent">Spara</v-btn>
            <v-btn size="small" variant="tonal" @click="loadContent">Återställ</v-btn>
          </div>
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
const content = ref('')
const contentLoading = ref(false)
const contentError = ref(null)
const saving = ref(false)

const instanceOptions = computed(() =>
  instances.value.map((i) => ({
    title: `${i.courseName}${i.courseCode ? ` (${i.courseCode})` : ''}`,
    value: i._id,
  }))
)

const loadContent = async () => {
  if (!selectedInstanceId.value) { content.value = ''; return }
  contentLoading.value = true
  contentError.value = null
  try {
    const { data } = await client.get(`/course-instances/${selectedInstanceId.value}/content`)
    content.value = typeof data.content === 'string' ? data.content : JSON.stringify(data.content || {}, null, 2)
  } catch (err) {
    contentError.value = 'Kunde inte hämta innehåll.'
    toast.error(contentError.value)
  } finally {
    contentLoading.value = false
  }
}

const saveContent = async () => {
  if (!selectedInstanceId.value) return
  saving.value = true
  try {
    let payload = content.value
    try { payload = JSON.parse(content.value) } catch { /* keep as string */ }
    await client.put(`/course-instances/${selectedInstanceId.value}/content`, { content: payload })
    toast.success('Innehåll sparat.')
  } catch (err) {
    toast.error('Kunde inte spara innehåll.')
  } finally {
    saving.value = false
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
