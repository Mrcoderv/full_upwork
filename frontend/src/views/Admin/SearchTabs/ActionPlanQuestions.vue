<template>
  <v-card class="pa-6" elevation="2" rounded="lg">
    <!-- Header with title and status -->
    <div class="d-flex align-center justify-space-between mb-4">
      <div>
        <h2 class="text-h5 font-weight-bold">Handlingsplan / Åtgärdsprogram</h2>
        <p class="text-body-2 text-medium-emphasis">
          Upprätta och hantera åtgärdsplan för elev vid behov av extra stöd eller F-betyg.
        </p>
      </div>
      <div v-if="latestPlan" class="d-flex align-center gap-2">
        <v-chip color="success" variant="tonal" prepend-icon="mdi-check-circle">
          Handlingsplan sparad
        </v-chip>
      </div>
    </div>

    <!-- Completion summary banner if existing plan exists -->
    <v-alert
      v-if="latestPlan && !showForm"
      type="success"
      variant="tonal"
      class="mb-6"
      border="start"
    >
      <div class="d-flex flex-column flex-md-row align-start align-md-center justify-space-between gap-4">
        <div>
          <div class="text-subtitle-1 font-weight-bold mb-1">
            Handlingsplan finns sparad för {{ studentName }}
          </div>
          <div class="text-body-2 text-medium-emphasis">
            Ansvarig lärare: <strong>{{ latestPlan.teacherName || '–' }}</strong> |
            Datum: <strong>{{ latestPlan.date || formatDate(latestPlan.createdAt) }}</strong>
          </div>
          <div v-if="latestPlan.reason" class="text-body-2 mt-2">
            <strong>Orsak:</strong> {{ latestPlan.reason }}
          </div>
        </div>
        <div class="d-flex gap-2 mt-3 mt-md-0">
          <v-btn
            color="success"
            variant="elevated"
            prepend-icon="mdi-download"
            :loading="downloading"
            @click="downloadPdf"
          >
            Ladda ner PDF
          </v-btn>
          <v-btn
            variant="outlined"
            prepend-icon="mdi-pencil"
            @click="showForm = true"
          >
            Ny / Redigera
          </v-btn>
        </div>
      </div>
    </v-alert>

    <!-- Form Section -->
    <div v-if="!latestPlan || showForm">
      <div v-if="latestPlan" class="d-flex justify-end mb-3">
        <v-btn size="small" variant="text" @click="showForm = false">
          ← Visa sparad handlingsplan
        </v-btn>
      </div>

      <v-form ref="formRef" @submit.prevent="submitPlan">
        <v-container fluid class="pa-0">
          <div v-if="loadingQuestions" class="text-center py-6">
            <v-progress-circular indeterminate color="primary" />
            <div class="mt-2 text-body-2 text-medium-emphasis">Laddar frågor...</div>
          </div>

          <v-row v-else>
            <v-col
              v-for="(question, index) in questions"
              :key="question.key || index"
              cols="12"
              class="py-2"
            >
              <v-card variant="outlined" class="pa-4 bg-grey-lighten-5">
                <div class="d-flex align-center justify-space-between mb-2">
                  <label class="text-subtitle-2 font-weight-bold">
                    {{ question.label }}
                    <span v-if="question.required" class="text-error font-weight-bold">*</span>
                  </label>
                  <v-chip v-if="question.required" size="x-small" color="primary" variant="outlined">
                    Obligatorisk
                  </v-chip>
                </div>

                <!-- Radio buttons -->
                <v-radio-group
                  v-if="question.type === 'radio'"
                  v-model="answers[question.key]"
                  inline
                  density="comfortable"
                  :error-messages="errors[question.key]"
                >
                  <v-radio
                    v-for="option in question.options"
                    :key="option"
                    :label="option"
                    :value="option"
                    color="primary"
                  />
                </v-radio-group>

                <!-- Checkboxes -->
                <div v-else-if="question.type === 'checkbox'">
                  <v-checkbox
                    v-for="option in question.options"
                    :key="option"
                    v-model="answers[question.key]"
                    :label="option"
                    :value="option"
                    color="primary"
                    density="comfortable"
                    hide-details="auto"
                  />
                  <div v-if="errors[question.key]" class="text-caption text-error mt-1">
                    {{ errors[question.key] }}
                  </div>
                </div>

                <!-- Select dropdown -->
                <v-select
                  v-else-if="question.type === 'select'"
                  v-model="answers[question.key]"
                  :items="question.options || []"
                  label="Välj ett alternativ"
                  variant="outlined"
                  density="comfortable"
                  clearable
                  :error-messages="errors[question.key]"
                />

                <!-- Teacher autocomplete -->
                <v-autocomplete
                  v-else-if="question.key === 'teacherName'"
                  v-model="answers[question.key]"
                  :items="teachers"
                  item-title="label"
                  item-value="_id"
                  label="Välj ansvarig lärare"
                  variant="outlined"
                  density="comfortable"
                  clearable
                  :error-messages="errors[question.key]"
                />

                <!-- Date picker -->
                <v-text-field
                  v-else-if="question.type === 'date'"
                  v-model="answers[question.key]"
                  type="date"
                  label="Datum"
                  variant="outlined"
                  density="comfortable"
                  :error-messages="errors[question.key]"
                />

                <!-- Textarea -->
                <v-textarea
                  v-else-if="question.type === 'textarea'"
                  v-model="answers[question.key]"
                  label="Fyll i detaljer / kommentar"
                  variant="outlined"
                  rows="3"
                  auto-grow
                  :error-messages="errors[question.key]"
                />

                <!-- Standard Text input -->
                <v-text-field
                  v-else
                  v-model="answers[question.key]"
                  label="Svar"
                  variant="outlined"
                  density="comfortable"
                  :error-messages="errors[question.key]"
                />
              </v-card>
            </v-col>
          </v-row>

          <!-- Form Actions -->
          <v-row class="mt-4">
            <v-col cols="12" class="d-flex justify-end gap-3">
              <v-btn
                v-if="latestPlan"
                variant="outlined"
                color="secondary"
                size="large"
                prepend-icon="mdi-download"
                :loading="downloading"
                @click="downloadPdf"
              >
                Ladda ner PDF
              </v-btn>
              <v-btn
                type="submit"
                color="primary"
                size="large"
                elevation="1"
                prepend-icon="mdi-content-save"
                :loading="submitting"
              >
                Spara Handlingsplan
              </v-btn>
            </v-col>
          </v-row>
        </v-container>
      </v-form>
    </div>
  </v-card>
