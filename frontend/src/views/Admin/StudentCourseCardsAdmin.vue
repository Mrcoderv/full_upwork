<template>
  <div class="scrollable-view">
    <v-container class="py-5">
      <v-card class="pa-5 mb-5">
        <v-card-title class="text-h4 font-weight-bold pa-0">Elevens kurskort</v-card-title>
        <p class="text-body-2 text-grey mt-2">
          Visa och hantera kurskort för en specifik elev.
        </p>
      </v-card>

      <v-card class="pa-5 mb-5">
        <v-card-title class="text-h5 pa-0">Välj elev</v-card-title>
        <v-card-text class="pa-0 mt-3">
          <v-select
            v-model="selectedStudentId"
            :items="studentOptions"
            label="Elev"
            item-title="title"
            item-value="value"
            class="flex-grow-1"
            clearable
            @update:modelValue="loadCards"
          />
        </v-card-text>
      </v-card>

      <v-card v-if="selectedStudentId" class="pa-5">
        <div class="d-flex align-center justify-space-between">
          <v-card-title class="text-h5 pa-0">Kurskort</v-card-title>
          <v-btn size="small" variant="tonal" prepend-icon="mdi-refresh" :loading="cardsLoading" @click="loadCards">
            Uppdatera
          </v-btn>
        </div>

        <v-progress-linear v-if="cardsLoading" indeterminate color="primary" class="my-4" />
        <v-alert v-else-if="cardsError" type="error" class="my-3">{{ cardsError }}</v-alert>

        <div v-else-if="cards.length > 0" class="mt-3">
          <v-card v-for="card in cards" :key="card._id || card.courseInstanceId" class="pa-4 mb-3" variant="outlined">
            <div class="d-flex justify-space-between align-start">
              <div>
                <div class="text-h6">{{ card.courseName || 'Kurs' }}</div>
                <div class="text-body-2 text-grey">{{ card.courseCode || '' }}</div>
                <div class="text-body-2 mt-1">
                  Status: <v-chip size="x-small" :color="statusColor(card.status)">{{ card.status || 'okänd' }}</v-chip>
                </div>
                <div v-if="card.grade" class="text-body-2">Betyg: {{ card.grade }}</div>
                <div v-if="card.startDate" class="text-body-2 text-grey">
                  {{ formatDate(card.startDate) }} – {{ formatDate(card.endDate) }}
                </div>
                <div v-if="card.lastAccess" class="text-body-2 text-grey mt-1">
                  Senast aktiv: {{ formatDateTime(card.lastAccess) }}
                </div>
                <div v-else-if="card.startDate" class="text-body-2 text-grey mt-1">
                  Senast aktiv: –
                </div>
              </div>
            </div>
          </v-card>
        </div>

        <v-alert v-else-if="!cardsLoading" type="info" class="my-3">Eleven har inga kurskort.</v-alert>
      </v-card>
    </v-container>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import client from '@/api/client.js'
import { useToast } from '@/composables/useToast.js'

const toast = useToast()

const students = ref([])
const selectedStudentId = ref(null)
const cards = ref([])
const cardsLoading = ref(false)
const cardsError = ref(null)

const studentOptions = computed(() =>
  students.value.map((s) => ({
    title: `${s.name}${s.personalNumber ? ` - ${s.personalNumber}` : ''}`,
    value: s._id,
  }))
)

const formatDate = (d) => d ? new Date(d).toLocaleDateString('sv-SE') : '–'
const formatDateTime = (d) => d ? new Date(d).toLocaleString('sv-SE', { dateStyle: 'short', timeStyle: 'short' }) : '–'

const statusColor = (s) => {
  if (s === 'active') return 'success'
  if (s === 'completed') return 'info'
  if (s === 'dropped') return 'error'
  return 'grey'
}

const loadCards = async () => {
  if (!selectedStudentId.value) { cards.value = []; return }
  cardsLoading.value = true
  cardsError.value = null
  try {
    const { data } = await client.get(`/students/${selectedStudentId.value}/course-cards`)
    cards.value = Array.isArray(data) ? data : data.cards || []
  } catch (err) {
    cardsError.value = 'Kunde inte hämta kurskort.'
    toast.error(cardsError.value)
  } finally {
    cardsLoading.value = false
  }
}

onMounted(async () => {
  try {
    const { data } = await client.get('/students')
    students.value = Array.isArray(data) ? data : []
  } catch {
    toast.error('Kunde inte hämta elever.')
  }
})
</script>
