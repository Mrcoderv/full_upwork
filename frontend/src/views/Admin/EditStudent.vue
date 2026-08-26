<template>
  <div class="scrollable-view p-4">
    <div v-if="successMessage" class="alert alert-success" role="alert">
      {{ successMessage }}
    </div>
    <div v-if="errorMessage" class="alert alert-danger" role="alert">
      {{ errorMessage }}
    </div>

    <div class="mb-3 position-relative">
      <label class="form-label">Välj elev</label>
      <input
        v-model="searchQuery"
        type="text"
        class="form-control"
        placeholder="Sök namn eller personnummer"
        @input="onSearch"
        @focus="onSearch"
      />
      <ul
        v-if="showSuggestions && filteredStudents.length"
        class="list-group position-absolute w-100 autocomplete-list"
      >
        <li
          v-for="s in filteredStudents"
          :key="s._id"
          class="list-group-item list-group-item-action"
          @click="selectStudent(s)"
        >
          {{ s.name }} ({{ s.personalNumber }})
        </li>
      </ul>
    </div>

    <div v-if="form" class="card p-3">
      <div class="row g-3">
        <div class="col-md-6">
          <label class="form-label">Namn</label>
          <input v-model="form.name" class="form-control" />
        </div>
        <div class="col-md-6">
          <label class="form-label">Personnummer</label>
          <input v-model="form.personalNumber" class="form-control" />
        </div>

        <div class="col-md-6">
          <label class="form-label">Lärare</label>
          <select v-model="form.teacherId" class="form-select">
            <option :value="null">— Ingen —</option>
            <option v-for="t in teachers" :key="t._id || t.id" :value="t._id || t.id">
              {{ (t.userId && t.userId.username) || t.name || t.subject || 'Teacher' }}
            </option>
          </select>
        </div>

        <div class="col-md-6">
          <label class="form-label">APL status</label>
          <select v-model="form.aplStatus" class="form-select">
            <option value="GRAY">GRAY - Ny Elev</option>
            <option value="BLUE">BLUE - Kontaktad</option>
            <option value="YELLOW">YELLOW - APL på gång</option>
            <option value="PURPLE">PURPLE - Behöver uppföljning</option>
            <option value="RED">RED - Snart slut</option>
            <option value="GREEN">GREEN - Klar praktik</option>
          </select>
        </div>

        <div class="col-md-4">
          <label class="form-label">Startdatum</label>
          <input v-model="dateFields.startDate" class="form-control" type="date" />
        </div>
        <div class="col-md-4">
          <label class="form-label">Slutdatum</label>
          <input v-model="dateFields.endDate" class="form-control" type="date" />
        </div>
        <div class="col-md-4">
          <label class="form-label">Slutprov (datum)</label>
          <input v-model="dateFields.finalExamDate" class="form-control" type="date" />
        </div>

        <div class="col-md-4">
          <label class="form-label">Provtid (24h)</label>
          <select v-model="form.examTime" class="form-select">
            <option v-for="h in hours" :key="h" :value="h + ':00'">{{ h }}:00</option>
            <option v-for="h in hours" :key="h + '-30'" :value="h + ':30'">{{ h }}:30</option>
          </select>
        </div>
        <div class="col-md-4">
          <label class="form-label">Prov kommun</label>
          <input v-model="form.examMunicipality" class="form-control" />
        </div>
        <div class="col-md-4">
          <label class="form-label">Provlokal</label>
          <input v-model="form.examLocation" class="form-control" />
        </div>

        <div class="col-md-4 form-check mt-4">
          <input id="dropout" v-model="form.dropout" class="form-check-input" type="checkbox" />
          <label class="form-check-label" for="dropout">Avbrott</label>
        </div>
      </div>

      <div class="mt-3 d-flex gap-2">
        <button class="btn btn-primary" :disabled="saving" @click="save">
          {{ saving ? 'Sparar...' : 'Spara' }}
        </button>
        <button class="btn btn-secondary" @click="reload">Ladda om</button>
      </div>

      <hr class="my-4" />
      <h5>Elevens slutprov (alla tillfällen)</h5>
      <div v-if="loadingExams" class="text-muted">Laddar...</div>
      <div v-else>
        <table class="table table-sm">
          <thead>
            <tr>
              <th>Datum</th>
              <th>Kurs</th>
              <th>Tid</th>
              <th>Kommun</th>
              <th>Plats</th>
              <th>Lärare</th>
              <th>Närvaro</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="e in examInstances" :key="e.id">
              <td>{{ formatDate(e.examDate) }}</td>
              <td>{{ e.courseName }}</td>
              <td>{{ e.examTime || '-' }}</td>
              <td>{{ e.examMunicipality || '-' }}</td>
              <td>{{ e.examLocation || '-' }}</td>
              <td>{{ e.teacher }}</td>
              <td>
                <span :class="e.attended ? 'text-success' : 'text-danger'">
                  {{ e.attended ? 'Närvarande' : 'Frånvarande' }}
                </span>
              </td>
            </tr>
            <tr v-if="!examInstances.length">
              <td colspan="7" class="text-muted">Inga registrerade slutprov.</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>