</template>

<script setup>
import { ref, onMounted, computed, watch } from 'vue'
import client from '@/api/client.js'
import { useToast } from '@/composables/useToast.js'

const props = defineProps({
  userData: { type: Object, default: null },
  student: { type: Object, default: null },
})

const toast = useToast()

const questions = ref([])
const answers = ref({})
const errors = ref({})
const teachers = ref([])
const latestPlan = ref(null)
const showForm = ref(false)
const loadingQuestions = ref(false)
const submitting = ref(false)
const downloading = ref(false)

const effectiveUser = computed(() => props.userData || props.student || {})

const studentId = computed(() => {
  return (
    effectiveUser.value?._id ||
    effectiveUser.value?.studentId ||
    effectiveUser.value?.id
  )
})

const studentName = computed(() => {
  return effectiveUser.value?.name || answers.value.studentName || 'Elev'
})

const selectedTeacherLabel = computed(() => {
  const teacherId = answers.value.teacherName
  const found = teachers.value.find((t) => t._id === teacherId || t.label === teacherId)
  return found ? found.label : answers.value.teacherName || ''
})

const targetEducation = computed(() => {
  const edus = effectiveUser.value?.education || []
  if (!edus.length) return null
  return edus.find((edu) => edu.locked || edu.grade === 'F') || edus[0]
})

const formatDate = (val) => {
  if (!val) return '–'
  const d = new Date(val)
  return isNaN(d.getTime()) ? String(val) : d.toLocaleDateString('sv-SE')
}

const fetchTeachers = async () => {
  try {
    const res = await client.get('/teachers')
    teachers.value = (res.data || [])
      .filter((t) => t.userId && (t.userId.username || t.userId.name))
      .map((t) => ({
        _id: t._id,
        label: t.userId.name || t.userId.username,
      }))
  } catch (error) {
    console.error('Kunde inte hämta lärare:', error)
  }
}

const fetchLatestPlan = async () => {
  const id = studentId.value
  if (!id) return
  try {
    const res = await client.get(`/actionplan/${id}`)
    if (res.data && res.data.studentId) {
      latestPlan.value = res.data
    }
  } catch (error) {
    // 404 means no action plan created yet
    latestPlan.value = null
  }
}

