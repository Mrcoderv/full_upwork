<template>
  <div class="scrollable-view">
    <v-container class="py-5">
      <v-card class="pa-5 mb-5">
        <v-card-title class="text-h4 font-weight-bold pa-0">Betygsuppföljning</v-card-title>
        <p class="text-body-2 text-grey mt-2">
          Låsta betyg, elevens betyg och kursinstansens betyg. Skrivskyddad vy för admin.
        </p>
      </v-card>

      <!-- Locked grades -->
      <v-card class="pa-5 mb-5">
        <div class="d-flex align-center justify-space-between">
          <v-card-title class="text-h5 pa-0">Låsta betyg</v-card-title>
          <v-btn size="small" variant="tonal" prepend-icon="mdi-refresh" :loading="lockedLoading" @click="fetchLockedGrades">
            Ladda
          </v-btn>
        </div>

        <v-progress-linear v-if="lockedLoading" indeterminate color="primary" class="my-4"></v-progress-linear>
        <v-alert v-else-if="lockedError" type="error" class="my-3">{{ lockedError }}</v-alert>

        <v-table v-else dense class="mt-3">
          <thead>
            <tr>
              <th class="text-left">Elev</th>
              <th class="text-left">Kurs</th>
              <th class="text-left">Instans</th>
              <th class="text-left">Betyg</th>
              <th class="text-left">Låst av</th>
              <th class="text-left">Låst datum</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="grade in lockedGrades" :key="grade._id">
              <td>{{ grade.studentId?.name || '–' }}</td>
              <td>{{ grade.mainCourseId?.courseName || grade.courseInstanceId?.courseName || '–' }}</td>
              <td>{{ grade.courseInstanceId?.courseCode || '–' }}</td>
              <td>{{ grade.grade || '–' }}</td>
              <td>{{ grade.gradeLockedBy?.username || grade.gradeLockedBy?.email || '–' }}</td>
              <td>{{ formatDate(grade.gradeLockedAt) }}</td>
            </tr>
            <tr v-if="lockedGrades.length === 0">
              <td colspan="6" class="text-center text-grey">Inga låsta betyg.</td>
            </tr>
          </tbody>
        </v-table>
      </v-card>

      <!-- Per-student grades -->
      <v-card class="pa-5 mb-5">
        <v-card-title class="text-h5 pa-0">Elevens betyg</v-card-title>
        <v-card-text class="pa-0 mt-3">
          <div class="d-flex align-center gap-2">
            <v-select
              v-model="selectedStudentId"
              :items="studentOptions"
              label="Välj elev"
              item-title="title"
              item-value="value"
              class="flex-grow-1"
              clearable
              @update:modelValue="loadStudentGrades"
            />
          </div>

          <v-progress-linear v-if="studentLoading" indeterminate color="primary" class="my-4"></v-progress-linear>
          <v-alert v-else-if="studentError" type="error" class="my-3">{{ studentError }}</v-alert>

          <v-table v-else dense class="mt-3">
            <thead>
              <tr>
                <th class="text-left">Kurs</th>
                <th class="text-left">Instans</th>
                <th class="text-left">Betyg</th>
                <th class="text-left">Lärare</th>
                <th class="text-left">Satt av</th>
                <th class="text-left">Datum</th>
                <th class="text-left">Motivering</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="grade in studentGrades" :key="grade._id">
                <td>{{ grade.mainCourseId?.courseName || grade.courseInstanceId?.courseName || '–' }}</td>
                <td>{{ grade.courseInstanceId?.courseCode || '–' }}</td>
                <td>{{ grade.grade || '–' }}</td>
                <td>{{ grade.teacherId?.userId?.username || '–' }}</td>
                <td>{{ grade.gradeBy?.username || grade.gradeBy?.email || '–' }}</td>
                <td>{{ formatDate(grade.gradeDate) }}</td>
                <td>{{ grade.motivation || '–' }}</td>
              </tr>
              <tr v-if="selectedStudentId && studentGrades.length === 0">
                <td colspan="7" class="text-center text-grey">Eleven har inga betyg registrerade.</td>
              </tr>
              <tr v-if="!selectedStudentId">
                <td colspan="7" class="text-center text-grey">Välj en elev ovan för att se betyg.</td>
              </tr>
            </tbody>
          </v-table>
        </v-card-text>
      </v-card>

      <!-- Per-course-instance grades -->
      <v-card class="pa-5">
        <v-card-title class="text-h5 pa-0">Kursinstansens betyg</v-card-title>
        <v-card-text class="pa-0 mt-3">
          <div class="d-flex align-center gap-2">
            <v-select
              v-model="selectedInstanceId"
              :items="instanceOptions"
              label="Välj kursinstans"
              item-title="title"
              item-value="value"
              class="flex-grow-1"
              clearable
              @update:modelValue="loadInstanceGrades"
            />
          </div>

          <v-progress-linear v-if="instanceLoading" indeterminate color="primary" class="my-4"></v-progress-linear>
          <v-alert v-else-if="instanceError" type="error" class="my-3">{{ instanceError }}</v-alert>

          <v-table v-else dense class="mt-3">
            <thead>
              <tr>
                <th class="text-left">Elev</th>
                <th class="text-left">Kurs</th>
                <th class="text-left">Instans</th>
                <th class="text-left">Betyg</th>
                <th class="text-left">Lärare</th>
                <th class="text-left">Datum</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="grade in instanceGrades" :key="grade._id">
                <td>{{ grade.studentId?.name || '–' }}</td>
                <td>{{ grade.mainCourseId?.courseName || grade.courseInstanceId?.courseName || '–' }}</td>
                <td>{{ grade.courseInstanceId?.courseCode || '–' }}</td>
                <td>{{ grade.grade || '–' }}</td>
                <td>{{ grade.teacherId?.userId?.username || '–' }}</td>
                <td>{{ formatDate(grade.gradeDate) }}</td>
              </tr>
              <tr v-if="selectedInstanceId && instanceGrades.length === 0">
                <td colspan="6" class="text-center text-grey">Instansen har inga betyg registrerade.</td>
              </tr>
              <tr v-if="!selectedInstanceId">
                <td colspan="6" class="text-center text-grey">Välj en kursinstans ovan för att se betyg.</td>
              </tr>
            </tbody>
          </v-table>
        </v-card-text>
      </v-card>
    </v-container>
  </div>
