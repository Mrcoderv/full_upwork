<template>
  <div class="scrollable-view">
    <v-container class="my-5">
      <h2 class="mb-4">Hantera Prövningar</h2>

      <!-- Search and Filter Bar -->
      <v-row class="mb-4" dense>
        <v-col cols="12" md="4">
          <v-text-field
            v-model="searchQuery"
            label="Sök elev, kurs eller personnummer"
            prepend-inner-icon="mdi-magnify"
            outlined
            dense
            clearable
          />
        </v-col>
        <v-col cols="12" md="3">
          <v-select
            v-model="filterStatus"
            :items="statusOptions"
            label="Status"
            outlined
            dense
            clearable
          />
        </v-col>
        <v-col cols="12" md="3">
          <v-select
            v-model="filterMonth"
            :items="months"
            label="Månad"
            outlined
            dense
            clearable
          />
        </v-col>
        <v-col cols="12" md="2" class="d-flex align-center gap-2">
          <v-btn color="primary" @click="openForm()">Registrera Ny</v-btn>
          <v-btn color="secondary" variant="outlined" @click="showImport = true">Importera</v-btn>
        </v-col>
      </v-row>

      <!-- Exams Table -->
      <v-data-table
        :headers="headers"
        :items="filteredExams"
        :search="searchQuery"
        dense
        class="elevation-1"
      >
        <template #item.status="{ item }">
          <v-chip :color="statusColor(item.status)" small dark>
            {{ statusLabel(item.status) }}
          </v-chip>
        </template>
        <template #item.accommodations="{ item }">
          <span v-if="item.accommodations?.extraTime || item.accommodations?.computer || item.accommodations?.separateRoom">
            <v-icon v-if="item.accommodations.extraTime" small title="Extra skrivtid" class="me-1">mdi-clock-plus-outline</v-icon>
            <v-icon v-if="item.accommodations.computer" small title="Dator" class="me-1">mdi-laptop</v-icon>
            <v-icon v-if="item.accommodations.separateRoom" small title="Sitter ensam">mdi-account-off</v-icon>
          </span>
          <span v-else class="text-muted">—</span>
        </template>
        <template #item.actions="{ item }">
          <v-icon small class="me-2" @click="openForm(item)">mdi-pencil</v-icon>
          <v-icon small color="red" @click="deleteExam(item._id)">mdi-delete</v-icon>
        </template>
      </v-data-table>

      <!-- Inline Edit Form -->
      <v-dialog v-model="showForm" max-width="600px" persistent>
        <v-card>
          <v-card-title>{{ currentExam._id ? 'Redigera' : 'Registrera' }} Prövning</v-card-title>
          <v-card-text>
            <v-text-field v-model="currentExam.name" label="Namn" required />
            <v-text-field v-model="currentExam.personalNumber" label="Personnummer" required />
            <v-text-field v-model="currentExam.course" label="Kurs" required />
            <v-select v-model="currentExam.requestedMonth" :items="months" label="Önskad månad" required />
            <v-text-field v-model="currentExam.municipality" label="Kommun" />
            <v-checkbox v-model="currentExam.materialReceived.status" label="Material hämtat" />
            <v-alert v-if="formError" type="error" density="compact" class="mt-2">{{ formError }}</v-alert>
          </v-card-text>
          <v-card-actions>
            <v-spacer />
            <v-btn text @click="closeForm()">Avbryt</v-btn>
            <v-btn color="primary" :loading="saving" :disabled="saving" @click="saveExam()">Spara</v-btn>
          </v-card-actions>
        </v-card>
      </v-dialog>

      <!-- Import Dialog -->
      <v-dialog v-model="showImport" max-width="550px" persistent>
        <v-card>
          <v-card-title>Importera prövningar</v-card-title>
          <v-card-text>
            <div
              class="import-dropzone"
              :class="{ 'dropzone-hover': isDragging }"
              @dragover.prevent="isDragging = true"
              @dragleave.prevent="isDragging = false"
              @drop.prevent="handleDrop"
            >
              <v-icon size="48" color="grey">mdi-cloud-upload-outline</v-icon>
              <p class="mt-2 mb-1"><strong>Dra och släpp</strong> en CSV- eller Excel-fil här</p>
              <p class="text-caption text-grey">eller</p>
              <v-btn size="small" variant="outlined" @click="$refs.fileInput.click()">Välj fil</v-btn>
              <input
                ref="fileInput"
                type="file"
                accept=".csv,.xlsx,.xls"
                class="d-none"
                @change="handleFileSelect"
              />
            </div>
            <div v-if="importFile" class="mt-3">
              <v-chip closable @click:close="importFile = null">
                <v-icon start>mdi-file-document</v-icon>
                {{ importFile.name }}
              </v-chip>
            </div>
            <v-alert v-if="importResult" :type="importResult.success ? 'success' : 'error'" class="mt-3" density="compact">
              {{ importResult.message }}
              <div v-if="importResult.skipped?.length" class="mt-1 text-caption">
                Spragna rader: {{ importResult.skipped.length }} (t.ex. dubletter eller saknade fält)
              </div>
            </v-alert>
          </v-card-text>
          <v-card-actions>
            <v-spacer />
            <v-btn text @click="closeImport()">Avbryt</v-btn>
            <v-btn color="primary" :disabled="!importFile || importing" :loading="importing" @click="submitImport()">
              Importera
            </v-btn>
          </v-card-actions>
        </v-card>
      </v-dialog>
    </v-container>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import client from '@/api/client.js'
import { useToast } from '@/composables/useToast.js'

const toast = useToast()

