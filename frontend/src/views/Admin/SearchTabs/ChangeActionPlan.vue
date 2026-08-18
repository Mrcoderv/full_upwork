<template>
  <v-card class="pa-6" elevation="2" rounded="lg">
    <div class="d-flex align-center justify-space-between mb-4">
      <div>
        <h2 class="text-h5 font-weight-bold">Konfiguration av handlingsplansfrågor</h2>
        <p class="text-body-2 text-medium-emphasis">
          Systemadministratör kan lägga till, redigera, sortera och ta bort frågor för handlingsplaner.
        </p>
      </div>
      <div class="d-flex gap-2">
        <v-btn
          color="primary"
          variant="elevated"
          prepend-icon="mdi-plus"
          @click="addQuestion"
        >
          Lägg till fråga
        </v-btn>
        <v-btn
          color="success"
          variant="elevated"
          prepend-icon="mdi-content-save"
          :loading="saving"
          @click="submitQuestions"
        >
          Spara ändringar
        </v-btn>
      </div>
    </div>

    <v-divider class="mb-6" />

    <div v-if="loading" class="text-center py-6">
      <v-progress-circular indeterminate color="primary" />
      <div class="mt-2 text-body-2 text-medium-emphasis">Laddar frågemall...</div>
    </div>

    <div v-else>
      <div v-if="questions.length === 0" class="text-center py-6 text-grey">
        Inga frågor konfigurerade. Klicka på "Lägg till fråga" ovan.
      </div>

      <div
        v-for="(question, index) in questions"
        :key="question.key || index"
        class="mb-4"
      >
        <v-card variant="outlined" class="pa-4 bg-grey-lighten-5">
          <div class="d-flex align-center justify-space-between mb-3">
            <div class="d-flex align-center gap-2">
              <v-chip size="small" color="primary" variant="flat">
                Fråga {{ index + 1 }}
              </v-chip>
              <span class="text-caption text-medium-emphasis">Nyckel: {{ question.key }}</span>
            </div>
            <div class="d-flex align-center gap-1">
              <v-btn
                icon="mdi-arrow-up"
                size="small"
                variant="text"
                :disabled="index === 0"
                @click="moveQuestion(index, -1)"
              />
              <v-btn
                icon="mdi-arrow-down"
                size="small"
                variant="text"
                :disabled="index === questions.length - 1"
                @click="moveQuestion(index, 1)"
              />
              <v-btn
                icon="mdi-delete"
                size="small"
                color="error"
                variant="text"
                @click="removeQuestion(index)"
              />
            </div>
          </div>

          <v-row>
            <v-col cols="12" md="6">
              <v-text-field
                v-model="question.label"
                label="Frågetext / Etikett *"
                variant="outlined"
                density="comfortable"
                required
              />
            </v-col>
            <v-col cols="12" md="3">
              <v-select
                v-model="question.type"
                :items="questionTypes"
                item-title="label"
                item-value="value"
                label="Frågetyp *"
                variant="outlined"
                density="comfortable"
                required
              />
            </v-col>
            <v-col cols="12" md="3" class="d-flex align-center">
              <v-switch
                v-model="question.required"
                label="Obligatorisk"
                color="primary"
                density="comfortable"
                hide-details
              />
            </v-col>
          </v-row>

          <!-- Options editor for Choice fields (select, radio, checkbox) -->
          <div
            v-if="['select', 'radio', 'checkbox'].includes(question.type)"
            class="mt-3 pa-3 bg-white rounded border"
          >
            <div class="d-flex align-center justify-space-between mb-2">
              <span class="text-subtitle-2 font-weight-bold">Svarsalternativ</span>
              <v-btn
                size="x-small"
                color="primary"
                variant="text"
                prepend-icon="mdi-plus"
                @click="addOption(index)"
              >
                Lägg till alternativ
              </v-btn>
            </div>

            <div
              v-for="(option, optIndex) in question.options"
              :key="optIndex"
              class="d-flex align-center gap-2 mb-2"
            >
              <v-text-field
                v-model="question.options[optIndex]"
                :placeholder="`Alternativ ${optIndex + 1}`"
                variant="outlined"
                density="compact"
                hide-details
              />
              <v-btn
                icon="mdi-close"
                size="x-small"
                variant="text"
                color="error"
                @click="removeOption(index, optIndex)"
              />
            </div>
            <div v-if="!question.options || question.options.length === 0" class="text-caption text-grey">
              Inga alternativ tillagda ännu.
            </div>
          </div>
        </v-card>
      </div>

      <div class="d-flex justify-space-between mt-4">
        <v-btn
          color="primary"
          variant="outlined"
          prepend-icon="mdi-plus"
          @click="addQuestion"
        >
          Lägg till ytterligare fråga
        </v-btn>
        <v-btn
          color="success"
          size="large"
          prepend-icon="mdi-content-save"
          :loading="saving"
          @click="submitQuestions"
        >
          Spara Frågekonfiguration
        </v-btn>
      </div>
    </div>
  </v-card>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import client from '@/api/client.js'
