<template>
  <div class="scrollable-view">
    <div class="Reports-wrapper">
      <div class="Reports-header">
        <div class="Reports-title">
          <h2><v-icon left>mdi-table</v-icon>Kompletionsrapporter</h2>
          <p class="subtitle">Följ elevs och grupps framsteg på modulnivå</p>
        </div>
        <v-spacer></v-spacer>
        <v-select
          v-model="selectedInstance"
          :items="courseInstances"
          item-title="courseName"
          item-value="_id"
          label="Kursinstans"
          clearable
        />
      </div>

      <v-divider></v-divider>

      <div class="Reports-filters">
        <v-row>
          <v-col cols="12" sm="6" md="4">
            <v-select
              v-model="selectedStudent"
              :items="filteredStudents"
              item-title="name"
              item-value="_id"
              label="Elev"
              clearable
              dense
            />
          </v-col>

          <v-col cols="12" sm="6" md="4">
            <v-text-field
              v-model="searchQuery"
              placeholder="Sök efter elev eller modul..."
              append-icon="mdi-magnify"
              class="search-input"
            />
          </v-col>

          <v-col cols="12" sm="6" md="4">
            <v-btn color="primary" @click="loadReport" :disabled="!selectedInstance || !selectedStudent">Ladda rapport</v-btn>
          </v-col>
        </v-row>
      </div>

      <div v-if="loading" class="loading-section">
        <v-progress-linear indeterminate></v-progress-linear>
      </div>

      <div v-else-if="reportError" class="error-section">
        <v-alert type="error" density="compact">
          Kunde inte ladda rapport: {{ reportError }}
        </v-alert>
      </div>

      <div v-else class="Reports-content">
        <v-card>
          <v-card-title>
            <v-icon left>mdi-chart-line</v-icon>
            <span>Kompletionsrapport: {{ selectedInstanceName }}</span>
          </v-card-title>

          <v-card-text>
            <v-container>
              <v-row>
                <v-col cols="12" sm="6" md="4">
                  <v-card class="stat-card gradient-green">
                    <v-card-title>
                      <v-card-subtitle>Totala moduler</v-card-subtitle>
                    </v-card-title>
                    <v-card-text>
                      <h3 class="display-2">{{ totalModules }}</h3>
                    </v-card-text>
                  </v-card>
                </v-col>

                <v-col cols="12" sm="6" md="4">
                  <v-card class="stat-card gradient-yellow">
                    <v-card-title>
                      <v-card-subtitle>Slutförda moduler</v-card-subtitle>
                    </v-card-title>
                    <v-card-text>
                      <h3 class="display-2">{{ completedModules }}</h3>
                    </v-card-text>
                  </v-card>
                </v-col>

                <v-col cols="12" sm="6" md="4">
                  <v-card class="stat-card gradient-blue">
                    <v-card-title>
                      <v-card-subtitle>Genomslagsfrekvens</v-card-subtitle>
                    </v-card-title>
                    <v-card-text>
                      <h3 class="display-2">{{ completionRate }}%</h3>
                    </v-card-text>
                  </v-card>
                </v-col>
              </v-row>

              <v-divider></v-divider>

              <v-subheader>Komponentnivå detaljer</v-subheader>

              <v-data-table
                :items="tableData"
                :items-per-page="10"
                :search="searchQuery"
                loading-text="Laddar..."
                no-data-text="Inga moduler hittades"
              >
                <template v-slot:headers>
                  <tr>
                    <th>Modul</th>
                    <th>Status</th>
                    <th>Senast uppdaterad</th>
                  </tr>
                </template>
                <template v-slot:item="{ item }">
                  <tr>
                    <td>{{ item.moduleNumber }}</td>
                    <td>
                      <v-icon v-if="item.status === '✓'" color="green">mdi-check</v-icon>
                      <v-icon v-else-if="item.status === '✗'" color="red">mdi-close</v-icon>
                      <span v-else>Ej valt</span>
                    </td>
                    <td>
                      <span v-if="item.updatedAt">{{ formatDate(item.updatedAt) }}</span>
                      <span v-else>Ej uppfört</span>
                    </td>
                  </tr>
                </template>
              </v-data-table>
            </v-container>
          </v-card-text>

          <v-card-actions>
            <v-btn
              color="primary"
              :disabled="!selectedInstance || !selectedStudent"
              @click="downloadReport"
            >
              Exportera rapport
            </v-btn>
            <v-spacer></v-spacer>
            <v-btn
              @click="resetFilters"
              variant="text"
            >
              Återställ filter
            </v-btn>
          </v-card-actions>
        </v-card>
      </div>
    </div>
  </div>
