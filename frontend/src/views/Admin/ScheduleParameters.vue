<template>
  <div class="scrollable-view">
    <v-container class="py-5">
      <v-card class="pa-5">
        <div class="d-flex align-center justify-space-between">
          <v-card-title class="text-h4 font-weight-bold pa-0">Schemaparametrar</v-card-title>
          <v-btn color="primary" prepend-icon="mdi-plus" @click="openCreate">
            Ny uppsättning
          </v-btn>
        </div>

        <p class="text-body-2 text-grey mt-2">
          Bestämmer vecko-offsets för de 5 modulerna när en kursinstans skapas automatiskt vid
          elevinskrivning (används för att beräkna sektions-/provdatum). Längden måste vara 5, 10
          eller 20 veckor.
        </p>

        <v-progress-linear v-if="loading" indeterminate color="primary" class="my-5"></v-progress-linear>

        <v-alert v-else-if="error" type="error" class="my-3">{{ error }}</v-alert>

        <v-table v-else dense class="mt-4">
          <thead>
            <tr>
              <th class="text-left">Lärare</th>
              <th class="text-left">Kurs</th>
              <th class="text-left">Längd</th>
              <th class="text-left">Offsets (veckor)</th>
              <th class="text-left">Åtgärder</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="entry in entries" :key="`${entry.teacherId}-${entry.courseId}-${entry.lengthWeeks}`">
              <td>{{ teacherName(entry.teacherId) }}</td>
              <td>{{ courseName(entry.courseId) }}</td>
              <td>{{ entry.lengthWeeks }} v</td>
              <td>
                <v-chip v-for="(offset, i) in entry.sectionOffsets" :key="i" size="small" variant="tonal" class="mr-1">
                  {{ i + 1 }}: v{{ offset }}
                </v-chip>
                <span v-if="!entry.sectionOffsets || !entry.sectionOffsets.length">(standardfördelning)</span>
              </td>
              <td>
                <v-btn size="small" variant="text" @click="openEdit(entry)">Redigera</v-btn>
                <v-btn size="small" variant="text" color="error" @click="confirmDelete(entry)">
                  Ta bort
                </v-btn>
              </td>
            </tr>
            <tr v-if="entries.length === 0">
              <td colspan="5" class="text-center text-grey">Inga schemaparametrar ännu.</td>
            </tr>
          </tbody>
        </v-table>
      </v-card>
    </v-container>

    <!-- Create / Edit Modal -->
    <v-dialog v-model="showModal" max-width="600">
      <v-card>
        <v-card-title>{{ editing ? 'Redigera schemaparametrar' : 'Nya schemaparametrar' }}</v-card-title>
        <v-card-text>
          <v-form @submit.prevent="save">
            <v-select
              v-model="form.teacherId"
              :items="teacherOptions"
              label="Lärare *"
              item-title="title"
              item-value="value"
              :disabled="Boolean(editing)"
              :error-messages="validationErrors.teacherId"
            />
            <v-select
              v-model="form.courseId"
              :items="courseOptions"
              label="Kurs *"
              item-title="title"
              item-value="value"
              :disabled="Boolean(editing)"
              :error-messages="validationErrors.courseId"
            />
            <v-select
              v-model="form.lengthWeeks"
              :items="[5, 10, 20]"
              label="Längd (veckor) *"
              :disabled="Boolean(editing)"
              :error-messages="validationErrors.lengthWeeks"
            />
            <p class="text-body-2 text-grey">Offsets: vecka från kursstart då respektive modul börjar.</p>
            <div class="d-flex gap-2">
              <v-text-field
                v-for="i in 5"
                :key="i"
                v-model.number="form.sectionOffsets[i - 1]"
                :label="`Modul ${i}`"
                type="number"
                min="0"
                :error-messages="validationErrors[`offset-${i - 1}`]"
              />
            </div>
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
        <v-card-title>Ta bort schemaparametrar</v-card-title>
        <v-card-text>
          Är du säker på att du vill ta bort schemaparametrarna för
          "{{ teacherName(pendingDelete?.teacherId) }} / {{ courseName(pendingDelete?.courseId) }}"
          ({{ pendingDelete?.lengthWeeks }} v)? Detta kan inte ångras.
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

  const entries = ref([])
  const teachers = ref([])
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

  const teacherOptions = computed(() =>
    teachers.value.map((teacher) => ({
      title: teacher.userId?.username || teacher.name || teacher._id,
      value: teacher._id,
    }))
  )

  const courseOptions = computed(() =>
    courses.value.map((course) => ({
      title: `${course.courseName} (${course.courseCode})`,
      value: course._id,
    }))
  )

  const teacherName = (id) =>
    teacherOptions.value.find((t) => t.value === id)?.title || 'Okänd lärare'

  const courseName = (id) =>
    courseOptions.value.find((c) => c.value === id)?.title || id

  const form = ref({
    teacherId: null,
    courseId: null,
    lengthWeeks: 10,
    sectionOffsets: [],
  })

  const fetchEntries = async () => {
    try {
      const response = await client.get('/teacher-schedule-parameters')
      entries.value = response.data
    } catch (err) {
      console.error('Error fetching schedule parameters:', err)
      error.value = 'Kunde inte hämta schemaparametrar.'
    } finally {
      loading.value = false
    }
  }

  const fetchLookups = async () => {
    try {
      const [teachersRes, coursesRes] = await Promise.all([
        client.get('/teachers'),
        client.get('/courses'),
      ])
      teachers.value = teachersRes.data
      courses.value = coursesRes.data
    } catch (err) {
      console.error('Error fetching lookups:', err)
    }
  }

  const resetForm = () => {
    validationErrors.value = {}
    form.value = {
      teacherId: null,
      courseId: null,
      lengthWeeks: 10,
      sectionOffsets: [],
    }
  }

  const openCreate = () => {
    editing.value = null
    resetForm()
    showModal.value = true
  }

  const openEdit = (entry) => {
    editing.value = entry
    validationErrors.value = {}
    form.value = {
      teacherId: entry.teacherId,
      courseId: entry.courseId,
      lengthWeeks: entry.lengthWeeks,
      sectionOffsets: entry.sectionOffsets?.length === 5 ? [...entry.sectionOffsets] : [],
    }
    showModal.value = true
  }

  const validateOffsets = () => {
    validationErrors.value = {}
    let valid = true
    if (!form.value.teacherId) {
      validationErrors.value.teacherId = 'Lärare är obligatorisk.'
      valid = false
    }
    if (!form.value.courseId) {
      validationErrors.value.courseId = 'Kurs är obligatorisk.'
      valid = false
    }
    if (form.value.lengthWeeks === null || form.value.lengthWeeks === undefined) {
      validationErrors.value.lengthWeeks = 'Längd är obligatorisk.'
      valid = false
    }
    for (let i = 0; i < 5; i++) {
      const value = form.value.sectionOffsets[i]
      if (value === null || value === undefined || value === '' || Number.isNaN(Number(value)) || Number(value) < 0) {
        validationErrors.value[`offset-${i}`] = 'Ange ett icke-negativt tal.'
        valid = false
      }
    }
    return valid
  }

  const save = async () => {
    if (!validateOffsets()) return

    saving.value = true
    try {
      const offsets = form.value.sectionOffsets.map((n) => Number(n))
      if (editing.value) {
        await client.put(
          `/teacher-schedule-parameters/${editing.value.teacherId}/${editing.value.courseId}/${editing.value.lengthWeeks}`,
          { sectionOffsets: offsets }
        )
        toast.success('Schemaparametrarna uppdaterades.')
      } else {
        await client.post('/teacher-schedule-parameters', {
          teacherId: form.value.teacherId,
          courseId: form.value.courseId,
          lengthWeeks: form.value.lengthWeeks,
          sectionOffsets: offsets,
        })
        toast.success('Schemaparametrarna skapades.')
      }
      showModal.value = false
      await fetchEntries()
    } catch (err) {
      console.error('Error saving schedule parameters:', err)
      const message = err.response?.data?.message
      toast.error(message || 'Ett fel uppstod när schemaparametrarna skulle sparas.')
    } finally {
      saving.value = false
    }
  }

  const confirmDelete = (entry) => {
    pendingDelete.value = entry
    showDeleteModal.value = true
  }

  const remove = async () => {
    deleting.value = true
    try {
      await client.delete(
        `/teacher-schedule-parameters/${pendingDelete.value.teacherId}/${pendingDelete.value.courseId}/${pendingDelete.value.lengthWeeks}`
      )
      entries.value = entries.value.filter(
        (entry) =>
          entry.teacherId !== pendingDelete.value.teacherId ||
          entry.courseId !== pendingDelete.value.courseId ||
          entry.lengthWeeks !== pendingDelete.value.lengthWeeks
      )
      showDeleteModal.value = false
      toast.success('Schemaparametrarna togs bort.')
    } catch (err) {
      console.error('Error deleting schedule parameters:', err)
      toast.error('Ett fel uppstod när schemaparametrarna skulle tas bort.')
    } finally {
      deleting.value = false
    }
  }

  onMounted(async () => {
    await fetchLookups()
    await fetchEntries()
  })
</script>
