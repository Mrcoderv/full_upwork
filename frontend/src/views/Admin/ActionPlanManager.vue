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
            <div v-for="(q, idx) in formConfig.questions" :key="idx" class="mb-3 pa-3" style="border: 1px solid #e0e0e0; border-radius: 4px;">
              <div class="text-body-2 font-weight-bold">{{ q.label || q.key }}</div>
              <div class="text-caption text-grey">Typ: {{ q.type }}{{ q.required ? ' (obligatorisk)' : '' }}</div>
            </div>
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
const formError = ref(null)

const formatDate = (d) => d ? new Date(d).toLocaleDateString('sv-SE') : '–'

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

const viewPlan = (plan) => {
  if (!plan.studentId) return
  const url = `/api/actionplan/${plan.studentId}/pdf`
  window.open(url, '_blank')
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
