<template>
  <div class="scrollable-view">
    <div class="course-matching-container">
      <div class="header-section">
        <h3 class="page-title">Kursmatchning</h3>
        <!-- Removed Tillbaka till Admin link and breadcrumb -->
      </div>

      <div class="content-grid">
        <!-- File Upload Section - 30% width, centered -->
        <div class="card card-upload">
          <div class="card-header">
            <h5>Batch-bearbetning av studenter</h5>
          </div>

          <div class="card-body">
            <div class="file-upload-section">
              <label for="studentFile" class="file-upload-label">
                <span class="label-text">Excel-fil med studenter</span>
              </label>
              <div class="file-upload-controls">
                <input
                  type="file"
                  id="studentFile"
                  ref="studentFileInput"
                  @change="handleFileChange"
                  accept=".xlsx,.xls"
                  class="file-input-hidden"
                />
                <button
                  type="button"
                  class="btn btn-logo file-select-btn"
                  @click="triggerFileSelect"
                >
                  <span class="btn-icon">📁</span>
                  <span>Välj fil</span>
                </button>
                <div v-if="selectedFile" class="selected-file-display">
                  <span class="file-icon">📄</span>
                  <span class="file-name">{{ selectedFile.name }}</span>
                  <span class="file-size" v-if="selectedFile.size">
                    ({{ formatFileSize(selectedFile.size) }})
                  </span>
                </div>
              </div>
            </div>

            <button
              class="btn btn-success process-btn"
              @click="processStudents"
              :disabled="isProcessing || !selectedFile"
            >
              {{ isProcessing ? 'Bearbetar...' : 'Bearbeta studenter' }}
            </button>
          </div>
        </div>

        <!-- Uploaded Students Section - 100% width -->
        <div v-if="uploadedStudents.length > 0" class="card card-full-width">
          <div class="card-header">
            <h5>Uppladdade studenter ({{ uploadedStudents.length }})</h5>
          </div>
          <div class="card-body">
            <div class="student-list scrollable-student-list">
              <div v-for="(student, index) in uploadedStudents" :key="index" class="student-item">
                <div class="student-header" @click="toggleStudentExpansion(index)">
                  <span class="student-name">{{ student.name }}</span>
                  <span class="student-count">
                    ({{ getEnrollmentCount(student.email) }} kurser)
                  </span>
                  <span class="expand-icon">{{ expandedStudents[index] ? '▼' : '▶' }}</span>
                </div>
                <div v-if="expandedStudents[index]" class="student-education-details">
                  <div v-if="student.education && student.education.length > 0">
                    <div
                      v-for="(edu, eduIdx) in student.education"
                      :key="eduIdx"
                      class="education-item"
                    >
                      <strong>{{ edu.type === 'CoursePackage' ? 'Kurspaket' : 'Kurs' }}:</strong>
                      {{ edu.name }}
                      <span v-if="edu.startDate || edu.endDate" class="education-dates">
                        ({{
                          edu.startDate ? new Date(edu.startDate).toLocaleDateString('sv-SE') : '?'
                        }}
                        -
                        {{ edu.endDate ? new Date(edu.endDate).toLocaleDateString('sv-SE') : '?' }})
                      </span>
                      <span v-if="edu.slutprovDate" class="slutprov-date">
                        – Slutprov: {{ new Date(edu.slutprovDate).toLocaleDateString('sv-SE') }}
                      </span>
                    </div>
                  </div>
                  <div v-else class="no-education">Inga utbildningsposter hittades</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Processing Results Section - 100% width -->
        <div v-if="processingResults" class="card card-full-width">
          <div class="card-header">
            <h5>Bearbetningsresultat</h5>
          </div>
          <div class="card-body">
            <div class="processing-results">
              <h6>Bearbetningsresultat:</h6>
              <div class="result-stats">
                <div class="stat-item">
                  <span class="stat-label">Inskrivningar skapade:</span>
                  <span class="stat-value success">{{ processingResults.enrollments.length }}</span>
                </div>
                <div class="stat-item">
                  <span class="stat-label">Notifikationer:</span>
                  <span class="stat-value warning">{{ processingResults.warnings.length }}</span>
                </div>
                <div class="stat-item">
                  <span class="stat-label">Fel:</span>
                  <span class="stat-value error">{{ processingResults.errors.length }}</span>
                </div>
              </div>

              <!-- Scrollable list of created enrollments -->
              <div v-if="processingResults.enrollments.length > 0" class="enrollments-scroll-list">
                <h6>Skapade inskrivningar:</h6>
                <ul>
                  <li
                    v-for="(enrollment, idx) in processingResults.enrollments"
                    :key="enrollment._id || idx"
                  >
                    {{ enrollment.studentEmail }} –
                    <span v-if="enrollment.courseInstanceName">
                      {{ enrollment.courseInstanceName }}
                    </span>
                    <span v-else>kursinstans</span>
                    –
                    {{
                      enrollment.startDate
                        ? new Date(enrollment.startDate).toLocaleDateString('sv-SE')
                        : ''
                    }}
                    till
                    {{
                      enrollment.endDate
                        ? new Date(enrollment.endDate).toLocaleDateString('sv-SE')
                        : ''
                    }}
                    <span v-if="enrollment.slutprovDate" class="slutprov-date">
                      – Slutprov:
                      {{ new Date(enrollment.slutprovDate).toLocaleDateString('sv-SE') }}
                    </span>
                    – {{ enrollment.status }}
                  </li>
                </ul>
              </div>

              <div v-if="processingResults.warnings.length > 0" class="warnings-section">
                <h6>Notifikationer:</h6>
                <div class="warning-list">
                  <div
                    v-for="(warning, index) in processingResults.warnings"
                    :key="index"
                    class="warning-item"
                  >
                    <span class="notification-icon">ℹ️</span>
                    <span class="notification-message">{{ formatWarningMessage(warning) }}</span>
                  </div>
                </div>
              </div>

              <div v-if="processingResults.errors.length > 0" class="errors-section">
                <h6>Fel:</h6>
                <div class="error-list">
                  <div
                    v-for="(error, index) in processingResults.errors"
                    :key="index"
                    class="error-item"
                  >
                    <strong>{{ error.courseName }}:</strong>
                    {{ error.error }}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
  import { ref, onMounted, computed } from 'vue'
  import client from '@/api/client.js'
  import { useToast } from '@/composables/useToast.js'
  import { useStore } from 'vuex'

  export default {
    name: 'CourseMatching',
    setup() {
      const store = useStore()
      const toast = useToast()
      const selectedFile = ref(null) // Store file here
      const uploadedStudents = ref([]) // Populated from backend response
      const isProcessing = ref(false)
      const processingResults = ref(null)
      const courses = ref([])
      const expandedStudents = ref({}) // Track which students are expanded
      // Remove statistics and statsFilters

      const studentFileInput = ref(null)

      const triggerFileSelect = () => {
        if (studentFileInput.value) studentFileInput.value.click()
      }

      const handleFileChange = (event) => {
        const file = event.target.files[0]
        if (!file) return
        selectedFile.value = file
        uploadedStudents.value = []
        processingResults.value = null
      }

      const processStudents = async () => {
        if (!selectedFile.value) return
        isProcessing.value = true
        try {
          const formData = new FormData()
          formData.append('file', selectedFile.value)
          const response = await client.post('/upload-students', formData, {
            headers: { 'Content-Type': 'multipart/form-data' },
          })
          // Populate students and results from backend
          uploadedStudents.value = response.data.results.students || []
          processingResults.value = response.data.results || null
        } catch (error) {
          console.error('Error processing students:', error)
          toast.error(error.message || 'Ett fel uppstod vid bearbetning av studenter.')
        } finally {
          isProcessing.value = false
        }
      }

      const loadCourses = async () => {
        try {
          const response = await client.get('/courses')
          courses.value = response.data
        } catch (error) {
          console.error('Error loading courses:', error)
        }
      }

      // Remove loadStatistics and statsFilters logic

      onMounted(() => {
        loadCourses()
      })

      // Computed properties for authentication status
      const isLoggedIn = computed(() => store.getters.isLoggedIn)
      const userRole = computed(() => store.getters.userRole)
      const isAdmin = computed(() => store.getters.isAdmin)

      // Helper to count enrollments per student
      const getEnrollmentCount = (email) => {
        if (!processingResults.value || !processingResults.value.enrollments) return 0
        return processingResults.value.enrollments.filter((e) => e.studentEmail === email).length
      }

      // Toggle student expansion
      const toggleStudentExpansion = (index) => {
        expandedStudents.value[index] = !expandedStudents.value[index]
      }

      // Format warning messages to be more user-friendly
      const formatWarningMessage = (warning) => {
        // If message is already formatted (from backend), use it
        if (warning.message && !warning.message.includes(':')) {
          return warning.message
        }

        // Otherwise format based on type
        switch (warning.type) {
          case 'package_added':
            return (
              warning.message ||
              `Kurspaket "${warning.packageName || 'Okänt paket'}" har lagts till för elev ${
                warning.studentName || 'okänd'
              }.`
            )
          case 'no_match':
            return `Ingen matchande kurs hittades för "${warning.courseName || 'okänd kurs'}".`
          default:
            // Remove type prefix if present
            const message = warning.message || ''
            const colonIndex = message.indexOf(':')
            return colonIndex > 0 ? message.substring(colonIndex + 1).trim() : message
        }
      }

      // Format file size for display
      const formatFileSize = (bytes) => {
        if (bytes === 0) return '0 Bytes'
        const k = 1024
        const sizes = ['Bytes', 'KB', 'MB', 'GB']
        const i = Math.floor(Math.log(bytes) / Math.log(k))
        return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i]
      }

      return {
        isLoggedIn,
        userRole,
        isAdmin,
        studentFileInput,
        selectedFile,
        uploadedStudents,
        isProcessing,
        processingResults,
        courses,
        // Remove statistics and statsFilters from returned object
        handleFileChange,
        triggerFileSelect,
        processStudents,
        // Remove loadStatistics,
        getEnrollmentCount,
        expandedStudents,
        toggleStudentExpansion,
        formatWarningMessage,
        formatFileSize,
      }
    },
  }