</template>

<script setup>
  import { ref, computed, onMounted } from 'vue'
  import client from '@/api/client.js'
  import { useToast } from '@/composables/useToast.js'

  const toast = useToast()

  const lockedGrades = ref([])
  const lockedLoading = ref(true)
  const lockedError = ref(null)

  const students = ref([])
  const selectedStudentId = ref(null)
  const studentGrades = ref([])
  const studentLoading = ref(false)
  const studentError = ref(null)

  const instances = ref([])
  const selectedInstanceId = ref(null)
  const instanceGrades = ref([])
  const instanceLoading = ref(false)
  const instanceError = ref(null)

  const studentOptions = computed(() =>
    students.value.map((s) => ({
      title: `${s.name}${s.personalNumber ? ` - ${s.personalNumber}` : ''}`,
      value: s._id,
    }))
  )

  const instanceOptions = computed(() =>
    instances.value.map((instance) => ({
      title: `${instance.courseName}${instance.courseCode ? ` (${instance.courseCode})` : ''} - ${formatDate(instance.startDate)}`,
      value: instance._id,
    }))
  )

  const formatDate = (date) => {
    if (!date) return '–'
    const d = new Date(date)
    return d.toLocaleDateString('sv-SE')
  }

  const fetchLockedGrades = async () => {
    lockedLoading.value = true
    lockedError.value = null
    try {
      const response = await client.get('/locked-grades')
      lockedGrades.value = response.data.lockedGrades || []
    } catch (err) {
      console.error('Error fetching locked grades:', err)
      lockedError.value = 'Kunde inte hämta låsta betyg.'
      toast.error(lockedError.value)
    } finally {
      lockedLoading.value = false
    }
  }

  const loadStudentGrades = async (studentId) => {
    if (!studentId) {
      studentGrades.value = []
      return
    }
    studentLoading.value = true
    studentError.value = null
    try {
      const response = await client.get(`/student/${studentId}/grades`)
      studentGrades.value = response.data.grades || []
    } catch (err) {
      console.error('Error fetching student grades:', err)
      studentError.value = 'Kunde inte hämta elevens betyg.'
      toast.error(studentError.value)
    } finally {
      studentLoading.value = false
    }
  }

  const loadInstanceGrades = async (instanceId) => {
    if (!instanceId) {
      instanceGrades.value = []
      return
    }
    instanceLoading.value = true
    instanceError.value = null
    try {
      const response = await client.get(`/course-instance/${instanceId}/grades`)
      instanceGrades.value = response.data.grades || []
    } catch (err) {
      console.error('Error fetching instance grades:', err)
      instanceError.value = 'Kunde inte hämta kursinstansens betyg.'
      toast.error(instanceError.value)
    } finally {
      instanceLoading.value = false
    }
  }

  onMounted(async () => {
    await Promise.all([fetchLockedGrades()])
    try {
      const [studentsRes, instancesRes] = await Promise.all([
        client.get('/students'),
        client.get('/course-instances'),
      ])
      students.value = Array.isArray(studentsRes.data) ? studentsRes.data : []
      instances.value = Array.isArray(instancesRes.data) ? instancesRes.data : []
    } catch (err) {
      console.error('Error fetching lookups:', err)
      toast.error('Kunde inte hämta elever/kursinstanser.')
    }
  })
</script>
