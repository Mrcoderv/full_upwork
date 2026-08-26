<template>
  <div class="scrollable-view">
    <div class="student-enrollments-container">
      <div class="header-section">
        <h3 class="page-title">Student Inskrivningar</h3>
        <div class="breadcrumb">
          <svg xmlns="http://www.w3.org/2000/svg" width="30" height="30" viewBox="0 0 24 24">
            <path fill="#2c9316" d="M20 9v6h-8v4.84L4.16 12L12 4.16V9z" />
          </svg>
          <router-link to="/admin/users" class="breadcrumb-link">Tillbaka till Admin</router-link>
        </div>
      </div>

      <!-- Search and Filters -->
      <div class="filters-section">
        <div class="search-group">
          <label for="studentSearch">Sök student:</label>
          <input
            id="studentSearch"
            v-model="searchQuery"
            type="text"
            class="form-control"
            placeholder="Namn eller e-post"
            @input="searchStudents"
          />
        </div>

        <div class="filter-group">
          <label for="statusFilter">Status:</label>
          <select id="statusFilter" v-model="filters.status" @change="loadEnrollments">
            <option value="">Alla statusar</option>
            <option value="enrolled">Inskriven</option>
            <option value="active">Aktiv</option>
            <option value="completed">Slutförd</option>
            <option value="dropped">Avbruten</option>
            <option value="inactive">Inaktiv</option>
            <option value="suspended">Avstängd</option>
          </select>
        </div>

        <div class="filter-group">
          <label for="dateFilter">Period:</label>
          <input id="startDate" v-model="filters.startDate" type="date" @change="loadEnrollments" />
          <span>till</span>
          <input id="endDate" v-model="filters.endDate" type="date" @change="loadEnrollments" />
        </div>
      </div>

      <!-- Student Selection -->
      <div v-if="searchResults.length > 0" class="search-results">
        <h5>Sökresultat:</h5>
        <div class="student-cards">
          <div
            v-for="student in searchResults"
            :key="student._id"
            class="student-card"
            @click="selectStudent(student)"
          >
            <div class="student-info">
              <h6>{{ student.name }}</h6>
              <p>{{ student.email }}</p>
              <small>{{ student.personalNumber }}</small>
            </div>
          </div>
        </div>
      </div>

      <!-- Selected Student Info -->
      <div v-if="selectedStudent" class="selected-student">
        <div class="student-header">
          <h4>{{ selectedStudent.name }}</h4>
          <p>{{ selectedStudent.email }} | {{ selectedStudent.personalNumber }}</p>
          <div class="student-stats">
            <span class="stat-item">
              <strong>Totalt inskrivningar:</strong>
              {{ enrollments.length }}
            </span>
            <span class="stat-item">
              <strong>Aktiva:</strong>
              {{ activeEnrollments }}
            </span>
            <span class="stat-item">
              <strong>Slutförda:</strong>
              {{ completedEnrollments }}
            </span>
          </div>
        </div>
      </div>

      <!-- Enrollments Table -->
      <div v-if="selectedStudent && enrollments.length > 0" class="enrollments-section">
        <h5>Inskrivningshistorik</h5>
        <div class="table-container">
          <table class="table">
            <thead>
              <tr>
                <th>Kurs</th>
                <th>Period</th>
                <th>Status</th>
                <th>Betyg</th>
                <th>Närvaro</th>
                <th>Betalning</th>
                <th>Lärare</th>
                <th>Åtgärder</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="enrollment in enrollments" :key="enrollment._id">
                <td>
                  <div class="course-info">
                    <strong>{{ enrollment.mainCourseId?.courseName }}</strong>
                    <small>{{ enrollment.mainCourseId?.courseCode }}</small>
                  </div>
                </td>
                <td>
                  <div class="date-info">
                    <div>{{ formatDate(enrollment.startDate) }}</div>
                    <div>{{ formatDate(enrollment.endDate) }}</div>
                  </div>
                </td>
                <td>
                  <span :class="['status-badge', getStatusClass(enrollment.status)]">
                    {{ getStatusText(enrollment.status) }}
                  </span>
                </td>
                <td>
                  <div v-if="enrollment.grade" class="grade-info">
                    <span class="grade">{{ enrollment.grade }}</span>
                    <small v-if="enrollment.gradeDate">{{ formatDate(enrollment.gradeDate) }}</small>
                  </div>
                  <span v-else>-</span>
                </td>
                <td>
                  <span v-if="enrollment.attendancePercentage">
                    {{ enrollment.attendancePercentage }}%
                  </span>
                  <span v-else>-</span>
                </td>
                <td>
                  <span :class="['payment-badge', getPaymentClass(enrollment.paymentStatus)]">
                    {{ getPaymentText(enrollment.paymentStatus) }}
                  </span>
                </td>
                <td>
                  <span v-if="enrollment.teacherId">
                    {{ enrollment.teacherId.username }}
                  </span>
                  <span v-else>-</span>
                </td>
                <td>
                  <button
                    class="btn btn-sm btn-outline-primary me-1"
                    title="Redigera"
                    @click="editEnrollment(enrollment)"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                    >
                      <path
                        fill="currentColor"
                        d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"
                      />
                    </svg>
                  </button>
                  <button
                    v-if="enrollment.status !== 'dropped'"
                    class="btn btn-sm btn-outline-danger me-1"
                    title="Ta bort inskrivning"
                    @click="deleteEnrollment(enrollment)"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                    >
                      <path
                        fill="currentColor"
                        d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"
                      />
                    </svg>
                  </button>
                  <button
                    class="btn btn-sm btn-outline-info"
                    title="Visa historik"
                    @click="viewHistory(enrollment)"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                    >
                      <path
                        fill="currentColor"
                        d="M13 3c-4.97 0-9 4.03-9 9H1l3.89 3.89.07.14L9 12H6c0-3.87 3.13-7 7-7s7 3.13 7 7-3.13 7-7 7c-1.93 0-3.68-.79-4.94-2.06l-1.42 1.42C8.27 19.99 10.51 21 13 21c4.97 0 9-4.03 9-9s-4.03-9-9-9zm-1 5v5l4.28 2.54.72-1.21-3.5-2.08V8H12z"
                      />
                    </svg>
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- Edit Enrollment Modal -->
      <div id="enrollmentModal" ref="enrollmentModal" class="modal fade" tabindex="-1">
        <div class="modal-dialog modal-lg">
          <div class="modal-content">
            <div class="modal-header">
              <h5 class="modal-title">Redigera inskrivning</h5>
              <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
            </div>
            <div class="modal-body">
              <form @submit.prevent="saveEnrollment">
                <div class="row">
                  <div class="col-md-6">
                    <div class="form-group">
                      <label for="enrollmentStatus">Status:</label>
                      <select
                        id="enrollmentStatus"
                        v-model="enrollmentForm.status"
                        class="form-control"
                        required
                      >
                        <option value="enrolled">Inskriven</option>
                        <option value="active">Aktiv</option>
                        <option value="completed">Slutförd</option>
                        <option value="dropped">Avbruten</option>
                        <option value="inactive">Inaktiv</option>
                        <option value="suspended">Avstängd</option>
                      </select>
                    </div>
                  </div>
                  <div class="col-md-6">
                    <div class="form-group">
                      <label for="enrollmentGrade">Betyg:</label>
                      <input
                        id="enrollmentGrade"
                        v-model="enrollmentForm.grade"
                        type="text"
                        class="form-control"
                        placeholder="A, B, C, etc."
                      />
                    </div>
                  </div>
                </div>

                <div class="row">
                  <div class="col-md-6">
                    <div class="form-group">
                      <label for="enrollmentAttendance">Närvaro (%):</label>
                      <input
                        id="enrollmentAttendance"
                        v-model="enrollmentForm.attendancePercentage"
                        type="number"
                        class="form-control"
                        min="0"
                        max="100"
                      />
                    </div>
                  </div>
                  <div class="col-md-6">
                    <div class="form-group">
                      <label for="enrollmentPayment">Betalningsstatus:</label>
                      <select
                        id="enrollmentPayment"
                        v-model="enrollmentForm.paymentStatus"
                        class="form-control"
                      >
                        <option value="pending">Väntande</option>
                        <option value="paid">Betald</option>
                        <option value="partial">Delvis betald</option>
                        <option value="overdue">Förfallen</option>
                        <option value="waived">Eftergiven</option>
                      </select>
                    </div>
                  </div>
                </div>

                <div class="form-group">
                  <label for="enrollmentNotes">Anteckningar:</label>
                  <textarea
                    id="enrollmentNotes"
                    v-model="enrollmentForm.notes"
                    class="form-control"
                    rows="3"
                  ></textarea>
                </div>

                <div class="form-group">
                  <label for="statusReason">Anledning till statusändring:</label>
                  <input
                    id="statusReason"
                    v-model="enrollmentForm.statusChangeReason"
                    type="text"
                    class="form-control"
                    placeholder="Valfritt"
                  />
                </div>
              </form>
            </div>
            <div class="modal-footer">
              <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Avbryt</button>
              <button
                type="button"
                class="btn btn-primary"
                :disabled="isSaving"
                @click="saveEnrollment"
              >
                {{ isSaving ? 'Sparar...' : 'Spara ändringar' }}
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- History Modal -->
      <div id="historyModal" ref="historyModal" class="modal fade" tabindex="-1">
        <div class="modal-dialog">
          <div class="modal-content">
            <div class="modal-header">
              <h5 class="modal-title">Statushistorik</h5>
              <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
            </div>
            <div class="modal-body">
              <div v-if="selectedEnrollmentHistory.length > 0" class="history-list">
                <div
                  v-for="(entry, index) in selectedEnrollmentHistory"
                  :key="index"
                  class="history-item"
                >
                  <div class="history-header">
                    <span :class="['status-badge', getStatusClass(entry.status)]">
                      {{ getStatusText(entry.status) }}
                    </span>
                    <small>{{ formatDate(entry.changedAt) }}</small>
                  </div>
                  <div v-if="entry.reason" class="history-reason">
                    <strong>Anledning:</strong>
                    {{ entry.reason }}
                  </div>
                  <div v-if="entry.notes" class="history-notes">
                    <strong>Anteckningar:</strong>
                    {{ entry.notes }}
                  </div>
                </div>
              </div>
              <div v-else class="text-center">
                <p>Ingen historik tillgänglig.</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
  import { ref, computed, onMounted } from 'vue'
  import client from '@/api/client.js'
  import { useToast } from '@/composables/useToast.js'

  export default {
    name: 'StudentEnrollments',
    setup() {
      const toast = useToast();
      const searchQuery = ref('')
      const searchResults = ref([])
      const selectedStudent = ref(null)
      const enrollments = ref([])
      const editingEnrollment = ref(null)
      const isSaving = ref(false)
      const selectedEnrollmentHistory = ref([])

      const filters = ref({
        status: '',
        startDate: '',
        endDate: '',
      })

      const enrollmentForm = ref({
        status: '',
        grade: '',
        attendancePercentage: null,
        paymentStatus: 'pending',
        notes: '',
        statusChangeReason: '',
      })

      const activeEnrollments = computed(
        () => enrollments.value.filter((e) => e.status === 'active').length
      )

      const completedEnrollments = computed(
        () => enrollments.value.filter((e) => e.status === 'completed').length
      )

      const searchStudents = async () => {
        if (!searchQuery.value.trim()) {
          searchResults.value = []
          return
        }

        try {
          const response = await client.get(
            `/search?type=Användare&q=${encodeURIComponent(searchQuery.value)}`
          )
          searchResults.value = response.data.filter(
            (result) => result.type === 'Användare' && result.role === 'student'
          )
        } catch (error) {
          console.error('Error searching students:', error)
        }
      }

      const selectStudent = async (student) => {
        selectedStudent.value = student
        searchResults.value = []
        searchQuery.value = ''
        await loadEnrollments()
      }

      const loadEnrollments = async () => {
        if (!selectedStudent.value) return

        try {
          const params = new URLSearchParams()
          if (filters.value.status) params.append('status', filters.value.status)
          if (filters.value.startDate) params.append('startDate', filters.value.startDate)
          if (filters.value.endDate) params.append('endDate', filters.value.endDate)

          const response = await client.get(
            `/students/${selectedStudent.value._id}/enrollments?${params.toString()}`
          )
          enrollments.value = response.data.enrollments
        } catch (error) {
          console.error('Error loading enrollments:', error)
        }
      }

      const editEnrollment = (enrollment) => {
        editingEnrollment.value = enrollment
        enrollmentForm.value = {
          status: enrollment.status,
          grade: enrollment.grade || '',
          attendancePercentage: enrollment.attendancePercentage,
          paymentStatus: enrollment.paymentStatus,
          notes: enrollment.notes || '',
          statusChangeReason: '',
        }

        const modal = new bootstrap.Modal(document.getElementById('enrollmentModal'))
        modal.show()
      }

      const saveEnrollment = async () => {
        isSaving.value = true
        try {
          await client.put(`/enrollments/${editingEnrollment.value._id}/status`, enrollmentForm.value)
          await loadEnrollments()

          const modal = bootstrap.Modal.getInstance(document.getElementById('enrollmentModal'))
          modal.hide()
        } catch (error) {
          console.error('Error saving enrollment:', error)
          toast.error('Ett fel uppstod när inskrivningen skulle sparas.')
        } finally {
          isSaving.value = false
        }
      }

      const deleteEnrollment = async (enrollment) => {
        if (!confirm('Är du säker på att du vill ta bort denna inskrivning?')) return
        try {
          await client.delete(
            `/students/${selectedStudent.value._id}/enrollments/${enrollment._id}`
          )
          toast.success('Inskrivning borttagen.')
          await loadEnrollments()
        } catch (error) {
          console.error('Error deleting enrollment:', error)
          toast.error('Kunde inte ta bort inskrivningen.')
        }
      }

      const viewHistory = (enrollment) => {
        selectedEnrollmentHistory.value = enrollment.statusHistory || []

        const modal = new bootstrap.Modal(document.getElementById('historyModal'))
        modal.show()
      }

      const formatDate = (dateString) => {
        return new Date(dateString).toLocaleDateString('sv-SE')
      }

      const getStatusClass = (status) => {
        const classes = {
          enrolled: 'enrolled',
          active: 'active',
          completed: 'completed',
          dropped: 'dropped',
          inactive: 'inactive',
          suspended: 'suspended',
        }
        return classes[status] || 'enrolled'
      }

      const getStatusText = (status) => {
        const texts = {
          enrolled: 'Inskriven',
          active: 'Aktiv',
          completed: 'Slutförd',
          dropped: 'Avbruten',
          inactive: 'Inaktiv',
          suspended: 'Avstängd',
        }
        return texts[status] || status
      }

      const getPaymentClass = (status) => {
        const classes = {
          pending: 'pending',
          paid: 'paid',
          partial: 'partial',
          overdue: 'overdue',
          waived: 'waived',
        }
        return classes[status] || 'pending'
      }

      const getPaymentText = (status) => {
        const texts = {
          pending: 'Väntande',
          paid: 'Betald',
          partial: 'Delvis',
          overdue: 'Förfallen',
          waived: 'Eftergiven',
        }
        return texts[status] || status
      }

      return {
        searchQuery,
        searchResults,
        selectedStudent,
        enrollments,
        editingEnrollment,
        isSaving,
        selectedEnrollmentHistory,
        filters,
        enrollmentForm,
        activeEnrollments,
        completedEnrollments,
        searchStudents,
        selectStudent,
        loadEnrollments,
        editEnrollment,
        deleteEnrollment,
        saveEnrollment,
        viewHistory,
        formatDate,
        getStatusClass,
        getStatusText,
        getPaymentClass,
        getPaymentText,
      }
    },
  }
