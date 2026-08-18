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
        <v-col cols="12" md="2" class="d-flex align-center">
          <v-btn color="primary" @click="openForm()">Registrera Ny</v-btn>
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
            <v-text-field v-model="currentExam.requestedMonth" label="Önskad Månad" />
            <v-text-field v-model="currentExam.municipality" label="Kommun" />
            <v-checkbox v-model="currentExam.materialReceived.status" label="Material hämtat" />
          </v-card-text>
          <v-card-actions>
            <v-spacer />
            <v-btn text @click="closeForm()">Avbryt</v-btn>
            <v-btn color="primary" @click="saveExam()">Spara</v-btn>
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
  currentExam.value = { ...exam }
  showForm.value = true
}

const closeForm = () => {
  showForm.value = false
  currentExam.value = {}
}

const saveExam = async () => {
  try {
    if (currentExam.value._id) {
      await client.put(`/exams/${currentExam.value._id}`, currentExam.value)
    } else {
      await client.post('/exams', currentExam.value)
    }
    toast.success('Prövning sparad!')
    closeForm()
    fetchExams()
  } catch (err) {
    toast.error('Kunde inte spara prövning')
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

onMounted(fetchExams)
</script>