<script>
  import client from '@/api/client.js'
  import { ref, reactive, watch, computed, onMounted } from 'vue'
  import { useToast } from '@/composables/useToast.js'

  export default {
    name: 'EditStudent',
    setup() {
      const toast = useToast()
      const students = ref([])
      const teachers = ref([])
      const selectedId = ref('')
      const searchQuery = ref('')
      const showSuggestions = ref(false)
      const form = ref(null)
      const dateFields = reactive({ startDate: '', endDate: '', finalExamDate: '' })
      const examInstances = ref([])
      const loadingExams = ref(false)
      const saving = ref(false)
      const successMessage = ref('')
      const errorMessage = ref('')

      const hours = computed(() => Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0')))

      async function loadStudents() {
        try {
          const res = await client.get('/students')
          students.value = res.data
        } catch (e) {
          console.error('❌ Failed to load students', e)
        }
      }

      async function loadTeachers() {
        try {
          const res = await client.get('/teachers')
          teachers.value = res.data
        } catch (e) {
          console.error('❌ Failed to load teachers', e)
        }
      }

      async function loadStudent(id) {
        try {
          if (!id) return
          // Use lightweight endpoint to avoid populate issues
          const url = `/student/${encodeURIComponent(id)}/basic`
          const res = await client.get(url)
          const s = res.data
          form.value = {
            _id: s._id,
            name: s.name || s.namn || '',
            personalNumber: s.personalNumber || s.personnummer || '',
            teacherId: s.teacherId || null,
            aplStatus: s.aplStatus || 'GRAY',
            startDate: s.startDate || null,
            endDate: s.endDate || null,
            finalExamDate: s.finalExamDate || null,
            examTime: s.examTime || '',
            examMunicipality: s.examMunicipality || '',
            examLocation: s.examLocation || '',
            dropout: !!s.dropout,
          }
          dateFields.startDate = s.startDate ? new Date(s.startDate).toISOString().slice(0, 10) : ''
          dateFields.endDate = s.endDate ? new Date(s.endDate).toISOString().slice(0, 10) : ''
          dateFields.finalExamDate = s.finalExamDate
            ? new Date(s.finalExamDate).toISOString().slice(0, 10)
            : ''

          // Fetch exam instances
          await loadExamInstances(id)
        } catch (e) {
          console.error('❌ Failed to load student', e)
          errorMessage.value = e.message
            ? `Kunde inte ladda elev: ${e.message}`
            : 'Kunde inte ladda elev.'
        }
      }

      async function loadExamInstances(id) {
        try {
          loadingExams.value = true
          examInstances.value = []
          const url = `/exams/student/${encodeURIComponent(id)}`
          const res = await client.get(url)
          examInstances.value = Array.isArray(res.data) ? res.data : []
        } catch (e) {
          console.error('❌ Failed to load exam instances', e)
        } finally {
          loadingExams.value = false
        }
      }

      async function save() {
        if (!form.value?._id) return
        saving.value = true
        successMessage.value = ''
        errorMessage.value = ''
        try {
          const payload = {
            name: form.value.name,
            personalNumber: form.value.personalNumber,
            teacherId: form.value.teacherId || null,
            aplStatus: form.value.aplStatus,
            startDate: dateFields.startDate ? new Date(dateFields.startDate) : null,
            endDate: dateFields.endDate ? new Date(dateFields.endDate) : null,
            finalExamDate: dateFields.finalExamDate ? new Date(dateFields.finalExamDate) : null,
            examTime: form.value.examTime,
            examMunicipality: form.value.examMunicipality,
            examLocation: form.value.examLocation,
            dropout: !!form.value.dropout,
          }
          await client.put(`/student/${form.value._id}`, payload)
          successMessage.value = 'Elev sparad!'
        } catch (e) {
          console.error('❌ Failed to save student', e)
          errorMessage.value = 'Misslyckades att spara elev.'
        } finally {
          saving.value = false
        }
      }

      function reload() {
        if (selectedId.value) loadStudent(selectedId.value)
      }

      const filteredStudents = computed(() => {
        const q = (searchQuery.value || '').toLowerCase().trim()
        if (!q) return []
        return students.value
          .filter(
            (s) =>
              (s.name || '').toLowerCase().includes(q) ||
              (s.personalNumber || '').toLowerCase().includes(q)
          )
          .slice(0, 10)
      })

      function onSearch() {
        showSuggestions.value = filteredStudents.value.length > 0
      }

      function selectStudent(s) {
        selectedId.value = s._id
        searchQuery.value = `${s.name} (${s.personalNumber})`
        showSuggestions.value = false
      }

      watch(selectedId, (id) => {
        if (id) {
          loadStudent(id)
          const s = students.value.find((x) => x._id === id)
          if (s) searchQuery.value = `${s.name} (${s.personalNumber})`
        } else {
          form.value = null
          searchQuery.value = ''
        }
      })

      onMounted(() => {
        loadStudents()
        loadTeachers()
      })

      function formatDate(d) {
        if (!d) return '-'
        const dt = new Date(d)
        if (isNaN(dt)) return '-'
        return dt.toISOString().slice(0, 10)
      }

      return {
        students,
        teachers,
        selectedId,
        searchQuery,
        showSuggestions,
        filteredStudents,
        onSearch,
        selectStudent,
        form,
        dateFields,
        hours,
        saving,
        successMessage,
        errorMessage,
        examInstances,
        loadingExams,
        save,
        reload,
        formatDate,
      }
    },
  }
</script>

<style scoped>
  .gap-2 {
    gap: 0.5rem;
  }
  .autocomplete-list {
    z-index: 1050;
    max-height: 260px;
    overflow-y: auto;
  }
</style>