</script>

<style scoped>
  .scrollable-view {
    width: 100%;
    height: 100%;
    overflow: auto;
    box-sizing: border-box;
    padding-bottom: 180px;
  }
  .course-matching-container {
    height: 100%;
    overflow: auto;
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

  .content-grid {
    display: flex;
    flex-direction: column;
    gap: 20px;
    align-items: center;
  }

  .card {
    background: white;
    border-radius: 8px;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
    overflow: hidden;
  }

  .card-upload {
    width: 30%;
    min-width: 400px;
    max-width: 600px;
  }

  .card-full-width {
    width: 100%;
  }

  .card-header {
    background: #f8f9fa;
    padding: 15px 20px;
    border-bottom: 1px solid #dee2e6;
  }

  .card-header h5 {
    margin: 0;
    color: #2c3e50;
  }

  .card-body {
    padding: 20px;
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

  .file-upload-section {
    margin-bottom: 20px;
    padding: 20px;
    background: #f8f9fa;
    border-radius: 8px;
    border: 1px solid #e0e0e0;
    width: 100%;
    box-sizing: border-box;
  }

  .process-btn {
    width: 100%;
    margin-top: 10px;
  }

  .file-upload-label {
    display: block;
    margin-bottom: 12px;
    font-weight: 500;
    color: #2c3e50;
    font-size: 14px;
  }

  .label-text {
    display: inline-block;
  }

  .file-upload-controls {
    display: flex;
    align-items: center;
    gap: 12px;
    flex-wrap: wrap;
    width: 100%;
  }

  .file-input-hidden {
    display: none !important;
  }

  .file-select-btn {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 10px 20px;
    font-size: 14px;
    font-weight: 500;
    border-radius: 6px;
    transition: all 0.2s ease;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  }

  .file-select-btn:hover {
    transform: translateY(-1px);
    box-shadow: 0 4px 6px rgba(0, 0, 0, 0.15);
  }

  .btn-icon {
    font-size: 16px;
  }

  .selected-file-display {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 10px 16px;
    background: white;
    border: 1px solid #d0d0d0;
    border-radius: 6px;
    font-size: 14px;
    color: #2c3e50;
    flex: 1;
    min-width: 200px;
    width: 100%;
    max-width: 100%;
    box-sizing: border-box;
  }

  .file-icon {
    font-size: 18px;
    flex-shrink: 0;
  }

  .file-name {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-weight: 500;
    color: #2c9316;
  }

  .file-size {
    color: #666;
    font-size: 0.9em;
    flex-shrink: 0;
  }

  .threshold-value {
    margin-left: 10px;
    font-weight: bold;
    color: #2c9316;
  }

  .search-result {
    margin-top: 20px;
    padding: 15px;
    border-radius: 4px;
  }

  .match-success {
    background: #d4edda;
    border: 1px solid #c3e6cb;
    color: #155724;
  }

  .match-failure {
    background: #f8d7da;
    border: 1px solid #f5c6cb;
    color: #721c24;
  }

  .match-info {
    margin-bottom: 5px;
  }

  .student-list {
    max-height: none;
    overflow-y: visible;
  }

  .student-item {
    padding: 5px 0;
    border-bottom: 1px solid #eee;
  }

  .student-header {
    display: flex;
    align-items: center;
    gap: 8px;
    cursor: pointer;
    padding: 4px 0;
    user-select: none;
  }

  .student-header:hover {
    background-color: #f0f0f0;
    border-radius: 4px;
    padding-left: 4px;
    padding-right: 4px;
  }

  .student-name {
    font-weight: 500;
  }

  .student-count {
    color: #666;
    font-size: 0.9em;
  }

  .expand-icon {
    margin-left: auto;
    color: #999;
    font-size: 0.8em;
  }

  .student-education-details {
    margin-top: 8px;
    margin-left: 20px;
    padding: 8px;
    background-color: #f8f9fa;
    border-radius: 4px;
    border-left: 3px solid #2c9316;
  }

  .education-item {
    padding: 4px 0;
    font-size: 0.9em;
  }

  .education-dates {
    color: #666;
    font-size: 0.85em;
    margin-left: 8px;
  }

  .no-education {
    color: #999;
    font-style: italic;
    font-size: 0.9em;
  }

  .more-students {
    font-style: italic;
    color: #666;
    padding: 5px 0;
  }

  .processing-results {
    margin-top: 20px;
    padding: 15px;
    background: #f8f9fa;
    border-radius: 4px;
  }

  .result-stats {
    display: flex;
    flex-direction: column;
    gap: 10px;
    margin-bottom: 15px;
  }

  .stat-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 8px 0;
    border-bottom: 1px solid #eee;
  }

  .stat-item:last-child {
    border-bottom: none;
  }

  .stat-label {
    font-weight: 500;
  }

  .stat-value {
    font-weight: bold;
  }

  .stat-value.success {
    color: #28a745;
  }

  .stat-value.warning {
    color: #ffc107;
  }

  .stat-value.error {
    color: #dc3545;
  }

  .warnings-section,
  .errors-section {
    margin-top: 15px;
  }

  .warning-list,
  .error-list {
    max-height: none;
    overflow-y: visible;
  }

  .warning-item,
  .error-item {
    padding: 8px 0;
    border-bottom: 1px solid #eee;
    font-size: 14px;
    display: flex;
    align-items: flex-start;
    gap: 8px;
  }

  .notification-icon {
    flex-shrink: 0;
    font-size: 16px;
  }

  .notification-message {
    flex: 1;
    line-height: 1.4;
  }

  .slutprov-date {
    color: #2c9316;
    font-weight: 500;
  }

  .statistics-section {
    margin-top: 20px;
  }

  .stats-table {
    max-height: 300px;
    overflow-y: auto;
  }

  .table {
    font-size: 14px;
  }

  .table th {
    background: #f8f9fa;
    position: sticky;
    top: 0;
  }

  .btn {
    padding: 8px 16px;
    border-radius: 4px;
    border: none;
    cursor: pointer;
    font-size: 14px;
    margin-right: 10px;
  }

  .btn-primary {
    background: #2c9316;
    color: white;
  }

  /* Logo blue button */
  .btn-logo {
    background: #2b5cab; /* approximate Mindful logo blue */
    color: #ffffff;
  }
  .btn-logo:hover {
    filter: brightness(0.95);
  }

  .btn-success {
    background: #28a745;
    color: white;
  }

  .btn-info {
    background: #17a2b8;
    color: white;
  }

  .btn-outline-primary {
    background: transparent;
    color: #2c9316;
    border: 1px solid #2c9316;
  }

  .btn-sm {
    padding: 4px 8px;
    font-size: 12px;
  }

  .text-success {
    color: #28a745;
  }

  .text-danger {
    color: #dc3545;
  }

  .text-primary {
    color: #007bff;
  }

  .scrollable-student-list {
    max-height: none;
    overflow-y: visible;
    border: 1px solid #eee;
    border-radius: 4px;
    padding: 4px 0;
    margin-bottom: 8px;
  }

  .enrollments-scroll-list {
    max-height: none;
    overflow-y: visible;
    border: 1px solid #eee;
    border-radius: 4px;
    padding: 6px 10px;
    margin-bottom: 12px;
    background: #fafbfc;
  }
  .enrollments-scroll-list ul {
    list-style: none;
    padding: 0;
    margin: 0;
  }
  .enrollments-scroll-list li {
    padding: 2px 0;
    font-size: 0.97em;
    border-bottom: 1px solid #f0f0f0;
  }
  .enrollments-scroll-list li:last-child {
    border-bottom: none;
  }

  @media (max-width: 768px) {
    .content-grid {
      align-items: stretch;
    }

    .card-upload {
      width: 100%;
      min-width: unset;
      max-width: 100%;
    }

    .card-full-width {
      width: 100%;
    }

    .result-stats {
      grid-template-columns: 1fr;
    }
  }
</style>
