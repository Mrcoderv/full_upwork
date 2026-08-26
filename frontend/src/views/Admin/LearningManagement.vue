<template>
  <div class="scrollable-view">
    <v-container class="py-5">
      <v-card class="pa-5 mb-5">
        <v-card-title class="text-h4 font-weight-bold pa-0">Inlämningar & Deltagare</v-card-title>
        <p class="text-body-2 text-grey mt-2">
          Hantera inlämningar och deltagare för kursinstanser.
        </p>
      </v-card>

      <!-- Instance selector -->
      <v-card class="pa-5 mb-5">
        <v-card-title class="text-h5 pa-0">Välj kursinstans</v-card-title>
        <v-card-text class="pa-0 mt-3">
          <v-select
            v-model="selectedInstanceId"
            :items="instanceOptions"
            label="Kursinstans"
            item-title="title"
            item-value="value"
            clearable
            @update:model-value="loadAll"
          />
        </v-card-text>
      </v-card>

      <!-- Submissions -->
      <v-card v-if="selectedInstanceId" class="pa-5 mb-5">
        <div class="d-flex align-center justify-space-between">
          <v-card-title class="text-h5 pa-0">Inlämningar</v-card-title>
          <v-btn size="small" variant="tonal" prepend-icon="mdi-refresh" :loading="subLoading" @click="loadSubmissions">
            Uppdatera
          </v-btn>
        </div>

        <v-progress-linear v-if="subLoading" indeterminate color="primary" class="my-4" />
        <v-alert v-else-if="subError" type="error" class="my-3">{{ subError }}</v-alert>

        <v-table v-else dense class="mt-3">
          <thead>
            <tr>
              <th class="text-left">Elev</th>
              <th class="text-left">Modul</th>
              <th class="text-left">Inlämnat</th>
              <th class="text-left">Status</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="sub in submissions" :key="sub._id">
              <td>{{ sub.studentName || sub.studentId?.name || '–' }}</td>
              <td>{{ sub.moduleNumber ?? '–' }}</td>
              <td>{{ formatDateTime(sub.submittedAt) }}</td>
              <td>
                <v-chip size="x-small" :color="sub.feedback?.status === 'godkänd' ? 'success' : 'warning'">
                  {{ sub.feedback?.status || 'Väntar' }}
                </v-chip>
              </td>
            </tr>
            <tr v-if="submissions.length === 0">
              <td colspan="4" class="text-center text-grey">Inga inlämningar.</td>
            </tr>
          </tbody>
        </v-table>
      </v-card>

      <!-- Participants -->
      <v-card v-if="selectedInstanceId" class="pa-5 mb-5">
        <div class="d-flex align-center justify-space-between">
          <v-card-title class="text-h5 pa-0">Deltagare</v-card-title>
          <div class="d-flex gap-2">
            <v-btn size="small" color="primary" prepend-icon="mdi-plus" @click="showAddParticipant = true">
              Lägg till
            </v-btn>
            <v-btn size="small" variant="tonal" prepend-icon="mdi-refresh" :loading="partLoading" @click="loadParticipants">
              Uppdatera
            </v-btn>
          </div>
        </div>

        <v-progress-linear v-if="partLoading" indeterminate color="primary" class="my-4" />
        <v-alert v-else-if="partError" type="error" class="my-3">{{ partError }}</v-alert>

        <v-table v-else dense class="mt-3">
          <thead>
            <tr>
              <th class="text-left">Namn</th>
              <th class="text-left">Typ</th>
              <th class="text-left">Åtgärd</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="p in participants" :key="p._id || p.studentId">
              <td>{{ p.name || p.studentName || '–' }}</td>
              <td>{{ p.role || p.type || 'student' }}</td>
              <td>
                <v-btn size="x-small" variant="tonal" color="error" :loading="removingId === (p._id || p.studentId)" @click="removeParticipant(p)">
                  Ta bort
                </v-btn>
              </td>
            </tr>
            <tr v-if="participants.length === 0">
              <td colspan="3" class="text-center text-grey">Inga deltagare.</td>
            </tr>
          </tbody>
        </v-table>

        <!-- Add participant dialog -->
        <v-dialog v-model="showAddParticipant" max-width="400">
          <v-card class="pa-4">
            <v-card-title class="text-h6">Lägg till deltagare</v-card-title>
            <v-card-text>
              <v-text-field v-model="newParticipantId" label="Elev-ID" density="compact" />
              <v-btn size="small" color="primary" :loading="addingParticipant" @click="addParticipant">
                Lägg till
              </v-btn>
            </v-card-text>
          </v-card>
        </v-dialog>
      </v-card>

      <!-- Reports -->
      <v-card v-if="selectedInstanceId" class="pa-5">
        <div class="d-flex align-center justify-space-between">
          <v-card-title class="text-h5 pa-0">Rapport</v-card-title>
          <v-btn size="small" variant="tonal" prepend-icon="mdi-refresh" :loading="reportLoading" @click="loadReport">
            Ladda
          </v-btn>
        </div>

        <v-progress-linear v-if="reportLoading" indeterminate color="primary" class="my-4" />
        <v-alert v-else-if="reportError" type="error" class="my-3">{{ reportError }}</v-alert>

        <v-card-text v-else-if="report" class="pa-0 mt-3">
          <v-row dense>
            <v-col cols="3">
              <div class="text-caption text-grey">Totalt</div>
              <div class="text-h6">{{ report.totalEnrollments }}</div>
            </v-col>
            <v-col cols="3">
              <div class="text-caption text-grey">Slutförda</div>
              <div class="text-h6">{{ report.totalCompletedStudents }}</div>
            </v-col>
            <v-col cols="3">
              <div class="text-caption text-grey">Genomsnittliga moduler</div>
              <div class="text-h6">{{ report.totalCompletedModules }}</div>
            </v-col>
            <v-col cols="3">
              <div class="text-caption text-grey">Slutförande</div>
              <div class="text-h6">{{ report.overallCompletionRate }}%</div>
            </v-col>
          </v-row>
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