const fetchQuestions = async () => {
  loadingQuestions.value = true
  try {
    const response = await client.get('/form-questions/ACTION_PLAN')
    if (response.data && response.data.questions) {
      questions.value = response.data.questions
      initializeAnswers()
    }
  } catch (error) {
    console.error('Kunde inte hämta frågor:', error)
    toast.error('Kunde inte hämta handlingsplansfrågor.')
  } finally {
    loadingQuestions.value = false
  }
}

const initializeAnswers = () => {
  const newAnswers = {}
  questions.value.forEach((q) => {
    if (q.type === 'checkbox') {
      newAnswers[q.key] = []
    } else if (q.key === 'studentName') {
      newAnswers[q.key] = studentName.value || ''
    } else if (q.key === 'date') {
      newAnswers[q.key] = new Date().toISOString().slice(0, 10)
    } else {
      newAnswers[q.key] = ''
    }
  })
  answers.value = newAnswers
}

const validate = () => {
  errors.value = {}
  let isValid = true

  questions.value.forEach((q) => {
    if (q.required) {
      const val = answers.value[q.key]
      if (
        val === undefined ||
        val === null ||
        val === '' ||
        (Array.isArray(val) && val.length === 0)
      ) {
        errors.value[q.key] = `${q.label} är obligatorisk.`
        isValid = false
      }
    }
  })

  return isValid
}

const downloadPdf = async () => {
  const id = studentId.value
  if (!id) {
    toast.error('Ingen elev kopplad för att ladda ner handlingsplan.')
    return
  }
  downloading.value = true
  try {
    const res = await client.get(`/actionplan/${id}/pdf`, { responseType: 'blob' })
    const blob = new Blob([res.data], { type: 'application/pdf' })
    const url = window.URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `handlingsplan-${id}.pdf`
    document.body.appendChild(link)
    link.click()
    link.remove()
    window.URL.revokeObjectURL(url)
    toast.success('Handlingsplanen laddades ner som PDF!')
  } catch (error) {
    console.error('Kunde inte ladda ner handlingsplan:', error)
    toast.error(error.message || 'Kunde inte ladda ner handlingsplan.')
  } finally {
    downloading.value = false
  }
}

const submitPlan = async () => {
  const id = studentId.value
  if (!id) {
    toast.error('Ingen elevdata hittades för att spara handlingsplanen.')
    return
  }

  if (!validate()) {
    toast.error('Vänligen fyll i alla obligatoriska fält.')
    return
  }

  const educationId =
    targetEducation.value?.refId ||
    targetEducation.value?._id ||
    targetEducation.value?.educationId ||
    'EDU-1'

  const courseId =
    targetEducation.value?.courseId ||
    targetEducation.value?.courseInstanceId ||
    targetEducation.value?.refId ||
    targetEducation.value?._id

  const normalizedAnswers = { ...answers.value }
  if (normalizedAnswers.teacherName) {
    normalizedAnswers.teacherId = normalizedAnswers.teacherName
    normalizedAnswers.teacherName = selectedTeacherLabel.value
  }

  const payload = {
    studentId: id,
    studentName: studentName.value,
    educationId,
    ...normalizedAnswers,
  }

  if (courseId) {
    payload.courseId = courseId
  }

  submitting.value = true
  try {
    await client.post('/save-actionplan', payload)
    try {
      await client.put(`/notifications/resolve/${id}`)
    } catch {
      // Ignore if resolve fails
    }
    toast.success('Handlingsplan sparad!')
    await fetchLatestPlan()
    showForm.value = false
  } catch (error) {
    console.error('Kunde inte spara handlingsplan:', error)
    toast.error(error.response?.data?.error || error.message || 'Kunde inte spara handlingsplan.')
  } finally {
    submitting.value = false
  }
}

watch(
  () => studentId.value,
  (newId) => {
    if (newId) {
      fetchLatestPlan()
      initializeAnswers()
    }
  }
)

onMounted(async () => {
  await Promise.all([fetchQuestions(), fetchTeachers(), fetchLatestPlan()])
})
</script>

<style scoped>
.gap-2 {
  gap: 8px;
}
.gap-3 {
  gap: 12px;
}
.gap-4 {
  gap: 16px;
}
</style>