import { useToast } from '@/composables/useToast.js'

const toast = useToast()

const questions = ref([])
const loading = ref(false)
const saving = ref(false)

const questionTypes = [
  { label: 'Textrad (Kort text)', value: 'text' },
  { label: 'Textruta (Lång text)', value: 'textarea' },
  { label: 'Datum', value: 'date' },
  { label: 'Rullgardinsmeny (Välj ett)', value: 'select' },
  { label: 'Radioknappar (Välj ett)', value: 'radio' },
  { label: 'Kryssrutor (Välj flera)', value: 'checkbox' },
]

const generateKey = (label) => {
  const base = (label || 'fraga')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '_')
    .slice(0, 20)
  return `${base}_${Math.random().toString(36).substring(2, 6)}`
}

const fetchQuestions = async () => {
  loading.value = true
  try {
    const response = await client.get('/form-questions/ACTION_PLAN')
    if (response.data && response.data.questions) {
      questions.value = response.data.questions.map((q) => ({
        ...q,
        options: Array.isArray(q.options) ? [...q.options] : [],
      }))
    }
  } catch (error) {
    console.error('Kunde inte hämta frågor:', error)
    toast.error('Kunde inte hämta frågemallen.')
  } finally {
    loading.value = false
  }
}

const addQuestion = () => {
  questions.value.push({
    label: '',
    type: 'text',
    options: [],
    required: false,
    key: generateKey('fraga'),
  })
}

const removeQuestion = (index) => {
  questions.value.splice(index, 1)
}

const moveQuestion = (index, delta) => {
  const newIndex = index + delta
  if (newIndex < 0 || newIndex >= questions.value.length) return
  const item = questions.value.splice(index, 1)[0]
  questions.value.splice(newIndex, 0, item)
}

const addOption = (questionIndex) => {
  if (!questions.value[questionIndex].options) {
    questions.value[questionIndex].options = []
  }
  questions.value[questionIndex].options.push('')
}

const removeOption = (questionIndex, optionIndex) => {
  questions.value[questionIndex].options.splice(optionIndex, 1)
}

const submitQuestions = async () => {
  // Validate labels
  for (let i = 0; i < questions.value.length; i++) {
    if (!questions.value[i].label || !questions.value[i].label.trim()) {
      toast.error(`Fråga ${i + 1} saknar frågetext / etikett.`)
      return
    }
  }

  saving.value = true
  try {
    const cleanedQuestions = questions.value.map((q) => ({
      label: q.label.trim(),
      type: q.type,
      options: ['select', 'checkbox', 'radio'].includes(q.type)
        ? (q.options || []).filter((opt) => opt && opt.trim() !== '').map((opt) => opt.trim())
        : [],
      required: Boolean(q.required),
      key: q.key || generateKey(q.label),
    }))

    const response = await client.post('/form-questions', {
      type: 'ACTION_PLAN',
      questions: cleanedQuestions,
    })

    toast.success(response.data?.message || 'Frågekonfigurationen sparades!')
    await fetchQuestions()
  } catch (error) {
    console.error('Kunde inte spara frågor:', error)
    toast.error(error.response?.data?.error || error.message || 'Kunde inte spara frågemall.')
  } finally {
    saving.value = false
  }
}

onMounted(fetchQuestions)
</script>

<style scoped>
.gap-1 {
  gap: 4px;
}
.gap-2 {
  gap: 8px;
}
</style>