const submissions = ref([])
const subLoading = ref(false)
const subError = ref(null)

const participants = ref([])
const partLoading = ref(false)
const partError = ref(null)

const showAddParticipant = ref(false)
const newParticipantId = ref('')
const addingParticipant = ref(false)
const removingId = ref(null)

const report = ref(null)
const reportLoading = ref(false)
const reportError = ref(null)

const instanceOptions = computed(() =>
  instances.value.map((i) => ({
    title: `${i.courseName}${i.courseCode ? ` (${i.courseCode})` : ''}`,
    value: i._id,
  }))
)

const formatDateTime = (d) => d ? new Date(d).toLocaleString('sv-SE') : '–'

const loadSubmissions = async () => {
  if (!selectedInstanceId.value) return
  subLoading.value = true
  subError.value = null
  try {
    const { data } = await client.get(`/learning/instances/${selectedInstanceId.value}/submissions`)
    submissions.value = Array.isArray(data) ? data : data.submissions || []
  } catch (err) {
    subError.value = 'Kunde inte hämta inlämningar.'
    toast.error(subError.value)
  } finally {
    subLoading.value = false
  }
}

const loadParticipants = async () => {
  if (!selectedInstanceId.value) return
  partLoading.value = true
  partError.value = null
  try {
    const { data } = await client.get(`/learning/instances/${selectedInstanceId.value}/participants`)
    participants.value = Array.isArray(data) ? data : data.participants || []
  } catch (err) {
    partError.value = 'Kunde inte hämta deltagare.'
    toast.error(partError.value)
  } finally {
    partLoading.value = false
  }
}

const loadAll = () => {
  if (!selectedInstanceId.value) { submissions.value = []; participants.value = []; report.value = null; return }
  loadSubmissions()
  loadParticipants()
  loadReport()
}

const addParticipant = async () => {
  if (!newParticipantId.value.trim()) return
  addingParticipant.value = true
  try {
    await client.post(`/learning/instances/${selectedInstanceId.value}/participants`, {
      participantId: newParticipantId.value.trim(),
      role: 'student',
    })
    toast.success('Deltagare tillagd.')
    newParticipantId.value = ''
    showAddParticipant.value = false
    await loadParticipants()
  } catch (err) {
    toast.error('Kunde inte lägga till deltagare.')
  } finally {
    addingParticipant.value = false
  }
}

const removeParticipant = async (p) => {
  const id = p._id || p.studentId
  if (!id || !confirm('Ta bort deltagare från kursen?')) return
  removingId.value = id
  try {
    await client.delete(`/learning/instances/${selectedInstanceId.value}/participants/${id}`)
    toast.success('Deltagare borttagen.')
    await loadParticipants()
  } catch {
    toast.error('Kunde inte ta bort deltagare.')
  } finally {
    removingId.value = null
  }
}

const loadReport = async () => {
  if (!selectedInstanceId.value) return
  reportLoading.value = true
  reportError.value = null
  try {
    const { data } = await client.get(`/learning/instances/${selectedInstanceId.value}/reports`)
    report.value = data
  } catch {
    reportError.value = 'Kunde inte hämta rapport.'
    toast.error(reportError.value)
  } finally {
    reportLoading.value = false
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
