<template>
  <div class="scrollable-view">
    <v-container class="py-5">
      <v-card class="pa-5">
        <div class="d-flex align-center justify-space-between">
          <v-card-title class="text-h4 font-weight-bold pa-0">Kurskatalog</v-card-title>
          <v-btn color="primary" prepend-icon="mdi-plus" @click="openCreate">
            Ny kurs
          </v-btn>
        </div>

        <v-progress-linear v-if="loading" indeterminate color="primary" class="my-5"></v-progress-linear>

        <v-alert v-else-if="error" type="error" class="my-3">{{ error }}</v-alert>

        <v-table v-else dense class="mt-4">
          <thead>
            <tr>
              <th class="text-left">Kursnamn</th>
              <th class="text-left">Kod</th>
              <th class="text-left">Poäng</th>
              <th class="text-left">Omfattning</th>
              <th class="text-left">Program</th>
              <th class="text-left">Status</th>
              <th class="text-left">Åtgärder</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="course in courses" :key="course._id">
              <td>
                <strong>{{ course.courseName }}</strong>
              </td>
              <td>{{ course.courseCode }}</td>
              <td>{{ course.coursePoints || '–' }}</td>
              <td>{{ course.courseExtent || '–' }}</td>
              <td>
                <v-chip
                  v-for="p in programNames(course)"
                  :key="p._id"
                  size="small"
                  variant="tonal"
                  class="mr-1"
                >
                  {{ p.programName }}
                </v-chip>
                <span v-if="!programNames(course).length">–</span>
              </td>
              <td>
                <v-chip :color="course.isActive === false ? 'grey' : 'success'" size="small">
                  {{ course.isActive === false ? 'Inaktiv' : 'Aktiv' }}
                </v-chip>
              </td>
              <td>
                <v-btn size="small" variant="text" @click="openEdit(course)">Redigera</v-btn>
                <v-btn size="small" variant="text" color="error" @click="confirmDelete(course)">
                  Ta bort
                </v-btn>
              </td>
            </tr>
            <tr v-if="courses.length === 0">
              <td colspan="7" class="text-center text-grey">Inga kurser ännu.</td>
            </tr>
          </tbody>
        </v-table>
      </v-card>
    </v-container>

    <!-- Create / Edit Modal -->
    <v-dialog v-model="showModal" max-width="600">
      <v-card>
        <v-card-title>{{ editing ? 'Redigera kurs' : 'Ny kurs' }}</v-card-title>
        <v-card-text>
          <v-form @submit.prevent="save">
            <v-text-field
              v-model="form.courseName"
              label="Kursnamn *"
              required
              :error-messages="validationErrors.courseName"
            />
            <v-text-field
              v-model="form.courseCode"
              label="Kurskod *"
              required
              :error-messages="validationErrors.courseCode"
            />
            <v-text-field v-model="form.coursePoints" label="Poäng" />
            <v-text-field v-model="form.courseExtent" label="Omfattning" />
            <v-select
              v-model="form.programs"
              :items="programOptions"
              label="Program"
              item-title="title"
              item-value="value"
              multiple
              clearable
            />
            <v-checkbox v-model="form.isActive" label="Aktiv" hide-details class="mt-2" />
          </v-form>
        </v-card-text>
        <v-card-actions>
          <v-spacer></v-spacer>
          <v-btn variant="text" @click="showModal = false">Avbryt</v-btn>
          <v-btn color="primary" :loading="saving" @click="save">
            {{ editing ? 'Uppdatera' : 'Skapa' }}
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Delete Confirmation -->
    <v-dialog v-model="showDeleteModal" max-width="400">
      <v-card>
        <v-card-title>Ta bort kurs</v-card-title>
        <v-card-text>
          Är du säker på att du vill ta bort "{{ pendingDelete?.courseName }}"? Detta kan inte ångras.
        </v-card-text>
        <v-card-actions>
          <v-spacer></v-spacer>
          <v-btn variant="text" @click="showDeleteModal = false">Avbryt</v-btn>
          <v-btn color="error" :loading="deleting" @click="remove">Ta bort</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </div>