</template>

<script>
import { ref, computed, onMounted } from 'vue'
import { useStore } from 'vuex'
import client from '@/api/client.js'

export default {
  name: 'Reports',
  setup() {
    const store = useStore()
    const courseInstances = ref([])
    const selectedInstance = ref('')
    const selectedStudent = ref('')
    const loading = ref(false)
    const reportError = ref(null)
    const searchQuery = ref('')
    const totalModules = ref(0)
    const completedModules = ref(0)
    const completionRate = ref(0)
    const tableData = ref([])

    const loadCourseInstances = async () => {
      loading.value = true
      try {
        const response = await client.get('/course-instances')
        courseInstances.value = response.data.instances || response.data
      } catch {
        courseInstances.value = []
      } finally {
        loading.value = false
      }
    }

    onMounted(() => {
      loadCourseInstances()
    })

    const filteredStudents = computed(() => {
      if (!selectedInstance.value) return []
      return store.getters['students/getStudents'].filter(
        s => s.enrollments?.some(e => String(e.courseInstanceId) === String(selectedInstance.value))
      )
    })

    const selectedInstanceName = computed(() => {
      if (!selectedInstance.value) return 'Ingen kurs vald'
      const inst = courseInstances.value.find(i => i._id === selectedInstance.value)
      return inst?.courseName || ''
    })

    const loadReport = async () => {
      loading.value = true
      reportError.value = null

      if (!selectedInstance.value || !selectedStudent.value) {
        reportError.value = 'Välj både kursinstans och elev'
        loading.value = false
        return
      }

      try {
        const response = await client.get(
          `/learning/instances/${selectedInstance.value}/report/${selectedStudent.value}`
        )
        const data = response.data
        if (data.success) {
          totalModules.value = data.totalModules || 0
          completedModules.value = data.completedModules || 0
          completionRate.value = parseFloat(data.completionRate) || 0
          tableData.value = Object.entries(data.completedComponents || {}).map(
            ([moduleNumber, status]) => ({ moduleNumber, status })
          )
        }
      } catch (err) {
        reportError.value = err.response?.data?.error || 'Nätverksfel'
      } finally {
        loading.value = false
      }
    }

    const downloadReport = () => {
      // TODO: implement CSV/PDF export
    }

    const resetFilters = () => {
      selectedInstance.value = ''
      selectedStudent.value = ''
      searchQuery.value = ''
      tableData.value = []
      totalModules.value = 0
      completedModules.value = 0
      completionRate.value = 0
      reportError.value = null
    }

    const formatDate = (dateStr) => {
      if (!dateStr) return ''
      const date = new Date(dateStr)
      return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
    }

    return {
      courseInstances,
      selectedInstance,
      selectedStudent,
      loading,
      reportError,
      searchQuery,
      filteredStudents,
      selectedInstanceName,
      totalModules,
      completedModules,
      completionRate,
      tableData,
      loadCourseInstances,
      loadReport,
      downloadReport,
      resetFilters,
      formatDate,
    }
  },
}
</script>

<style scoped>
.Reports-wrapper {
  padding: 24px;
}

.Reports-header {
  margin-bottom: 24px;
  padding-bottom: 16px;
  border-bottom: 1px solid #e0e0e0;
}

.Reports-title {
  margin: 0;
}

.subtitle {
  color: #666;
  font-size: 14px;
  margin-top: 4px;
}

.Reports-filters {
  margin-top: 20px;
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
}

.search-input {
  width: 100%;
  margin-bottom: 0;
}

.stat-card {
  background: white;
  border-radius: 8px;
  padding: 20px;
  box-shadow: 0 1px 3px rgba(0,0,0,0.1);
  text-align: center;
}

.gradient-green {
  background: linear-gradient(135deg, #48bb78, #38a169);
  color: white;
}

.gradient-yellow {
  background: linear-gradient(135deg, #f6c23e, #f2a92c);
  color: #212121;
}

.gradient-blue {
  background: linear-gradient(135deg, #40a0f5, #3085d6);
  color: white;
}
</style>
