<template>
  <div class="scrollable-view">
    <div class="inactive-students-container">
      <div class="header-section">
        <h3 class="page-title">Inaktiva elever</h3>
        <div class="breadcrumb">
          <svg xmlns="http://www.w3.org/2000/svg" width="30" height="30" viewBox="0 0 24 24">
            <path fill="#2c9316" d="M20 9v6h-8v4.84L4.16 12L12 4.16V9z" />
          </svg>
          <router-link to="/admin/users" class="breadcrumb-link">Tillbaka till Admin</router-link>
        </div>
      </div>

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
          <span class="inactive-count">{{ filteredStudents.length }} elever med avbrott</span>
        </div>
      </div>

      <!-- Error message -->
      <div v-if="errorMessage" class="alert alert-danger">
        {{ errorMessage }}
      </div>

      <!-- Inactive Students Table -->
      <div class="table-container">
        <table class="table">
          <thead>
            <tr>
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
              <td colspan="8" class="text-center">Laddar inaktiva elever...</td>
            </tr>
            <tr v-else-if="filteredStudents.length === 0">
              <td colspan="8" class="text-center">Inga inaktiva elever hittades</td>
            </tr>
            <tr v-for="student in filteredStudents" :key="student._id">
              <td>
                <router-link :to="`/student/${student._id}`" class="student-name-link">
                  {{ student.name }}
                </router-link>
              </td>
              <td>{{ student.personalNumber }}</td>
              <td>{{ student.email }}</td>
              <td>{{ student.municipality || '-' }}</td>
              <td>
                <span v-if="student.teacherId">{{ student.teacherId.name }}</span>
                <span v-else>-</span>
              </td>
              <td>{{ formatDate(student.startDate) }}</td>
              <td>{{ formatDate(student.endDate) }}</td>
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

      <!-- Reactivate Confirmation Dialog -->
      <div v-if="dialogStudent" class="modal-overlay" @click.self="closeDialog">
        <div class="modal-box">
          <h4>Återaktivera elev?</h4>
          <p>
            {{ dialogStudent.name }} återaktiveras som aktiv elev. Eleven läggs tillbaka i
            slutprovslistan och kan återigen delta i aktiviteter.
          </p>
          <div class="modal-actions">
            <button class="btn btn-secondary" @click="closeDialog">Avbryt</button>
            <button class="btn btn-success" :disabled="reactivating" @click="reactivateStudent">
              {{ reactivating ? 'Återaktiverar...' : 'Bekräfta återaktivering' }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useToast } from '@/composables/useToast.js'
import axios from 'axios'

const toast = useToast()

const students = ref([])
const loading = ref(false)
const errorMessage = ref('')
const searchQuery = ref('')
const dialogStudent = ref(null)
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
}

function closeDialog() {
  if (reactivating.value) return
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

.inactive-count {
  font-size: 0.9rem;
  color: #555;
  padding: 8px 0;
}

.student-name-link {
  color: #2c9316;
  font-weight: 600;
  text-decoration: none;
}

.student-name-link:hover {
  text-decoration: underline;
}

.action-buttons {
  display: flex;
  gap: 8px;
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

.modal-box h4 {
  margin-bottom: 12px;
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 20px;
}
</style>