</template>

<script setup>
  import { ref, computed, onMounted } from 'vue'
  import client from '@/api/client.js'
  import { useToast } from '@/composables/useToast.js'

  const toast = useToast()

  const courses = ref([])
  const programs = ref([])
  const loading = ref(true)
  const error = ref(null)
  const showModal = ref(false)
  const showDeleteModal = ref(false)
  const editing = ref(null)
  const pendingDelete = ref(null)
  const saving = ref(false)
  const deleting = ref(false)
  const validationErrors = ref({})

  const programOptions = computed(() =>
    programs.value.map((program) => ({
      title: program.programName,
      value: program._id,
    }))
  )

  const programNames = (course) =>
    programs.value.filter((program) => (course.programs || []).includes(program._id))

  const form = ref({
    courseName: '',
    courseCode: '',
    coursePoints: '',
    courseExtent: '',
    programs: [],
    isActive: true,
  })

  const fetchCourses = async () => {
    try {
      const response = await client.get('/courses')
      courses.value = response.data
    } catch (err) {
      console.error('Error fetching courses:', err)
      error.value = 'Kunde inte hämta kurser.'
    } finally {
      loading.value = false
    }
  }

  const fetchPrograms = async () => {
    try {
      const response = await client.get('/programs')
      programs.value = response.data
    } catch (err) {
      console.error('Error fetching programs:', err)
    }
  }

  const openCreate = () => {
    editing.value = null
    validationErrors.value = {}
    form.value = {
      courseName: '',
      courseCode: '',
      coursePoints: '',
      courseExtent: '',
      programs: [],
      isActive: true,
    }
    showModal.value = true
  }

  const openEdit = (course) => {
    editing.value = course
    validationErrors.value = {}
    form.value = {
      courseName: course.courseName,
      courseCode: course.courseCode,
      coursePoints: course.coursePoints || '',
      courseExtent: course.courseExtent || '',
      programs: (course.programs || []).map((p) => (typeof p === 'string' ? p : p._id)),
      isActive: course.isActive !== false,
    }
    showModal.value = true
  }

  const save = async () => {
    validationErrors.value = {}
    if (!form.value.courseName || !form.value.courseName.trim()) {
      validationErrors.value.courseName = 'Kursnamn är obligatoriskt.'
      return
    }
    if (!form.value.courseCode || !form.value.courseCode.trim()) {
      validationErrors.value.courseCode = 'Kurskod är obligatorisk.'
      return
    }

    saving.value = true
    try {
      const payload = {
        courseName: form.value.courseName.trim(),
        courseCode: form.value.courseCode.trim(),
        coursePoints: form.value.coursePoints || undefined,
        courseExtent: form.value.courseExtent || undefined,
        programs: form.value.programs || [],
        isActive: form.value.isActive,
      }
      if (editing.value) {
        await client.put(`/course/${editing.value._id}`, payload)
        toast.success('Kursen uppdaterades.')
      } else {
        await client.post('/course', payload)
        toast.success('Kursen skapades.')
      }
      showModal.value = false
      await fetchCourses()
    } catch (err) {
      console.error('Error saving course:', err)
      toast.error('Ett fel uppstod när kursen skulle sparas.')
    } finally {
      saving.value = false
    }
  }

  const confirmDelete = (course) => {
    pendingDelete.value = course
    showDeleteModal.value = true
  }

  const remove = async () => {
    deleting.value = true
    try {
      await client.delete(`/course/${pendingDelete.value._id}`)
      courses.value = courses.value.filter((course) => course._id !== pendingDelete.value._id)
      showDeleteModal.value = false
      toast.success('Kursen togs bort.')
    } catch (err) {
      console.error('Error deleting course:', err)
      toast.error('Ett fel uppstod när kursen skulle tas bort.')
    } finally {
      deleting.value = false
    }
  }

  onMounted(async () => {
    await Promise.all([fetchCourses(), fetchPrograms()])
  })
</script>
