<template>
  <div class="scrollable-view">
    <v-container class="my-5">
      <h2 class="mb-4">Anmälan till prövning</h2>
      <v-form class="pa-4" elevation="1" @submit.prevent="submitForm">
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
          <v-col v-if="showMaterialCheckbox" cols="12">
            <v-checkbox
              v-model="form.materialReceived.status"
              label="Material hämtat (SVE 1 eller 3)"
            />
          </v-col>

          <!-- Submit -->
          <v-col cols="12" class="text-end mt-4">
            <v-btn type="submit" color="primary" :loading="isSubmitting" :disabled="!canSubmit">Registrera</v-btn>
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
  const isSubmitting = ref(false)
  const selectedStudent = ref(null)
  const searchQuery = ref('')
  const selectedCourse = ref(null)
  const fetchState = ref(false)

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
    studentId: '',
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

  const canSubmit = computed(() => {
    return selectedStudent.value && form.value.requestedMonth && form.value.teacherId
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
    isLoading.value = true

    try {
      const studentsResponse = await client.get('/students')
      students.value = studentsResponse.data
    } catch {
      toast.error('Kunde inte hämta elever')
    } finally {
      isLoading.value = false
    }
  }

  watch(selectedStudent, (newStudent) => {
    if (!newStudent) {
      selectedCourse.value = null
      form.value.course = ''
      form.value.teacherId = ''
      form.value.studentId = ''
      return
    }

    form.value.name = newStudent.name || ''
    form.value.personalNumber = newStudent.personalNumber || ''
    form.value.phone = newStudent.phone || ''
    form.value.email = newStudent.email || ''
    form.value.municipality = newStudent.municipality?.type || ''
    form.value.studentId = newStudent._id || ''
    form.value.teacherId = newStudent.teacherId || ''

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
        .filter((t) => t.userId && t.userId.username)
        .map((t) => ({
          ...t,
          userId: {
            username: t.userId.username,
          },
          _id: t._id,
        }))
    } catch {
      toast.error('Kunde inte hämta lärare')
    }
  }

  const submitForm = async () => {
    if (!canSubmit.value) return

    isSubmitting.value = true
    try {
      const payload = { ...form.value }

      if (payload.materialReceived?.status) {
        payload.materialReceived.receivedDate = new Date()
      } else {
        payload.materialReceived = { status: false, receivedDate: null }
      }

      if (payload.teacherId === '') delete payload.teacherId
      if (payload.studentId === '') delete payload.studentId
      if (payload.paymentDate === '') delete payload.paymentDate

      await client.post('/exams', payload)
      toast.success('Registreringen lyckades!')

      selectedStudent.value = null
      selectedCourse.value = null
      form.value = {
        name: '',
        personalNumber: '',
        phone: '',
        email: '',
        address: '',
        course: '',
        requestedMonth: '',
        municipality: '',
        teacherId: '',
        studentId: '',
        materialReceived: { status: false, receivedDate: null },
        paymentDate: '',
      }
    } catch (err) {
      const msg = err.response?.data?.error || 'Fel vid registrering.'
      toast.error(msg)
    } finally {
      isSubmitting.value = false
    }
  }

  onMounted(() => {
    fetchTeachers()
    fetchInitialData()
  })
</script>
