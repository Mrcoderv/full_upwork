<template>
  <div class="scrollable-view">
    <div class="inactivity-report-container">
      <div class="header-section">
        <h3 class="page-title">Inaktivitetsrapport</h3>
        <div class="breadcrumb">
          <svg xmlns="http://www.w3.org/2000/svg" width="30" height="30" viewBox="0 0 24 24">
            <path fill="#2c9316" d="M20 9v6h-8v4.84L4.16 12L12 4.16V9z" />
          </svg>
          <router-link to="/admin/users" class="breadcrumb-link">Tillbaka till Admin</router-link>
        </div>
      </div>

      <div class="thresholds-note">
        Elever som inte loggat in på {{ thresholds.withdrawDays }} dagar ska avslutas (kommunal
        regel). Elever som varit inaktiva i {{ thresholds.warningDays }} dagar är kandidater för
        varningsmail.
      </div>

      <!-- Error message -->
      <div v-if="errorMessage" class="alert alert-danger">
        {{ errorMessage }}
      </div>

      <!-- Summary cards -->
      <div class="summary-cards">
        <div class="summary-card">
          <span class="summary-value">{{ summary.evaluated }}</span>
          <span class="summary-label">Aktiva elever</span>
        </div>
        <div class="summary-card card-danger">
          <span class="summary-value">{{ summary.mustWithdraw }}</span>
          <span class="summary-label">Ska avslutas</span>
        </div>
        <div class="summary-card card-warning">
          <span class="summary-value">{{ summary.inactiveForWarning }}</span>
          <span class="summary-label">Varningsmail</span>
        </div>
      </div>

      <!-- Filters -->
      <div class="filters-section">
        <div class="search-group">
          <label for="inactivitySearch">Sök:</label>
          <input
            id="inactivitySearch"
            v-model="searchQuery"
            type="text"
            class="form-control"
            placeholder="Namn, personnummer eller e-post"
          />
        </div>
        <div class="filter-group">
          <button
            v-for="tab in tabs"
            :key="tab.value"
            class="btn btn-sm"
            :class="filterTab === tab.value ? 'btn-success' : 'btn-secondary'"
            @click="filterTab = tab.value"
          >
            {{ tab.label }}
          </button>
        </div>
      </div>

      <!-- Report Table -->
      <div class="table-container">
        <table class="table">
          <thead>
            <tr>
              <th>Namn</th>
              <th>Personnummer</th>
              <th>E-post</th>
              <th>Kommun</th>
              <th>Senast inloggning</th>
              <th>Senast inlämning</th>
              <th>Öppna inlämningar</th>
              <th>Kurser</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="loading">
              <td colspan="9" class="text-center">Laddar rapport...</td>
            </tr>
            <tr v-else-if="filteredStudents.length === 0">
              <td colspan="9" class="text-center">Inga elever i rapporten</td>
            </tr>
            <tr v-for="student in filteredStudents" :key="student.studentId">
              <td>
                <router-link :to="`/student/${student.studentId}`" class="student-name-link">
                  {{ student.name }}
                </router-link>
              </td>
              <td>{{ student.personalNumber }}</td>
              <td>{{ student.email }}</td>
              <td>{{ student.municipality || '-' }}</td>
              <td>{{ loginLabel(student) }}</td>
              <td>{{ daysLabel(student.daysSinceLastSubmission) }}</td>
              <td>
                <span v-if="student.openSubmissions > 0">{{ student.openSubmissions }}</span>
                <span v-else>-</span>
              </td>
              <td class="course-cell">
                <span v-for="enrollment in student.enrollments" :key="enrollment.courseInstanceId" class="course-tag">
                  {{ enrollment.courseName || '-' }}
                </span>
              </td>
              <td>
                <span v-if="student.level === 'withdraw'" class="badge bg-danger">Avbrott</span>
                <span v-else-if="student.level === 'warning'" class="badge bg-warning text-dark">Varning</span>
                <span v-else class="badge bg-success">OK</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import axios from 'axios'

const loading = ref(false)
const errorMessage = ref('')
const searchQuery = ref('')
const filterTab = ref('all')
const students = ref([])
const summary = ref({ evaluated: 0, mustWithdraw: 0, inactiveForWarning: 0 })
const thresholds = ref({ withdrawDays: 5, warningDays: 14 })

const tabs = [
  { value: 'all', label: 'Alla' },
  { value: 'withdraw', label: 'Avbrott' },
  { value: 'warning', label: 'Varning' },
]

const filteredStudents = computed(() => {
  const query = searchQuery.value.trim().toLowerCase()
  return students.value.filter((student) => {
    if (filterTab.value === 'withdraw' && student.level !== 'withdraw') return false
    if (filterTab.value === 'warning' && student.level !== 'warning') return false
    if (!query) return true
    return [student.name, student.personalNumber, student.email].some((field) =>
      field && field.toLowerCase().includes(query)
    )
  })
})

async function loadReport() {
  loading.value = true
  errorMessage.value = ''
  try {
    const response = await axios.get('/api/inactivity/report')
    students.value = response.data.students || []
    summary.value = response.data.summary || summary.value
    thresholds.value = response.data.thresholds || thresholds.value
  } catch (error) {
    errorMessage.value = error.response?.data?.error || 'Kunde inte hämta inaktivitetsrapporten'
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

function daysLabel(days) {
  if (days === null || days === undefined) return '-'
  return `${days} dagar`
}

function loginLabel(student) {
  if (student.daysSinceLastLogin === null || student.daysSinceLastLogin === undefined) {
    return 'Aldrig'
  }
  return `${daysLabel(student.daysSinceLastLogin)} (${formatDate(student.lastLoginAt)})`
}

onMounted(loadReport)
</script>

<style scoped>
.inactivity-report-container {
  padding: 20px;
}

.thresholds-note {
  background: #fff8e6;
  border: 1px solid #f0d78a;
  border-radius: 6px;
  padding: 10px 14px;
  font-size: 0.9rem;
  color: #6b5b1e;
  margin-bottom: 16px;
}

.summary-cards {
  display: flex;
  gap: 12px;
  margin-bottom: 16px;
  flex-wrap: wrap;
}

.summary-card {
  flex: 1;
  min-width: 160px;
  background: #fff;
  border: 1px solid #e0e0e0;
  border-left: 4px solid #2c9316;
  border-radius: 8px;
  padding: 14px 16px;
  display: flex;
  flex-direction: column;
}

.summary-card.card-danger {
  border-left-color: #dc3545;
}

.summary-card.card-warning {
  border-left-color: #ffc107;
}

.summary-value {
  font-size: 1.6rem;
  font-weight: 700;
  line-height: 1.2;
}

.summary-label {
  font-size: 0.85rem;
  color: #555;
}

.filters-section {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  gap: 12px;
  margin-bottom: 12px;
  flex-wrap: wrap;
}

.search-group {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
  max-width: 420px;
}

.search-group label {
  font-weight: 600;
  white-space: nowrap;
}

.filter-group {
  display: flex;
  gap: 6px;
}

.course-cell {
  min-width: 160px;
}

.course-tag {
  display: inline-block;
  background: #eef6ea;
  color: #2c6b1c;
  border-radius: 4px;
  padding: 2px 8px;
  margin: 2px 4px 2px 0;
  font-size: 0.8rem;
}

.student-name-link {
  color: #2c9316;
  font-weight: 600;
  text-decoration: none;
}

.student-name-link:hover {
  text-decoration: underline;
}
</style>
