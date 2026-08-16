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

      <!-- Scan controls (admin) -->
      <div v-if="isAdmin" class="scan-section">
        <button class="btn btn-primary btn-sm" :disabled="scanning" @click="runScan">
          {{ scanning ? 'Kör skanning...' : 'Kör inaktivitets-skanning' }}
        </button>
        <span v-if="scanStatus" class="scan-status">
          Senaste skanning: {{ formatDate(scanStatus.lastScanAt) }} — varnade: {{ scanStatus.warned }},
          auto-avbrott: {{ scanStatus.autoWithdrawn }}
        </span>
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
              <th>Lärare</th>
              <th>Senast inloggning</th>
              <th>Senast inlämning</th>
              <th>Öppna inlämningar</th>
              <th>Kurser</th>
              <th>Status</th>
              <th>Åtgärder</th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="loading">
              <td colspan="10" class="text-center">Laddar rapport...</td>
            </tr>
            <tr v-else-if="filteredStudents.length === 0">
              <td colspan="10" class="text-center">Inga elever i rapporten</td>
            </tr>
            <tr v-for="student in filteredStudents" :key="student.studentId">
              <td>
                <router-link :to="`/student/${student.studentId}`" class="student-name-link">
                  {{ student.name }}
                </router-link>
                <div v-if="student.warningSentAt" class="warning-sent-hint">
                  Varning skickad {{ formatDate(student.warningSentAt) }}
                </div>
              </td>
              <td>{{ student.personalNumber }}</td>
              <td>{{ student.email }}</td>
              <td>{{ student.municipality || '-' }}</td>
              <td>{{ student.responsibleTeacher || '-' }}</td>
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
              <td>
                <div class="action-buttons">
                  <template v-if="isAdmin">
                    <button
                      v-if="!student.warningSentAt"
                      class="btn btn-warning btn-sm"
                      :disabled="sendingWarningFor === student.studentId"
                      @click="sendWarningEmail(student)"
                    >
                      {{ sendingWarningFor === student.studentId ? 'Skickar...' : 'Varningsmail' }}
                    </button>
                    <span v-else class="badge bg-warning text-dark">Varning skickad</span>
                    <button
                      v-if="student.responsibleTeacherUserId"
                      class="btn btn-success btn-sm"
                      @click="discussStudent(student)"
                    >
                      Diskutera
                    </button>
                    <button
                      class="btn btn-danger btn-sm"
                      @click="openWithdrawDialog(student)"
                    >
                      Avsluta
                    </button>
                  </template>
                  <button
                    v-else-if="student.conversationId"
                    class="btn btn-success btn-sm"
                    @click="discussStudent(student)"
                  >
                    Diskutera
                  </button>
                  <span v-if="!isAdmin && !student.conversationId" class="text-muted">-</span>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Withdraw Confirmation Dialog -->
      <div v-if="withdrawStudent" class="modal-overlay" @click.self="closeWithdrawDialog">
        <div class="modal-box">
          <h4>Avsluta elev?</h4>
          <p>
            {{ withdrawStudent.name }} avslutas som elev. Alla pågående kursregistreringar
            markeras som avslutade och eleven tas bort från scheman och provanmälningar.
            Ansvarig lärare informeras och en diskussionstråd skapas.
          </p>
          <div class="modal-actions">
            <button class="btn btn-secondary" @click="closeWithdrawDialog">Avbryt</button>
            <button class="btn btn-danger" :disabled="withdrawing" @click="confirmWithdraw">
              {{ withdrawing ? 'Avslutar...' : 'Bekräfta avslut' }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useStore } from 'vuex'
import { useRouter } from 'vue-router'
import axios from 'axios'
import { useToast } from '@/composables/useToast.js'

const toast = useToast()
const store = useStore()
const router = useRouter()

const loading = ref(false)
const errorMessage = ref('')
const searchQuery = ref('')
const filterTab = ref('all')
const students = ref([])
const summary = ref({ evaluated: 0, mustWithdraw: 0, inactiveForWarning: 0 })
const thresholds = ref({ withdrawDays: 5, warningDays: 14 })
const sendingWarningFor = ref(null)
const withdrawStudent = ref(null)
const withdrawing = ref(false)
const scanning = ref(false)
const scanStatus = ref(null)

const isAdmin = computed(() => store.getters.isAdmin)

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

async function loadScanStatus() {
  try {
    const response = await axios.get('/api/inactivity/scan-status')
    scanStatus.value = response.data?.lastScan || null
  } catch {
    scanStatus.value = null
  }
}

async function runScan() {
  scanning.value = true
  errorMessage.value = ''
  try {
    await axios.post('/api/inactivity/scan')
    toast.success('Skanning klar')
    await loadReport()
    await loadScanStatus()
  } catch (error) {
    toast.error(error.response?.data?.error || 'Kunde inte köra skanningen')
  } finally {
    scanning.value = false
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

function discussStudent(student) {
  router.push({ path: '/messages', query: student.conversationId ? { conversationId: student.conversationId } : {} })
}

async function sendWarningEmail(student) {
  sendingWarningFor.value = student.studentId
  try {
    const response = await axios.post(`/api/inactivity/${student.studentId}/warning-email`)
    toast.success(`Varningsmail skickat till ${student.name}`)
    await loadReport()
    if (response.data.conversationId) {
      router.push({ path: '/messages', query: { conversationId: response.data.conversationId } })
    }
  } catch (error) {
    toast.error(error.response?.data?.error || 'Kunde inte skicka varningsmail')
  } finally {
    sendingWarningFor.value = null
  }
}

function openWithdrawDialog(student) {
  withdrawStudent.value = student
}

function closeWithdrawDialog() {
  if (withdrawing.value) return
  withdrawStudent.value = null
}

async function confirmWithdraw() {
  if (!withdrawStudent.value) return
  withdrawing.value = true
  try {
    const response = await axios.post(`/api/student-details/${withdrawStudent.value.studentId}/dropout`)
    toast.success(`${withdrawStudent.value.name} avslutades`)
    await loadReport()
    closeWithdrawDialog()
    if (response.data.conversationId) {
      router.push({ path: '/messages', query: { conversationId: response.data.conversationId } })
    }
  } catch (error) {
    toast.error(error.response?.data?.error || 'Kunde inte avsluta eleven')
  } finally {
    withdrawing.value = false
  }
}

onMounted(() => {
  loadReport()
  if (isAdmin.value) loadScanStatus()
})
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

.scan-section {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
  flex-wrap: wrap;
}

.scan-status {
  font-size: 0.85rem;
  color: #555;
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

.warning-sent-hint {
  font-size: 0.75rem;
  color: #b8860b;
  margin-top: 2px;
}

.action-buttons {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.modal-box {
  background: #fff;
  padding: 24px;
  border-radius: 8px;
  max-width: 480px;
  width: 90%;
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 16px;
}
</style>
