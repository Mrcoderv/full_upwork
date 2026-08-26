<template>
  <div class="scrollable-view">
    <div class="container my-5">
      <h2 class="mb-4 text-center">Prövningselever</h2>

      <!-- Filterfält -->
      <div class="row g-3 mb-4">
        <div class="col-md-4">
          <input v-model="search" type="text" class="form-control shadow-sm" placeholder="Sök på namn" />
        </div>
        <div class="col-md-4">
          <select v-model="filterMonth" class="form-select shadow-sm">
            <option value="">Alla månader</option>
            <option v-for="month in months" :key="month" :value="month">{{ month }}</option>
          </select>
        </div>
        <div class="col-md-4">
          <select v-model="filterStatus" class="form-select shadow-sm">
            <option value="">Alla statusar</option>
            <option value="intresse">Intresse</option>
            <option value="scheduled">Godkänd</option>
            <option value="moved">Flyttad</option>
            <option value="denied">Nekad</option>
          </select>
        </div>
      </div>

      <!-- Scrollbar & tabell -->
      <div class="table-responsive">
        <table class="table table-hover table-striped align-middle rounded shadow-sm overflow-hidden" style="min-width: 1200px;">
          <thead class="table-primary">
            <tr>
              <th>Namn</th>
              <th>Personnummer</th>
              <th>Telefon</th>
              <th>Email</th>
              <th>Kurs</th>
              <th>Kommun</th>
              <th>Månad</th>
              <th>Lärare</th>
              <th>Status</th>
              <th>Material</th>
              <th>Betalning</th>
              <th>Beslut</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="exam in filteredExams" :key="exam._id">
              <td><strong>{{ exam.name }}</strong></td>
              <td>{{ exam.personalNumber || '–' }}</td>
              <td>{{ exam.phone || '–' }}</td>
              <td>{{ exam.email || '–' }}</td>
              <td>{{ exam.course || '–' }}</td>
              <td>{{ exam.municipality || '–' }}</td>
              <td>{{ exam.requestedMonthFormatted }}</td>
              <td>{{ exam.teacherId?.userId?.username || '–' }}</td>
              <td>
                <span :class="['badge', statusColor(exam.status)]">{{ exam.status || '–' }}</span>
              </td>
              <td>
                <span v-if="exam.materialReceived?.status" class="badge bg-success">Ja</span>
                <span v-else class="badge bg-secondary">Nej</span>
              </td>
              <td>{{ formatDate(exam.paymentDate) }}</td>
              <td style="min-width: 200px;">
                <div class="mb-2">
                  <select v-model="decisions[exam._id].decision" class="form-select form-select-sm">
                    <option value="">Välj</option>
                    <option value="accept">Godkänn</option>
                    <option value="move">Flytta till nästa månad</option>
                    <option value="deny">Neka</option>
                  </select>
                </div>
                <textarea
                  v-model="decisions[exam._id].comment"
                  rows="2"
                  class="form-control form-control-sm mb-2"
                  placeholder="Kommentar"
                ></textarea>
                <div class="d-flex justify-content-start flex-wrap gap-2">
                  <button class="btn btn-sm btn-success" @click="submitDecision(exam._id)">
                    Spara
                  </button>
                  <button class="btn btn-sm btn-outline-primary" @click="openQuestionPicker(exam)">
                    Välj frågor
                  </button>
                  <button class="btn btn-sm btn-outline-danger" @click="deleteExam(exam._id)">
                    Ta bort
                  </button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Question Picker Dialog -->
    <div v-if="showQuestionPicker" class="modal-backdrop fade show" style="display:block" @click.self="showQuestionPicker = false">
      <div class="modal-dialog modal-lg" style="max-width: 900px; margin: 2rem auto;">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title">Välj frågor från frågebanken</h5>
            <button type="button" class="btn-close" @click="showQuestionPicker = false"></button>
          </div>
          <div class="modal-body">
            <div v-if="pickerLoading" class="text-center py-4">
              <div class="spinner-border text-primary"></div>
            </div>
            <template v-else>
              <div class="row g-2 mb-3">
                <div class="col-md-4">
                  <select v-model="pickerSubject" class="form-select form-select-sm" @change="loadPickerQuestions">
                    <option value="Alla">Alla ämnen</option>
                    <option v-for="s in pickerSubjects" :key="s" :value="s">{{ s }}</option>
                  </select>
                </div>
                <div class="col-md-4">
                  <select v-model="pickerType" class="form-select form-select-sm" @change="loadPickerQuestions">
                    <option value="Alla">Alla typer</option>
                    <option value="multipleChoice">Multiple Choice</option>
                    <option value="trueFalse">Sant/Falskt</option>
                    <option value="essay">Essayfråga</option>
                    <option value="shortAnswer">Kort svar</option>
                  </select>
                </div>
                <div class="col-md-4">
                  <span class="form-control form-control-sm text-muted">Valda: {{ Object.values(pickerSelected).filter(Boolean).length }}</span>
                </div>
              </div>

              <div style="max-height: 400px; overflow-y: auto;">
                <table class="table table-sm table-hover">
                  <thead>
                    <tr>
                      <th style="width:40px"></th>
                      <th>Fråga</th>
                      <th>Ämne</th>
                      <th>Typ</th>
                      <th>Svårighet</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="q in pickerQuestions" :key="q._id" :class="{ 'table-active': pickerSelected[q._id] }">
                      <td>
                        <input type="checkbox" class="form-check-input" :checked="pickerSelected[q._id]" @change="togglePickerQuestion(q._id)" />
                      </td>
                      <td>{{ q.questionText.substring(0, 60) }}{{ q.questionText.length > 60 ? '...' : '' }}</td>
                      <td>{{ q.subject }}</td>
                      <td><span class="badge bg-secondary">{{ q.questionType }}</span></td>
                      <td>{{ q.difficulty }}</td>
                    </tr>
                    <tr v-if="pickerQuestions.length === 0">
                      <td colspan="5" class="text-center text-muted">Inga frågor hittades</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </template>
          </div>
          <div class="modal-footer">
            <button class="btn btn-secondary" @click="showQuestionPicker = false">Avbryt</button>
            <button class="btn btn-primary" :disabled="pickerSaving" @click="savePickerQuestions">
              {{ pickerSaving ? 'Sparar...' : 'Spara valda frågor' }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
  import { ref, onMounted, computed } from 'vue'
  import client from '@/api/client.js'
  import { useToast } from '@/composables/useToast.js'

  const toast = useToast()

  const exams = ref([])
  const search = ref('')
  const filterMonth = ref('')
  const filterStatus = ref('')

  const decisions = ref({})

  // Question picker state
  const showQuestionPicker = ref(false)
  const pickerExamId = ref(null)
  const pickerQuestions = ref([])
  const pickerSelected = ref({})
  const pickerLoading = ref(false)
  const pickerSaving = ref(false)
  const pickerSubject = ref('Alla')
  const pickerType = ref('Alla')
  const pickerSubjects = ref([
    'Matematik', 'Svenska', 'Engelska', 'Naturkunskap', 'Samhällskunskap',
    'Histori', 'Geografi', 'Idrott', 'Kemi', 'Fysik', 'Biologi', 'Teknik',
  ])

  // Generera månader dynamiskt
  const months = computed(() => {
    const currentYear = new Date().getFullYear()
    return Array.from({ length: 12 }, (_, i) => {
      const month = new Date(currentYear, i, 1)
      return month.toLocaleString('sv-SE', { month: 'long' })
    })
  })

  const fetchExams = async () => {
    try {
      const res = await client.get('/exams')
      exams.value = res.data.map((exam) => ({
        ...exam,
        requestedMonthFormatted: formatRequestedMonth(exam.requestedMonth),
      }))

      // Initiera beslut-fält
      res.data.forEach((e) => {
        decisions.value[e._id] = {
          decision: e.decision || '',
          comment: e.comment || '',
        }
      })
    } catch (err) {
      console.error('Fel vid hämtning:', err)
    }
  }

    const formatRequestedMonth = (month) => {
      if (!month) return ''
      return month.charAt(0).toUpperCase() + month.slice(1).toLowerCase()
    }

    const formatDate = (date) => {
      if (!date) return ''
      return new Date(date).toLocaleDateString('sv-SE')
    }

    const submitDecision = async (id) => {
      const { decision, comment } = decisions.value[id]
      if (!decision) {
        toast.error('Beslut krävs')
        return
      }

    try {
      await client.put(`/exams/${id}/decision`, {
        decision,
        comment,
      })
      toast.success('Beslut sparat')
      fetchExams()
    } catch (err) {
      console.error(err)
      toast.error('Fel vid beslutssparning')
    }
  }

  const deleteExam = async (id) => {
    if (!confirm('Är du säker på att du vill ta bort denna prövning?')) return
    try {
      await client.delete(`/exams/${id}`)
      toast.success('Prövning borttagen')
      fetchExams()
    } catch (err) {
      console.error('Fel vid borttagning:', err)
      toast.error('Kunde inte ta bort prövningen.')
    }
  }

  const statusColor = (status) => {
  switch (status) {
    case 'scheduled': return 'bg-success text-white'
    case 'moved': return 'bg-warning text-dark'
    case 'denied': return 'bg-danger text-white'
    case 'intresse': return 'bg-info text-dark'
    default: return 'bg-secondary'
  }
}

  // Question picker methods
  const openQuestionPicker = async (exam) => {
    pickerExamId.value = exam._id
    pickerSelected.value = {}
    pickerSubject.value = 'Alla'
    pickerType.value = 'Alla'
    showQuestionPicker.value = true
    await loadPickerQuestions()
  }

  const loadPickerQuestions = async () => {
    pickerLoading.value = true
    try {
      const params = new URLSearchParams()
      if (pickerSubject.value !== 'Alla') params.set('subject', pickerSubject.value)
      if (pickerType.value !== 'Alla') params.set('questionType', pickerType.value)
      const { data } = await client.get(`/question-bank?${params.toString()}`)
      pickerQuestions.value = data.questions || []
      pickerQuestions.value.forEach((q) => {
        if (!(q._id in pickerSelected.value)) {
          pickerSelected.value[q._id] = false
        }
      })
    } catch (err) {
      toast.error('Kunde inte hämta frågor')
    } finally {
      pickerLoading.value = false
    }
  }

  const togglePickerQuestion = (id) => {
    pickerSelected.value[id] = !pickerSelected.value[id]
  }

  const savePickerQuestions = async () => {
    pickerSaving.value = true
    try {
      const questionIds = Object.entries(pickerSelected.value)
        .filter(([, v]) => v)
        .map(([k]) => k)
      await client.post('/question-bank/generate-exam', {
        courseId: pickerExamId.value,
        numberOfQuestions: questionIds.length,
        subject: pickerSubject.value,
        questionType: pickerType.value,
      })
      toast.success(`${questionIds.length} frågor kopplade till provningen`)
      showQuestionPicker.value = false
    } catch (err) {
      toast.error('Kunde inte spara frågor')
    } finally {
      pickerSaving.value = false
    }
  }


  onMounted(fetchExams)

  const filteredExams = computed(() => {
    return exams.value.filter((e) => {
      const matchSearch = e.name.toLowerCase().includes(search.value.toLowerCase())
      const matchMonth =
        !filterMonth.value ||
        e.requestedMonthFormatted.toLowerCase().includes(filterMonth.value.toLowerCase())
      const matchStatus = !filterStatus.value || e.status === filterStatus.value
      return matchSearch && matchMonth && matchStatus
    })
  })
</script>
<style scoped>
thead th {
  position: sticky;
  top: 0;
  background-color: #f8f9fa;
  z-index: 2;
}

tbody tr:hover {
  background-color: #f1f1f1;
  transition: background 0.2s ease;
}
</style>
