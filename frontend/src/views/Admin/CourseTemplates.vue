<template>
  <div class="scrollable-view">
    <v-container class="py-5">
      <v-card class="pa-5">
        <div class="d-flex align-center justify-space-between">
          <v-card-title class="text-h4 font-weight-bold pa-0">Kursmallar</v-card-title>
          <v-btn color="primary" prepend-icon="mdi-plus" @click="openCreate">
            Ny kursmall
          </v-btn>
        </div>

        <v-progress-linear v-if="loading" indeterminate color="primary" class="my-5"></v-progress-linear>

        <v-alert v-else-if="error" type="error" class="my-3">{{ error }}</v-alert>

        <v-table v-else dense class="mt-4">
          <thead>
            <tr>
              <th class="text-left">Mallnamn</th>
              <th class="text-left">Kurs</th>
              <th class="text-left">Moduler</th>
              <th class="text-left">Skapad av</th>
              <th class="text-left">Status</th>
              <th class="text-left">Åtgärder</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="template in templates" :key="template._id">
              <td>
                <strong>{{ template.templateName }}</strong>
              </td>
              <td>
                {{ template.courseId?.courseName || '–' }}
                <span v-if="template.courseId" class="text-caption text-grey">
                  ({{ template.courseId.courseCode }})
                </span>
              </td>
              <td>{{ template.modules?.length || 0 }}</td>
              <td>{{ template.createdBy?.username || template.createdBy?.email || '–' }}</td>
              <td>
                <v-chip :color="template.isActive ? 'success' : 'grey'" size="small">
                  {{ template.isActive ? 'Aktiv' : 'Inaktiv' }}
                </v-chip>
              </td>
              <td>
                <v-btn size="small" variant="text" @click="openEdit(template)">Redigera</v-btn>
                <v-btn size="small" variant="text" color="error" @click="confirmDelete(template)">
                  Ta bort
                </v-btn>
              </td>
            </tr>
            <tr v-if="templates.length === 0">
              <td colspan="6" class="text-center text-grey">Inga kursmallar ännu.</td>
            </tr>
          </tbody>
        </v-table>
      </v-card>
    </v-container>

    <!-- Create / Edit Modal -->
    <v-dialog v-model="showModal" max-width="900">
      <v-card>
        <v-card-title>{{ editing ? 'Redigera kursmall' : 'Ny kursmall' }}</v-card-title>
        <v-card-text>
          <v-form @submit.prevent="save">
            <v-text-field
              v-model="form.templateName"
              label="Mallnamn *"
              required
              :error-messages="validationErrors.templateName"
            />

            <v-select
              v-model="form.courseId"
              :items="courseOptions"
              label="Kurs (valfritt)"
              item-title="title"
              item-value="value"
              clearable
            />

            <v-divider class="my-4"></v-divider>

            <div class="d-flex align-center justify-space-between mb-2">
              <h4 class="text-subtitle-1 font-weight-bold">Moduler (5 × 2 sektioner)</h4>
              <div class="text-caption text-grey">
                Modul 3 = delprov, Modul 5 = case study
              </div>
            </div>

            <div
              v-for="(module, moduleIndex) in form.modules"
              :key="moduleIndex"
              class="module-block pa-3 mb-3"
              :class="{ 'module-partial-exam': module.isPartialExam, 'module-case-study': module.isCaseStudy }"
            >
              <div class="d-flex align-center justify-space-between">
                <div class="d-flex align-center ga-3">
                  <v-chip size="small" color="primary" variant="tonal">Modul {{ module.moduleNumber }}</v-chip>
                  <v-text-field
                    v-model="module.title"
                    label="Modultitel"
                    density="compact"
                    hide-details
                    class="module-title-input"
                  />
                </div>
                <div class="d-flex ga-2">
                  <v-chip v-if="module.isPartialExam" size="small" color="warning">
                    Delprov
                  </v-chip>
                  <v-chip v-if="module.isCaseStudy" size="small" color="info">
                    Case study
                  </v-chip>
                </div>
              </div>

              <div class="mt-3">
                <div class="d-flex align-center mb-2">
                  <span class="text-caption font-weight-bold mr-3">Sektioner</span>
                </div>
                <div
                  v-for="(section, sectionIndex) in module.sections"
                  :key="sectionIndex"
                  class="section-block mb-2 pa-2"
                >
                  <div class="d-flex align-center ga-2">
                    <v-text-field
                      v-model="section.title"
                      :label="`Sektion ${sectionIndex + 1} – Titel`"
                      density="compact"
                      hide-details
                    />
                  </div>
                  <v-text-field
                    v-model="section.description"
                    :label="`Sektion ${sectionIndex + 1} – Beskrivning`"
                    density="compact"
                    class="mt-2"
                    hide-details
                  />
                </div>
              </div>
            </div>

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
        <v-card-title>Ta bort kursmall</v-card-title>
        <v-card-text>
          Är du säker på att du vill ta bort "{{ pendingDelete?.templateName }}"? Detta kan inte ångras.
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

  const templates = ref([])
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

  const defaultModules = () =>
    Array.from({ length: 5 }, (_, i) => ({
      moduleNumber: i + 1,
      title: `Modul ${i + 1}`,
      isPartialExam: i === 2,
      isCaseStudy: i === 4,
      sections: [
        { title: 'Sektion 1', description: '' },
        { title: 'Sektion 2', description: '' },
      ],
    }))

  const form = ref({
    templateName: '',
    courseId: null,
    modules: defaultModules(),
    isActive: true,
  })

  const fetchTemplates = async () => {
    try {
      const response = await client.get('/course-templates')
      templates.value = response.data.templates || []
    } catch (err) {
      console.error('Error fetching course templates:', err)
      error.value = 'Kunde inte hämta kursmallar.'
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
      templateName: '',
      courseId: null,
      modules: defaultModules(),
      isActive: true,
    }
    showModal.value = true
  }

  const openEdit = (template) => {
    editing.value = template
    validationErrors.value = {}
    form.value = {
      templateName: template.templateName,
      courseId: template.courseId?._id || null,
      modules: (template.modules || defaultModules()).map((module) => ({
        moduleNumber: module.moduleNumber,
        title: module.title,
        isPartialExam: !!module.isPartialExam,
        isCaseStudy: !!module.isCaseStudy,
        sections: (module.sections || []).map((section) => ({
          title: section.title,
          description: section.description,
        })),
      })),
      isActive: template.isActive,
    }
    showModal.value = true
  }

  const save = async () => {
    validationErrors.value = {}
    if (!form.value.templateName || !form.value.templateName.trim()) {
      validationErrors.value.templateName = 'Mallnamn är obligatoriskt.'
      return
    }

    saving.value = true
    try {
      const payload = {
        templateName: form.value.templateName.trim(),
        courseId: form.value.courseId || undefined,
        modules: form.value.modules,
        isActive: form.value.isActive,
      }
      if (editing.value) {
        await client.put(`/course-templates/${editing.value._id}`, payload)
        toast.success('Kursmallen uppdaterades.')
      } else {
        await client.post('/course-templates', payload)
        toast.success('Kursmallen skapades.')
      }
      showModal.value = false
      await fetchTemplates()
    } catch (err) {
      console.error('Error saving course template:', err)
      toast.error('Ett fel uppstod när kursmallen skulle sparas.')
    } finally {
      saving.value = false
    }
  }

  const confirmDelete = (template) => {
    pendingDelete.value = template
    showDeleteModal.value = true
  }

  const remove = async () => {
    deleting.value = true
    try {
      await client.delete(`/course-templates/${pendingDelete.value._id}`)
      templates.value = templates.value.filter((template) => template._id !== pendingDelete.value._id)
      showDeleteModal.value = false
      toast.success('Kursmallen togs bort.')
    } catch (err) {
      console.error('Error deleting course template:', err)
      toast.error('Ett fel uppstod när kursmallen skulle tas bort.')
    } finally {
      deleting.value = false
    }
  }

  onMounted(async () => {
    await Promise.all([fetchTemplates(), fetchCourses()])
  })
</script>

<style scoped>
  .module-block {
    border: 1px solid #ddd;
    border-radius: 8px;
  }
  .module-partial-exam {
    border-left: 4px solid #fb8c00;
  }
  .module-case-study {
    border-left: 4px solid #1e88e5;
  }
  .section-block {
    background: #fafafa;
    border: 1px solid #eee;
    border-radius: 6px;
  }
  .module-title-input {
    min-width: 240px;
  }
</style>
