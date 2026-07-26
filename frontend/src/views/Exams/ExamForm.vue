<template>
  <div class="scrollable-view">
    <v-container class="my-5">
      <h2 class="mb-4">Anmälan till prövning</h2>
      <v-form @submit.prevent="submitForm" class="pa-4" elevation="1">
        <v-row dense>
          <!-- Elev -->
          <v-col cols="12">
            <v-autocomplete
              v-model="selectedStudent"
              :items="filteredStudents"
              :search="searchQuery"
              item-title="name"
              item-value="_id"
              label="Välj elev"
              return-object
              outlined
              :no-data-text="'Skriv elevnamn'"
              @update:search="searchQuery = $event"
            />
          </v-col>

          <!-- Personnummer & Telefon -->
          <v-col cols="12" md="6">
            <v-text-field :model-value="form.personalNumber" label="Personnummer" readonly outlined />
          </v-col>
          <v-col cols="12" md="6">
            <v-text-field :model-value="form.phone" label="Telefonnummer" readonly outlined />
          </v-col>

          <!-- Email -->
          <v-col cols="12">
            <v-text-field :model-value="form.email" label="E-post" readonly outlined />
          </v-col>

          <!-- Kurs -->
          <v-col cols="12">
            <v-autocomplete
              v-model="selectedCourse"
              :items="availableCourses"
              item-title="title"
              item-value="value"
              label="Kurs"
              outlined
              disabled
            />
          </v-col>

          <!-- Kommun & Lärare -->
          <v-col cols="12" md="6">
            <v-text-field v-model="form.municipality" label="Kommun" readonly outlined />
          </v-col>
          <v-col cols="12" md="6">
            <v-autocomplete
              v-model="form.teacherId"
              :items="teachers"
              item-title="userId.username"
              item-value="_id"
              label="Ansvarig lärare"
              outlined
              disabled
            />
          </v-col>

          <!-- Månad & Betalningsdatum -->
          <v-col cols="12" md="6">
            <v-autocomplete
              v-model="form.requestedMonth"
              :items="months"
              label="Önskad månad"
              outlined
            />
          </v-col>
          <v-col cols="12" md="6">
            <v-text-field v-model="form.paymentDate" label="Betalningsdatum" type="date" outlined />
          </v-col>

          <!-- Material checkbox -->
          <v-col cols="12" v-if="showMaterialCheckbox">
            <v-checkbox
              v-model="form.materialReceived.status"
              label="Material hämtat (SVE 1 eller 3)"
            />
          </v-col>

          <!-- Submit -->
          <v-col cols="12" class="text-end mt-4">
            <v-btn type="submit" color="primary">Registrera</v-btn>
          </v-col>
        </v-row>
      </v-form>
    </v-container>
  </div>
</template>