</script>

<style scoped>
  .student-enrollments-container {
    padding: 20px;
  }

  .header-section {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 30px;
  }

  .page-title {
    margin: 0;
    color: #2c3e50;
  }

  .breadcrumb {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .breadcrumb-link {
    color: #2c9316;
    text-decoration: none;
    font-weight: 500;
  }

  .filters-section {
    display: flex;
    gap: 20px;
    align-items: end;
    margin-bottom: 30px;
    padding: 20px;
    background: #f8f9fa;
    border-radius: 8px;
    flex-wrap: wrap;
  }

  .search-group,
  .filter-group {
    display: flex;
    flex-direction: column;
    gap: 5px;
  }

  .search-group label,
  .filter-group label {
    font-weight: 500;
    font-size: 14px;
  }

  .search-group input,
  .filter-group input,
  .filter-group select {
    padding: 8px 12px;
    border: 1px solid #ddd;
    border-radius: 4px;
    font-size: 14px;
  }

  .search-results {
    margin-bottom: 30px;
  }

  .student-cards {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
    gap: 15px;
    margin-top: 15px;
  }

  .student-card {
    background: white;
    padding: 15px;
    border-radius: 8px;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
    cursor: pointer;
    transition: transform 0.2s;
  }

  .student-card:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 8px rgba(0, 0, 0, 0.15);
  }

  .student-info h6 {
    margin: 0 0 5px 0;
    color: #2c3e50;
  }

  .student-info p {
    margin: 0 0 5px 0;
    color: #666;
    font-size: 14px;
  }

  .student-info small {
    color: #999;
    font-size: 12px;
  }

  .selected-student {
    background: white;
    padding: 20px;
    border-radius: 8px;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
    margin-bottom: 30px;
  }

  .student-header h4 {
    margin: 0 0 5px 0;
    color: #2c3e50;
  }

  .student-header p {
    margin: 0 0 15px 0;
    color: #666;
  }

  .student-stats {
    display: flex;
    gap: 20px;
    flex-wrap: wrap;
  }

  .stat-item {
    font-size: 14px;
  }

  .stat-item strong {
    color: #2c3e50;
  }

  .enrollments-section {
    background: white;
    border-radius: 8px;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
    overflow: hidden;
  }

  .enrollments-section h5 {
    margin: 0;
    padding: 20px 20px 0 20px;
    color: #2c3e50;
  }

  .table-container {
    overflow-x: auto;
  }

  .table {
    margin: 0;
    font-size: 14px;
  }

  .table th {
    background: #f8f9fa;
    border-bottom: 2px solid #dee2e6;
    font-weight: 600;
    white-space: nowrap;
  }

  .course-info strong {
    display: block;
    color: #2c3e50;
  }

  .course-info small {
    color: #666;
  }

  .date-info {
    font-size: 12px;
    color: #666;
  }

  .status-badge {
    padding: 4px 8px;
    border-radius: 12px;
    font-size: 12px;
    font-weight: 500;
  }

  .status-badge.enrolled {
    background: #cce5ff;
    color: #004085;
  }

  .status-badge.active {
    background: #d4edda;
    color: #155724;
  }

  .status-badge.completed {
    background: #d1ecf1;
    color: #0c5460;
  }

  .status-badge.dropped {
    background: #f8d7da;
    color: #721c24;
  }

  .status-badge.inactive {
    background: #e2e3e5;
    color: #383d41;
  }

  .status-badge.suspended {
    background: #fff3cd;
    color: #856404;
  }

  .payment-badge {
    padding: 2px 6px;
    border-radius: 8px;
    font-size: 11px;
    font-weight: 500;
  }

  .payment-badge.pending {
    background: #fff3cd;
    color: #856404;
  }

  .payment-badge.paid {
    background: #d4edda;
    color: #155724;
  }

  .payment-badge.partial {
    background: #cce5ff;
    color: #004085;
  }

  .payment-badge.overdue {
    background: #f8d7da;
    color: #721c24;
  }

  .payment-badge.waived {
    background: #e2e3e5;
    color: #383d41;
  }

  .grade-info {
    text-align: center;
  }

  .grade {
    font-weight: bold;
    color: #2c9316;
  }

  .grade-info small {
    display: block;
    font-size: 10px;
    color: #666;
  }

  .form-group {
    margin-bottom: 15px;
  }

  .form-group label {
    font-weight: 500;
    margin-bottom: 5px;
    display: block;
  }

  .form-control {
    width: 100%;
    padding: 8px 12px;
    border: 1px solid #ddd;
    border-radius: 4px;
    font-size: 14px;
  }

  .history-list {
    max-height: 300px;
    overflow-y: auto;
  }

  .history-item {
    padding: 10px 0;
    border-bottom: 1px solid #eee;
  }

  .history-item:last-child {
    border-bottom: none;
  }

  .history-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 5px;
  }

  .history-reason,
  .history-notes {
    font-size: 14px;
    margin-top: 5px;
  }

  .btn {
    padding: 4px 8px;
    border-radius: 4px;
    border: none;
    cursor: pointer;
    font-size: 12px;
    display: inline-flex;
    align-items: center;
    gap: 3px;
  }

  .btn-outline-primary {
    background: transparent;
    color: #2c9316;
    border: 1px solid #2c9316;
  }

  .btn-outline-info {
    background: transparent;
    color: #17a2b8;
    border: 1px solid #17a2b8;
  }

  .btn-sm {
    padding: 4px 8px;
    font-size: 12px;
  }

  @media (max-width: 768px) {
    .filters-section {
      flex-direction: column;
      align-items: stretch;
    }

    .student-stats {
      flex-direction: column;
      gap: 10px;
    }

    .table {
      font-size: 12px;
    }
  }
</style>
