<template>
  <div class="scrollable-view">
    <v-container class="py-5">
      <v-card class="pa-5 mb-5">
        <v-card-title class="text-h4 font-weight-bold pa-0">Handlingsplaner</v-card-title>
        <p class="text-body-2 text-grey mt-2">
          Visa och hantera handlingsplaner och frågemallar.
        </p>
      </v-card>

      <!-- Action plans list -->
      <v-card class="pa-5 mb-5">
        <div class="d-flex align-center justify-space-between">
          <v-card-title class="text-h5 pa-0">Elever med handlingsplaner</v-card-title>
          <v-btn size="small" variant="tonal" prepend-icon="mdi-refresh" :loading="plansLoading" @click="loadPlans">
            Ladda
          </v-btn>
        </div>

        <v-progress-linear v-if="plansLoading" indeterminate color="primary" class="my-4" />
        <v-alert v-else-if="plansError" type="error" class="my-3">{{ plansError }}</v-alert>

        <v-table v-else-if="plans.length > 0" dense class="mt-3">
          <thead>
            <tr>
              <th class="text-left">Elev</th>
              <th class="text-left">Kurs</th>
              <th class="text-left">Lärare</th>
              <th class="text-left">Datum</th>
              <th class="text-left">Åtgärd</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="plan in plans" :key="plan._id">
              <td>{{ plan.studentName || '–' }}</td>
              <td>{{ plan.courseName || '–' }}</td>
              <td>{{ plan.teacherName || '–' }}</td>
              <td>{{ formatDate(plan.date || plan.createdAt) }}</td>
              <td>
                <v-btn size="x-small" variant="tonal" @click="viewPlan(plan)">Visa PDF</v-btn>
              </td>
            </tr>
          </tbody>
        </v-table>

        <v-alert v-else-if="!plansLoading" type="info" class="my-3">Inga handlingsplaner hittades.</v-alert>
      </v-card>

      <!-- Form questions editor -->
      <v-card class="pa-5">
        <v-card-title class="text-h5 pa-0">Frågemallar</v-card-title>
        <v-card-text class="pa-0 mt-3">
          <v-btn size="small" variant="tonal" prepend-icon="mdi-refresh" :loading="formLoading" @click="loadFormQuestions">
            Ladda mall
          </v-btn>

          <v-progress-linear v-if="formLoading" indeterminate color="primary" class="my-4" />
          <v-alert v-else-if="formError" type="error" class="my-3">{{ formError }}</v-alert>

          <div v-if="formConfig" class="mt-3">
            <v-alert type="info" density="compact" class="mb-3">
              Ändringar sparas som en ny version av mallen och påverkar nya handlingsplaner.
            </v-alert>
            <div v-for="(q, idx) in formConfig.questions" :key="idx" class="question-editor mb-3 pa-3">
              <div class="d-flex align-center ga-2 mb-2">
                <v-text-field v-model="q.label" label="Frågetext" density="compact" variant="outlined" hide-details class="flex-grow-1" />
                <v-checkbox v-model="q.required" label="Obligatorisk" density="compact" hide-details />
                <v-btn icon="mdi-delete-outline" aria-label="Ta bort fråga" variant="text" color="error" @click="removeQuestion(idx)" />
              </div>
              <div class="d-flex align-center ga-2">
                <v-text-field v-model="q.key" label="Nyckel" density="compact" variant="outlined" hide-details />
                <v-select v-model="q.type" :items="questionTypes" label="Typ" density="compact" variant="outlined" hide-details />
              </div>
            </div>
            <div class="d-flex flex-wrap ga-2">
              <v-btn variant="outlined" prepend-icon="mdi-plus" @click="addQuestion">Lägg till fråga</v-btn>
              <v-btn color="primary" :loading="formSaving" @click="saveFormQuestions">Spara mall</v-btn>
            </div>
            <v-alert v-if="formSaveError" type="error" density="compact" class="mt-3">{{ formSaveError }}</v-alert>
          </div>
        </v-card-text>
      </v-card>
    </v-container>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import client from '@/api/client.js'
import { useToast } from '@/composables/useToast.js'

const toast = useToast()

const plans = ref([])
const plansLoading = ref(true)
const plansError = ref(null)

const formConfig = ref(null)
const formLoading = ref(false)
const formSaving = ref(false)
const formError = ref(null)
const formSaveError = ref(null)
const questionTypes = ['text', 'textarea', 'date', 'select', 'radio']

const formatDate = (d) => d ? new Date(d).toLocaleDateString('sv-SE') : '–'

const addQuestion = () => {
  formConfig.value.questions.push({
    key: `question${formConfig.value.questions.length + 1}`,
    label: 'Ny fråga',
    type: 'text',
    required: false,
  })
}

const removeQuestion = (index) => {
  formConfig.value.questions.splice(index, 1)
}

const saveFormQuestions = async () => {
  formSaveError.value = null
  const questions = formConfig.value?.questions || []
  if (!questions.length || questions.some((q) => !q.key?.trim() || !q.label?.trim())) {
    formSaveError.value = 'Varje fråga måste ha en nyckel och frågetext.'
    return
  }
  formSaving.value = true
  try {
    await client.put('/form-questions/ACTION_PLAN', { questions })
    toast.success('Frågemallen sparades.')
  } catch (err) {
    formSaveError.value = err.response?.data?.message || 'Kunde inte spara frågemallen.'
    toast.error(formSaveError.value)
  } finally {
    formSaving.value = false
  }
}

const loadPlans = async () => {
  plansLoading.value = true
  plansError.value = null
  try {
    const { data } = await client.get('/students')
    const students = Array.isArray(data) ? data : []
    const allPlans = []
    for (const s of students) {
      try {
        const { data: p } = await client.get(`/actionplans/${s._id}`)
        if (Array.isArray(p) && p.length > 0) {
          allPlans.push(...p.map((plan) => ({ ...plan, studentName: s.name })))
        }
      } catch { /* skip */ }
    }
    plans.value = allPlans
  } catch (err) {
    plansError.value = 'Kunde inte hämta handlingsplaner.'
    toast.error(plansError.value)
  } finally {
    plansLoading.value = false
  }
}

const viewPlan = async (plan) => {
  if (!plan.studentId) return
  try {
    const { data } = await client.get(`/actionplan/${plan.studentId}/pdf`, { responseType: 'blob' })
    const url = URL.createObjectURL(new Blob([data], { type: 'application/pdf' }))
    const link = document.createElement('a')
    link.href = url
    link.download = `handlingsplan-${plan.studentId}.pdf`
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)
  } catch {
    toast.error('Kunde inte ladda ner handlingsplanen.')
  }
}

const loadFormQuestions = async () => {
  formLoading.value = true
  formError.value = null
  try {
    const { data } = await client.get('/form-questions/ACTION_PLAN')
    formConfig.value = data
  } catch (err) {
    formError.value = 'Kunde inte hämta frågemall.'
    toast.error(formError.value)
  } finally {
    formLoading.value = false
  }
}

onMounted(() => {
  loadPlans()
  loadFormQuestions()
})
</script>
