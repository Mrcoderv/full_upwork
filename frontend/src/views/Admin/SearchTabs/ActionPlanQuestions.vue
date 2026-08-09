<template>
  <v-card class="pa-6" elevation="2" rounded="lg">
    <v-form @submit.prevent="submitPlan">
      <v-container fluid>
        <v-row
          v-for="(question, index) in questions"
          :key="index"
          class="mb-4 outlined"
          color="primary"
        >
          <v-col cols="12">
            <h4 class="text-subtitle-1 mb-2">{{ question.label }}</h4>

            <!-- Radio buttons -->
            <v-radio-group
              v-if="question.type === 'radio'"
              v-model="answers[question.key]"
              :inline="true"
              density="comfortable"
            >
              <v-radio
                v-for="option in question.options"
                :key="option"
                :label="option"
                :value="option"
                :color="primary"
                :class="outlined"
              />
            </v-radio-group>

            <!-- Checkboxes -->
            <div v-else-if="question.type === 'checkbox'">
              <v-checkbox
                v-for="option in question.options"
                :key="option"
                :label="option"
                :value="option"
                color="primary"
                class="outlined"
                v-model="answers[question.key]"
                density="comfortable"
              />
            </div>

            <!-- Select dropdown -->
            <v-select
              v-else-if="question.type === 'select'"
              :items="question.options"
              v-model="answers[question.key]"
              label="Välj ett alternativ"
              variant="outlined"
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
              color="primary"
              clearable
              :menu-props="{ maxHeight: '300px' }"
            />

            <!-- Text input -->
            <v-text-field
              v-else-if="question.type === 'text'"
              v-model="answers[question.key]"
              variant="outlined"
              label="Svar"
            />

            <!-- Date picker -->
            <v-text-field
              v-else-if="question.type === 'date'"
              type="date"
              v-model="answers[question.key]"
              variant="outlined"
              label="Datum"
              color="primary"
            />

            <!-- Textarea -->
            <v-textarea
              v-else-if="question.type === 'textarea'"
              v-model="answers[question.key]"
              variant="outlined"
              label="Kommentar"
              auto-grow
            />
          </v-col>
        </v-row>

        <v-row>
          <v-col cols="12" class="text-end">
            <v-btn
              type="button"
              variant="outlined"
              color="secondary"
              size="large"
              elevation="1"
              class="mr-3"
              @click="downloadPdf"
            >
              Ladda ner PDF
            </v-btn>
            <v-btn type="submit" color="primary" size="large" elevation="1">
              💾 Spara Handlingsplan
            </v-btn>
          </v-col>
        </v-row>
      </v-container>
    </v-form>
  </v-card>
</template>

<script setup>
  import { ref, onMounted, computed } from 'vue'
  import client from '@/api/client.js'
  import { useToast } from '@/composables/useToast.js'

  const toast = useToast()

  const questions = ref([])
  const answers = ref({})
  const teachers = ref([])

  const props = defineProps(['userData'])

  const selectedTeacherLabel = computed(
    () => teachers.value.find((t) => t._id === answers.value.teacherName)?.label || 'Okänd'
  )

  const targetEducation = computed(() => {
    if (!props.userData?.education || !props.userData.education.length) return null
    return props.userData.education.find((edu) => edu.locked) || props.userData.education[0]
  })

  const fetchTeachers = async () => {
    try {
      const res = await client.get('/teachers')
      teachers.value = res.data
        .filter((t) => t.userId && t.userId.username)
        .map((t) => ({
          _id: t._id,
          label: t.userId.username,
        }))
    } catch (error) {
      console.error('Kunde inte hämta lärare:', error)
    }
  }

  const fetchQuestions = async () => {
    try {
      const response = await client.get('/form-questions/ACTION_PLAN')
      if (response.data && response.data.questions) {
        questions.value = response.data.questions
        questions.value.forEach((q) => {
          if (q.type === 'checkbox') {
            answers.value[q.key] = []
          } else if (q.key === 'studentName') {
            answers.value[q.key] = props.userData.name || ''
          } else {
            answers.value[q.key] = ''
          }
        })
      }
    } catch (error) {
      console.error('Kunde inte hämta frågor:', error)
    }
  }

  onMounted(() => {
    fetchQuestions()
    fetchTeachers()
  })

  /*
    const getInputComponent = (type) => {
      switch (type) {
        case 'text':
        case 'date':
          return 'input'
        case 'textarea':
          return 'textarea'
        case 'select':
          return 'select' // Anpassa efter dina behov
      case 'radio':
              return 'radio'
        default:
          return 'input'
      }
    }
    */

  const downloadPdf = async () => {
    const studentId = props.userData?._id
    if (!studentId) {
      toast.error('Ingen studentdata hittades för att ladda ner handlingsplanen.')
      return
    }
    try {
      const res = await client.get(`/actionplan/${studentId}/pdf`, { responseType: 'blob' })
      const url = window.URL.createObjectURL(res.data)
      const link = document.createElement('a')
      link.href = url
      link.download = `handlingsplan-${studentId}.pdf`
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.URL.revokeObjectURL(url)
      toast.success('Handlingsplanen laddades ner som PDF!')
    } catch (error) {
      console.error('Kunde inte ladda ner handlingsplan:', error)
      toast.error(error.message || 'Kunde inte ladda ner handlingsplan.')
    }
  }

  const submitPlan = async () => {
    const studentId = props.userData?._id
    const educationId =
      targetEducation.value?.refId ||
      targetEducation.value?._id ||
      targetEducation.value?.educationId
    const courseId =
      targetEducation.value?.courseId ||
      targetEducation.value?.courseInstanceId ||
      targetEducation.value?.refId ||
      targetEducation.value?._id

    if (!studentId) {
      toast.error('Ingen studentdata hittades för att spara handlingsplanen.')
      return
    }

    if (!educationId) {
      toast.error('Kunde inte hitta någon utbildning kopplad till handlingsplanen.')
      return
    }

    const normalizedAnswers = { ...answers.value }
    if (normalizedAnswers.teacherName) {
      normalizedAnswers.teacherId = normalizedAnswers.teacherName
      normalizedAnswers.teacherName = selectedTeacherLabel.value
    }

    const payload = {
      studentId,
      educationId,
      ...normalizedAnswers,
    }

    if (courseId) {
      payload.courseId = courseId
    }

    try {
      await client.post('/save-actionplan', payload)
      await client.put(`/notifications/resolve/${studentId}`)
      toast.success('Handlingsplan sparad!')
    } catch (error) {
      console.error('Kunde inte spara handlingsplan:', error)
      console.error('Error response and message:', error.message)
      toast.error('Kunde inte spara handlingsplan.')
    }
  }
</script>

<style scoped>
  .nav-tabs {
    margin-bottom: 15px;
  }

  .form-label {
    margin-bottom: 0.5rem;
  }
</style>
