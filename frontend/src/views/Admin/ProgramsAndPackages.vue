<template>
  <div class="scrollable-view">
    <v-container class="py-5">
      <v-card class="pa-5">
        <div class="d-flex align-center justify-space-between">
          <v-card-title class="text-h4 font-weight-bold pa-0">Kursförpackningar</v-card-title>
          <v-btn color="primary" prepend-icon="mdi-plus" @click="openCreate">
            Ny kursförpackning
          </v-btn>
        </div>

        <v-progress-linear v-if="loading" indeterminate color="primary" class="my-5"></v-progress-linear>

        <v-alert v-else-if="error" type="error" class="my-3">{{ error }}</v-alert>

        <v-table v-else dense class="mt-4">
          <thead>
            <tr>
              <th class="text-left">Namn</th>
              <th class="text-left">Kod</th>
              <th class="text-left">Poäng</th>
              <th class="text-left">Omfattning</th>
              <th class="text-left">Kurser</th>
              <th class="text-left">Åtgärder</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="coursePackage in packages" :key="coursePackage._id">
              <td>
                <strong>{{ coursePackage.coursePackageName }}</strong>
              </td>
              <td>{{ coursePackage.coursePackageCode }}</td>
              <td>{{ coursePackage.coursePackagePoints || '–' }}</td>
              <td>{{ coursePackage.coursePackageExtent || '–' }}</td>
              <td>
                <v-chip
                  v-for="course in coursePackage.coursePackageCourses"
                  :key="course._id"
                  size="small"
                  variant="tonal"
                  class="mr-1"
                >
                  {{ course.courseName }}
                </v-chip>
                <span v-if="!coursePackage.coursePackageCourses?.length">–</span>
              </td>
              <td>
                <v-btn size="small" variant="text" @click="openEdit(coursePackage)">Redigera</v-btn>
                <v-btn size="small" variant="text" color="error" @click="confirmDelete(coursePackage)">
                  Ta bort
                </v-btn>
              </td>
            </tr>
            <tr v-if="packages.length === 0">
              <td colspan="6" class="text-center text-grey">Inga kursförpackningar ännu.</td>
            </tr>
          </tbody>
        </v-table>
      </v-card>
    </v-container>

    <!-- Create / Edit Modal -->
    <v-dialog v-model="showModal" max-width="600">
      <v-card>
        <v-card-title>{{ editing ? 'Redigera kursförpackning' : 'Ny kursförpackning' }}</v-card-title>
        <v-card-text>
          <v-form @submit.prevent="save">
            <v-text-field
              v-model="form.coursePackageName"
              label="Namn *"
              required
              :error-messages="validationErrors.coursePackageName"
            />
            <v-text-field
              v-model="form.coursePackageCode"
              label="Kod *"
              required
              :error-messages="validationErrors.coursePackageCode"
            />
            <v-text-field
              v-model="form.coursePackagePoints"
              label="Poäng *"
              required
              :error-messages="validationErrors.coursePackagePoints"
            />
            <v-text-field
              v-model="form.coursePackageExtent"
              label="Omfattning *"
              required
              :error-messages="validationErrors.coursePackageExtent"
            />
            <v-select
              v-model="form.coursePackageCourses"
              :items="courseOptions"
              label="Kurser"
              item-title="title"
              item-value="value"
              multiple
              clearable
            />
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
        <v-card-title>Ta bort kursförpackning</v-card-title>
        <v-card-text>
          Är du säker på att du vill ta bort "{{ pendingDelete?.coursePackageName }}"? Detta kan inte ångras.
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

  const packages = ref([])
  const courses = ref([])
  const loading = ref(true)
  const error = ref(null)
  const showModal = ref(false)
  const showDeleteModal = ref(false)
  const editing = ref(null)
  const pendingDelete = ref(null)
  const saving = ref(false)
  const deleting = ref(false)
  const validationErrors = ref({})

  const courseOptions = computed(() =>
    courses.value.map((course) => ({
      title: `${course.courseName} (${course.courseCode})`,
      value: course._id,
    }))
  )

  const form = ref({
    coursePackageName: '',
    coursePackageCode: '',
    coursePackagePoints: '',
    coursePackageExtent: '',
    coursePackageCourses: [],
  })

  const fetchPackages = async () => {
    try {
      const response = await client.get('/coursepackages')
      packages.value = response.data
    } catch (err) {
      error.value = err.response?.data?.message || 'Kunde inte hämta kursförpackningar.'
    } finally {
      loading.value = false
    }
  }

  const fetchCourses = async () => {
    try {
      const response = await client.get('/courses')
      courses.value = response.data
    } catch (err) {
      console.error('Error fetching courses:', err)
    }
  }

  const openCreate = () => {
    editing.value = null
    validationErrors.value = {}
    form.value = {
      coursePackageName: '',
      coursePackageCode: '',
      coursePackagePoints: '',
      coursePackageExtent: '',
      coursePackageCourses: [],
    }
    showModal.value = true
  }

  const openEdit = (coursePackage) => {
    editing.value = coursePackage
    validationErrors.value = {}
    form.value = {
      coursePackageName: coursePackage.coursePackageName,
      coursePackageCode: coursePackage.coursePackageCode,
      coursePackagePoints: coursePackage.coursePackagePoints || '',
      coursePackageExtent: coursePackage.coursePackageExtent || '',
      coursePackageCourses: (coursePackage.coursePackageCourses || []).map((course) =>
        typeof course === 'string' ? course : course._id
      ),
    }
    showModal.value = true
  }

  const save = async () => {
    validationErrors.value = {}
    for (const field of ['coursePackageName', 'coursePackageCode', 'coursePackagePoints', 'coursePackageExtent']) {
      if (!form.value[field] || !form.value[field].trim()) {
        validationErrors.value[field] = 'Obligatoriskt fält.'
        return
      }
    }

    saving.value = true
    try {
      const payload = {
        coursePackageName: form.value.coursePackageName.trim(),
        coursePackageCode: form.value.coursePackageCode.trim(),
        coursePackagePoints: form.value.coursePackagePoints.trim(),
        coursePackageExtent: form.value.coursePackageExtent.trim(),
        coursePackageCourses: form.value.coursePackageCourses || [],
      }
      if (editing.value) {
        await client.put(`/coursepackages/${editing.value._id}`, payload)
        toast.success('Kursförpackningen uppdaterades.')
      } else {
        await client.post('/coursepackages', payload)
        toast.success('Kursförpackningen skapades.')
      }
      showModal.value = false
      await fetchPackages()
    } catch (err) {
      console.error('Error saving course package:', err)
      toast.error('Ett fel uppstod när kursförpackningen skulle sparas.')
    } finally {
      saving.value = false
    }
  }

  const confirmDelete = (coursePackage) => {
    pendingDelete.value = coursePackage
    showDeleteModal.value = true
  }

  const remove = async () => {
    deleting.value = true
    try {
      await client.delete(`/coursepackages/${pendingDelete.value._id}`)
      packages.value = packages.value.filter((cp) => cp._id !== pendingDelete.value._id)
      showDeleteModal.value = false
      toast.success('Kursförpackningen togs bort.')
    } catch (err) {
      console.error('Error deleting course package:', err)
      toast.error('Ett fel uppstod när kursförpackningen skulle tas bort.')
    } finally {
      deleting.value = false
    }
  }

  onMounted(async () => {
    await Promise.all([fetchPackages(), fetchCourses()])
  })
</script>