<script setup>
  import { ref, computed, onMounted, watch } from 'vue'
  import client from '@/api/client.js'
  import { useToast } from '@/composables/useToast.js'

  const toast = useToast()

  const students = ref([])
  const teachers = ref([])
  const isLoading = ref(false)
  const selectedStudent = ref(null)
  const searchQuery = ref('')
  const selectedCourse = ref(null)

  const form = ref({
    name: '',
    personalNumber: '',
    phone: '',
    email: '',
    address: '',
    course: '',
    requestedMonth: '',
    municipality: '',
    teacherId: '',
    materialReceived: { status: false, receivedDate: null },
    paymentDate: '',
  })

  const months = [
    'Januari',
    'Februari',
    'Mars',
    'April',
    'Maj',
    'Juni',
    'Juli',
    'Augusti',
    'September',
    'Oktober',
    'November',
    'December',
  ]

  const showMaterialCheckbox = computed(() => {
    const selected = availableCourses.value.find((c) => c.value === selectedCourse.value)
    const title = selected?.title?.toLowerCase() || ''
    return title.includes('sve')
  })

  const filteredStudents = computed(() => {
    if (!searchQuery.value) return students.value
    return students.value.filter((student) =>
      student.name.toLowerCase().includes(searchQuery.value.toLowerCase())
    )
  })

  const fetchInitialData = async () => {
    if (fetchState.value) return
    fetchState.value = true

    try {
      console.log('🔍 Fetching all students to filter them for autocomplete ...')
      const [studentsResponse] = await Promise.all([
        await client.get('/students'),
      ])

      students.value = studentsResponse.data

      console.log('✅ Students loaded:', students.value)
    } catch (error) {
      console.error('❌ Error fetching initial data:', error)
    } finally {
      isLoading.value = false
    }
  }

  const fetchState = ref(false) // Prevent multiple fetches

  watch(selectedStudent, (newStudent) => {
    console.log('👤 Selected student:', newStudent)

    // 🧹 Clear related fields when deselected
    if (!newStudent) {
      selectedCourse.value = null
      form.value.course = ''
      form.value.teacherId = ''
      return
    }

    // Grundläggande info
    form.value.name = newStudent.name || ''
    form.value.personalNumber = newStudent.personalNumber || ''
    form.value.phone = newStudent.phone || ''
    form.value.email = newStudent.email || ''
    form.value.municipality = newStudent.municipality?.type || ''

    form.value.teacherId = newStudent.teacherId || ''

    // Försök välja första utbildning
    const edu = (newStudent.education || []).find(
      (e) => !e.removedAt && ['Course', 'CoursePackage', 'Program'].includes(e.type)
    )

    if (edu) {
      selectedCourse.value = edu.refId?._id || edu._id
      if (edu.refId?.courseName) {
        form.value.course = `${edu.refId.courseName} (${edu.refId.courseCode})`
      } else {
        form.value.course = edu.name || ''
      }
    } else {
      selectedCourse.value = null
      form.value.course = ''
    }
  })

  const availableCourses = computed(() => {
    if (!selectedStudent.value?.education) return []

    return selectedStudent.value.education
      .filter((e) => !e.removedAt)
      .map((e) => {
        let title = ''
        if (e.type === 'Course') {
          title = e.refId?.courseName ? `${e.refId.courseName} (${e.refId.courseCode})` : e.name
        } else if (e.type === 'CoursePackage') {
          title = e.refId?.coursePackageName || e.name
        } else if (e.type === 'Program') {
          title = e.refId?.programName || e.name
        }
        return {
          title: title || 'Okänd utbildning',
          value: e.refId?._id || e._id,
          type: e.type,
        }
      })
  })

  watch(selectedCourse, (newCourseId) => {
    const selected = availableCourses.value.find((c) => c.value === newCourseId)
    form.value.course = selected?.title || ''
  })

  const fetchTeachers = async () => {
    try {
      const res = await client.get('/teachers')
      teachers.value = res.data
        .filter((t) => t.userId && t.userId.username) // skip malformed ones
        .map((t) => ({
          ...t,
          userId: {
            username: t.userId.username,
          },
          _id: t._id,
        }))

      console.log('👨‍🏫 Teachers fetched:', teachers.value)
    } catch (err) {
      console.error('Kunde inte hämta lärare:', err)
    }
  }

  watch(
    teachers,
    (newVal) => {
      console.log('👨‍🏫 Teachers in frontend:', newVal)
    },
    { deep: true, immediate: true }
  )

  const submitForm = async () => {
    try {
      if (form.value.materialReceived?.status) {
        form.value.materialReceived.receivedDate = new Date()
      } else {
        form.value.materialReceived = { status: false, receivedDate: null }
      }

      // Clean up the form data before sending
      const formData = { ...form.value }

      // Handle empty teacherId - convert empty string to null/undefined
      if (formData.teacherId === '') {
        delete formData.teacherId
      }

      // Handle empty paymentDate
      if (formData.paymentDate === '') {
        delete formData.paymentDate
      }

      console.log('Skickar:', formData)
      await client.post('/exams', formData)
      toast.success('Registreringen lyckades!')
      Object.keys(form.value).forEach(
        (key) => (form.value[key] = typeof form.value[key] === 'boolean' ? false : '')
      )
    } catch (err) {
      console.error(err)
      toast.error('Fel vid registrering.')
    }
  }

  onMounted(fetchTeachers)
  onMounted(fetchInitialData)
</script>
