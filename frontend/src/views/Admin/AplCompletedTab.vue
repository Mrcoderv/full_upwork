<template>
  <div class="apl-completed-container">
    <div class="completed-header">
      <h3>Avslutade praktiker</h3>
      <div class="header-actions">
        <v-text-field
          v-model="search"
          placeholder="Sök elev..."
          append-icon="mdi-magnify"
          dense
          clearable
          class="search-field"
        />
      </div>
    </div>

    <div v-if="loading" class="text-center pa-4">Laddar avslutade praktiker...</div>

    <div v-else-if="filteredRecords.length > 0" class="completed-list">
      <div v-for="record in filteredRecords" :key="record._id" class="completed-card">
        <div class="completed-card-header">
          <router-link :to="`/student/${record.studentId?._id}`" class="student-link">
            {{ record.studentId?.name || 'Okänd elev' }}
          </router-link>
          <v-chip color="green" size="small" label>Avslutad</v-chip>
        </div>
        <div class="completed-card-body">
          <div v-if="record.placementCompany" class="info-row">
            <strong>Praktikplats:</strong> {{ record.placementCompany }}
          </div>
          <div v-if="record.internshipStartDate || record.internshipEndDate" class="info-row">
            <strong>Period:</strong>
            {{ formatDate(record.internshipStartDate || record.aplStartDate) }}
            –
            {{ formatDate(record.internshipEndDate || record.aplEndDate) }}
          </div>
          <div v-if="record.completedAt" class="info-row">
            <strong>Avslutad:</strong> {{ formatDate(record.completedAt) }}
          </div>
          <div v-if="record.notes" class="info-row notes">
            <strong>Anteckningar:</strong> {{ record.notes }}
          </div>
        </div>
      </div>
    </div>

    <div v-else class="empty-state">
      <v-icon size="48" color="grey">mdi-check-circle-outline</v-icon>
      <p>Inga avslutade praktiker</p>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import client from '@/api/client.js'

const records = ref([])
const loading = ref(false)
const search = ref('')

const filteredRecords = computed(() => {
  let result = records.value
  if (search.value) {
    const q = search.value.toLowerCase()
    result = result.filter(r =>
      r.studentId?.name?.toLowerCase().includes(q) ||
      r.placementCompany?.toLowerCase().includes(q)
    )
  }
  return result
})

function formatDate(dateStr) {
  if (!dateStr) return '—'
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('sv-SE')
}

async function loadCompleted() {
  loading.value = true
  try {
    const { data } = await client.get('/apl/records', { params: { status: 'GREEN' } })
    records.value = data || []
  } catch {
    records.value = []
  } finally {
    loading.value = false
  }
}

onMounted(loadCompleted)
</script>

<style scoped>
.apl-completed-container {
  padding: 20px;
}
.completed-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 20px;
}
.completed-header h3 { margin: 0; }
.search-field { max-width: 300px; }
.completed-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.completed-card {
  border: 1px solid #dee2e6;
  border-left: 4px solid #4caf50;
  border-radius: 8px;
  padding: 16px;
  background: #f8fff9;
}
.completed-card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}
.student-link {
  font-weight: 600;
  color: #1976d2;
  text-decoration: none;
}
.student-link:hover { text-decoration: underline; }
.completed-card-body {
  font-size: 14px;
  color: #495057;
}
.info-row {
  margin-bottom: 4px;
}
.info-row.notes {
  font-style: italic;
  color: #6c757d;
  margin-top: 8px;
}
.empty-state {
  text-align: center;
  padding: 40px;
  color: #6c757d;
}
</style>
