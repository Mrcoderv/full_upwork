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
              <th>Avbrottsdatum</th>
              <th>Föregående kurser</th>
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
              <td>{{ student.municipality?.type || student.municipality || '-' }}</td>
              <td>
                <span v-if="student.teacherId">{{ student.teacherId.name }}</span>
                <span v-else>-</span>
              </td>
              <td class="tnum">{{ formatDate(student.dropoutDate) }}</td>
              <td>
                <div v-if="student.previousEnrollments?.length" class="previous-courses">
                  <div
                    v-for="enrollment in student.previousEnrollments.slice(0, 3)"
                    :key="enrollment._id"
                    class="prev-course-chip"
                    :class="'status-' + (enrollment.status || 'enrolled')"
                  >
                    <span class="prev-course-name">
                      {{ enrollment.mainCourseId?.courseName || enrollment.coursePackageId?.coursePackageName || 'Kurs' }}
                    </span>
                    <span class="prev-course-dates">
                      {{ formatDate(enrollment.startDate) }} – {{ formatDate(enrollment.endDate) }}
                    </span>
                  </div>
                  <span v-if="student.previousEnrollments.length > 3" class="more-courses">
                    +{{ student.previousEnrollments.length - 3 }} till
                  </span>
                </div>
                <span v-else class="no-courses">—</span>
              </td>
              <td>
                <div class="action-buttons">
                  <router-link
                    :to="`/student/${student._id}`"
                    class="btn btn-outline-primary btn-sm"
                  >
                    Visa
                  </router-link>
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

      <!-- Reactivation Dialog -->
      <ConfirmDialog
        v-model="dialogOpen"
        title="Återaktivera elev?"
        :message="reactivateMessage"
        confirm-label="Bekräfta återaktivering"
        cancel-label="Avbryt"
        :loading="reactivating"
        @confirm="reactivateStudent"
      >
        <template v-if="dialogStudent?.previousEnrollments?.length" #default>
          <div class="re-enroll-section">
            <p class="re-enroll-label">Välj kurser att återanmäla till:</p>
            <div class="re-enroll-courses">
              <label
                v-for="enrollment in dialogStudent.previousEnrollments"
                :key="enrollment._id"
                class="re-enroll-option"
              >
                <input
                  v-model="selectedReEnrollCourseIds"
                  type="checkbox"
                  :value="enrollment.mainCourseId?._id"
                />
                <span class="re-enroll-course-info">
                  <span class="re-enroll-course-name">
                    {{ enrollment.mainCourseId?.courseName || enrollment.coursePackageId?.coursePackageName || 'Kurs' }}
                  </span>
                  <span class="re-enroll-course-dates">
                    {{ formatDate(enrollment.startDate) }} – {{ formatDate(enrollment.endDate) }}
                  </span>
                </span>
              </label>
            </div>
          </div>
        </template>
      </ConfirmDialog>
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
const selectedReEnrollCourseIds = ref([])

const filteredStudents = computed(() => {
  const query = searchQuery.value.trim().toLowerCase()
  if (!query) return students.value
  return students.value.filter((s) =>
    [s.name, s.personalNumber, s.email].some((field) => field && field.toLowerCase().includes(query))
  )
})

const reactivateMessage = computed(() => {
  if (!dialogStudent.value) return ''
  const name = dialogStudent.value.name
  const count = selectedReEnrollCourseIds.value.length
  if (count > 0) {
    return `${name} återaktiveras som aktiv elev och anmäls till ${count} kurs${count > 1 ? 'er' : ''}.`
  }
  return `${name} återaktiveras som aktiv elev. Eleven läggs tillbaka i slutprovslistan och kan återigen delta i aktiviteter.`
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
  selectedReEnrollCourseIds.value = []
  dialogOpen.value = true
}

function closeDialog() {
  if (reactivating.value) return
  dialogOpen.value = false
  dialogStudent.value = null
  selectedReEnrollCourseIds.value = []
}

async function reactivateStudent() {
  if (!dialogStudent.value) return
  reactivating.value = true
  try {
    const id = dialogStudent.value._id
    await axios.post(`/api/student-details/${id}/reactivate`, {
      reEnrollCourseIds: selectedReEnrollCourseIds.value,
    })
    const count = selectedReEnrollCourseIds.value.length
    toast.success(
      count > 0
        ? `${dialogStudent.value.name} återaktiverades och anmäldes till ${count} kurs${count > 1 ? 'er' : ''}.`
        : `${dialogStudent.value.name} återaktiverades.`
    )
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

.previous-courses {
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-width: 250px;
}

.prev-course-chip {
  display: flex;
  flex-direction: column;
  padding: 4px 8px;
  border-radius: 4px;
  border-left: 3px solid #6c757d;
  background: #f8f9fa;
  font-size: 12px;
}

.prev-course-chip.status-enrolled {
  border-left-color: #28a745;
}

.prev-course-chip.status-completed {
  border-left-color: #6c757d;
}

.prev-course-chip.status-dropped {
  border-left-color: #dc3545;
}

.prev-course-chip.status-reviderad {
  border-left-color: #ffc107;
}

.prev-course-name {
  font-weight: 500;
  color: #2c3e50;
}

.prev-course-dates {
  color: #6c757d;
  font-size: 11px;
}

.more-courses {
  font-size: 11px;
  color: #6c757d;
  font-style: italic;
}

.no-courses {
  color: #6c757d;
}

.re-enroll-section {
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid #dee2e6;
}

.re-enroll-label {
  font-weight: 500;
  margin-bottom: 8px;
  font-size: 14px;
}

.re-enroll-courses {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.re-enroll-option {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  border: 1px solid #dee2e6;
  border-radius: 4px;
  cursor: pointer;
  transition: background 0.15s;
}

.re-enroll-option:hover {
  background: #f0f7ff;
}

.re-enroll-option input[type="checkbox"] {
  margin: 0;
}

.re-enroll-course-info {
  display: flex;
  flex-direction: column;
  font-size: 13px;
}

.re-enroll-course-name {
  font-weight: 500;
  color: #2c3e50;
}

.re-enroll-course-dates {
  color: #6c757d;
  font-size: 12px;
}
</style>