const exams = ref([])
const showForm = ref(false)
const currentExam = ref({})
const searchQuery = ref('')
const filterStatus = ref('')
const filterMonth = ref('')
const showImport = ref(false)
const importFile = ref(null)
const isDragging = ref(false)
const importing = ref(false)
const importResult = ref(null)
const formError = ref(null)
const saving = ref(false)

const headers = [
  { title: 'Namn', key: 'name' },
  { title: 'Kurs', key: 'course' },
  { title: 'Månad', key: 'requestedMonth' },
  { title: 'Kommun', key: 'municipality' },
  { title: 'Status', key: 'status', sortable: true },
  { title: 'Anpassningar', key: 'accommodations', sortable: false },
  { title: 'Åtgärder', key: 'actions', sortable: false },
]

const statusOptions = [
  { title: 'Intresse', value: 'intresse' },
  { title: 'Scheduled', value: 'scheduled' },
  { title: 'Flyttad', value: 'moved' },
  { title: 'Nekad', value: 'denied' },
]

const months = [
  'Januari', 'Februari', 'Mars', 'April', 'Maj', 'Juni',
  'Juli', 'Augusti', 'September', 'Oktober', 'November', 'December',
]

const statusColor = (status) => {
  const map = { intresse: 'blue', scheduled: 'green', moved: 'orange', denied: 'red' }
  return map[status] || 'grey'
}

const statusLabel = (status) => {
  const map = { intresse: 'Intresse', scheduled: 'Scheduled', moved: 'Flyttad', denied: 'Nekad' }
  return map[status] || status
}

const filteredExams = computed(() => {
  return exams.value.filter((exam) => {
    const matchesSearch = !searchQuery.value ||
      exam.name?.toLowerCase().includes(searchQuery.value.toLowerCase()) ||
      exam.course?.toLowerCase().includes(searchQuery.value.toLowerCase()) ||
      exam.personalNumber?.includes(searchQuery.value)
    const matchesStatus = !filterStatus.value || exam.status === filterStatus.value
    const matchesMonth = !filterMonth.value || exam.requestedMonth === filterMonth.value
    return matchesSearch && matchesStatus && matchesMonth
  })
})

const fetchExams = async () => {
  try {
    const { data } = await client.get('/admin/exams')
    exams.value = data
  } catch (error) {
    toast.error('Kunde inte hämta provningar')
  }
}

const openForm = (exam = {}) => {
  formError.value = null
  currentExam.value = {
    status: 'intresse',
    materialReceived: { status: false },
    accommodations: [],
    ...exam,
    materialReceived: { status: false, ...(exam.materialReceived || {}) },
  }
  showForm.value = true
}

const closeForm = () => {
  showForm.value = false
  currentExam.value = {}
}

const saveExam = async () => {
  formError.value = null
  if (!currentExam.value.name?.trim() || !currentExam.value.course?.trim()) {
    formError.value = 'Namn och kurs måste fyllas i.'
    return
  }
  if (!currentExam.value.requestedMonth) {
    formError.value = 'Välj önskad månad.'
    return
  }
  saving.value = true
  try {
    if (currentExam.value._id) {
      await client.put(`/exams/${currentExam.value._id}`, currentExam.value)
    } else {
      await client.post('/exams', currentExam.value)
    }
    toast.success('Prövning sparad!')
    closeForm()
    await fetchExams()
  } catch (err) {
    formError.value = err.response?.data?.message || 'Kunde inte spara prövning.'
  } finally {
    saving.value = false
  }
}

const deleteExam = async (id) => {
  if (confirm('Är du säker?')) {
    try {
      await client.delete(`/exams/${id}`)
      toast.success('Prövning borttagen')
      fetchExams()
    } catch (err) {
      toast.error('Kunde inte ta bort prövning')
    }
  }
}

const handleFileSelect = (event) => {
  const file = event.target.files[0]
  if (file) setImportFile(file)
}

const handleDrop = (event) => {
  isDragging.value = false
  const file = event.dataTransfer.files[0]
  if (file) setImportFile(file)
}

const setImportFile = (file) => {
  const ext = file.name.split('.').pop().toLowerCase()
  if (!['csv', 'xlsx', 'xls'].includes(ext)) {
    toast.error('Endast CSV och Excel-filer är tillåtna')
    return
  }
  importFile.value = file
  importResult.value = null
}

const closeImport = () => {
  showImport.value = false
  importFile.value = null
  importResult.value = null
  isDragging.value = false
}

const submitImport = async () => {
  if (!importFile.value) return
  importing.value = true
  importResult.value = null

  try {
    const ext = importFile.value.name.split('.').pop().toLowerCase()
    const type = ext === 'csv' ? 'csv' : 'excel'
    let fileData

    if (type === 'csv') {
      fileData = await importFile.value.text()
    } else {
      const buffer = await importFile.value.arrayBuffer()
      fileData = Array.from(new Uint8Array(buffer))
    }

    const { data } = await client.post('/exams/import', { file: fileData, type })
    importResult.value = data
    if (data.saved?.length) {
      toast.success(`Import klar: ${data.saved.length} sparade`)
      fetchExams()
    }
  } catch (err) {
    importResult.value = {
      success: false,
      message: err.response?.data?.error || 'Kunde inte importera filen',
    }
  } finally {
    importing.value = false
  }
}

onMounted(fetchExams)
</script>

<style scoped>
.import-dropzone {
  border: 2px dashed #ccc;
  border-radius: 8px;
  padding: 32px;
  text-align: center;
  transition: border-color 0.2s, background 0.2s;
  cursor: pointer;
}
.import-dropzone:hover,
.import-dropzone.dropzone-hover {
  border-color: #1976d2;
  background: rgba(25, 118, 210, 0.04);
}
.gap-2 {
  gap: 8px;
}
</style>
