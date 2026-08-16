<template>
  <div class="scrollable-view">
    <div class="inactive-students-container">
      <PageHeader
        title="Inaktiva elever"
        subtitle="Elever med registrerat avbrott"
        :crumbs="[
          { label: 'Admin', to: '/admin/users' },
          { label: 'Inaktiva elever' },
        ]"
      />

      <!-- Search -->
      <div class="filters-section">
        <div class="search-group">
          <label for="inactiveSearch">Sök:</label>
          <input
            id="inactiveSearch"
            v-model="searchQuery"
            type="text"
            class="form-control"
            placeholder="Namn, personnummer eller e-post"
          />
        </div>
        <div class="filter-group">
          <span class="inactive-count tnum">{{ filteredStudents.length }} elever med avbrott</span>
        </div>
      </div>

      <!-- Error message -->
      <div v-if="errorMessage" class="alert alert-danger">
        {{ errorMessage }}
      </div>

      <!-- Inactive Students Table -->
      <div class="table-responsive">
        <table class="table">
          <thead>
            <tr>
              <th>Status</th>
              <th>Namn</th>
              <th>Personnummer</th>
              <th>E-post</th>
              <th>Kommun</th>
              <th>Lärare</th>
              <th>Startdatum</th>
              <th>Slutdatum</th>
              <th>Åtgärder</th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="loading">
              <td colspan="9" class="text-center">Laddar inaktiva elever...</td>
            </tr>
            <tr v-for="student in filteredStudents" :key="student._id">
              <td>
                <StatusBadge hue="danger" label="Avbrott" />
              </td>
              <td>
                <router-link :to="`/student/${student._id}`" class="student-name-link">
                  {{ student.name }}
                </router-link>
              </td>
              <td class="tnum">{{ student.personalNumber }}</td>
              <td>{{ student.email }}</td>
              <td>{{ student.municipality || '-' }}</td>
              <td>
                <span v-if="student.teacherId">{{ student.teacherId.name }}</span>
                <span v-else>-</span>
              </td>
              <td class="tnum">{{ formatDate(student.startDate) }}</td>
              <td class="tnum">{{ formatDate(student.endDate) }}</td>
              <td>
                <div class="action-buttons">
                  <button class="btn btn-success btn-sm" @click="openReactivateDialog(student)">
                    Återaktivera
                  </button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <EmptyState
        v-if="!loading && filteredStudents.length === 0"
        icon="mdi-account-off-outline"
        title="Inga inaktiva elever hittades"
        description="Just nu finns inga elever med registrerat avbrott."
      />

      <ConfirmDialog
        v-model="dialogOpen"
        title="Återaktivera elev?"
        :message="`${dialogStudent?.name || 'Eleven'} återaktiveras som aktiv elev. Eleven läggs tillbaka i slutprovslistan och kan återigen delta i aktiviteter.`"
        confirm-label="Bekräfta återaktivering"
        cancel-label="Avbryt"
        :loading="reactivating"
        @confirm="reactivateStudent"
      />
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useToast } from '@/composables/useToast.js'
import axios from 'axios'
import PageHeader from '@/components/base/PageHeader.vue'
import StatusBadge from '@/components/base/StatusBadge.vue'
import EmptyState from '@/components/base/EmptyState.vue'
import ConfirmDialog from '@/components/base/ConfirmDialog.vue'

const toast = useToast()

const students = ref([])
const loading = ref(false)
const errorMessage = ref('')
const searchQuery = ref('')
const dialogStudent = ref(null)
const dialogOpen = ref(false)
const reactivating = ref(false)

const filteredStudents = computed(() => {
  const query = searchQuery.value.trim().toLowerCase()
  if (!query) return students.value
  return students.value.filter((s) =>
    [s.name, s.personalNumber, s.email].some((field) => field && field.toLowerCase().includes(query))
  )
})

async function loadInactiveStudents() {
  loading.value = true
  errorMessage.value = ''
  try {
    const response = await axios.get('/api/students/dropouts')
    students.value = response.data || []
  } catch (error) {
    errorMessage.value = error.response?.data?.error || 'Kunde inte hämta inaktiva elever'
  } finally {
    loading.value = false
  }
}

function formatDate(dateString) {
  if (!dateString) return '-'
  const date = new Date(dateString)
  if (Number.isNaN(date.getTime())) return '-'
  return date.toLocaleDateString('sv-SE')
}

function openReactivateDialog(student) {
  dialogStudent.value = student
  dialogOpen.value = true
}

function closeDialog() {
  if (reactivating.value) return
  dialogOpen.value = false
  dialogStudent.value = null
}

async function reactivateStudent() {
  if (!dialogStudent.value) return
  reactivating.value = true
  try {
    const id = dialogStudent.value._id
    await axios.delete(`/api/student-details/${id}/dropout`)
    toast.success(`${dialogStudent.value.name} återaktiverades`)
    await loadInactiveStudents()
    closeDialog()
  } catch (error) {
    toast.error(error.response?.data?.error || 'Kunde inte återaktivera eleven')
  } finally {
    reactivating.value = false
  }
}

onMounted(loadInactiveStudents)
</script>

<style scoped>
.inactive-students-container {
  padding: 20px;
}

.filters-section {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-4);
  flex-wrap: wrap;
  margin-bottom: var(--space-4);
}

.search-group {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  flex: 1 1 16rem;
  max-width: 32rem;
}

.search-group label {
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-medium);
  color: var(--color-ink-secondary);
  white-space: nowrap;
}

.inactive-count {
  font-size: var(--font-size-sm);
  color: var(--color-ink-muted);
  padding: 8px 0;
}

.student-name-link {
  color: var(--color-primary);
  font-weight: var(--font-weight-semibold);
  text-decoration: none;
}

.student-name-link:hover {
  text-decoration: underline;
}

.action-buttons {
  display: flex;
  gap: var(--space-2);
}
</style>
