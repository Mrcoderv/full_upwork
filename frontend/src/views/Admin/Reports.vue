<template>
  <div class="scrollable-view">
    <div class="Reports-wrapper">
      <div class="Reports-header">
        <div class="Reports-title">
          <h2><v-icon left>mdi-table</v icon>Kompletionsrapporter</h2>
          <p class="subtitle">Följ elevs och grupps framsteg på modulnivå</p>
        </div>
        <v-spacer></v-spacer>
        <v-select
          v-model="selectedInstance"
          :items="courseInstances"
          item-text="courseName"
          item-value="_id"
          label="Kursinstans"
          clearable
          @filter="fetchInstances"
        />
      </div>

      <v-divider></v-divider>

      <div class="Reports-filters">
        <v-row>
          <v-col cols="12" sm="6" md="4">
            <v-select
              v-model="selectedStudent"
              :items="filteredStudents"
              item-text="name"
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
              @input="applyFilter"
            />
          </v-col>

          <v-col cols="12" sm="6" md="4">
            <v-btn color="primary" @click="loadReport">Ladda rapport</v-btn>
          </v-col>
        </v-row>
      </div>

      <div v-if="loading" class="loading-section">
        <v-bar-linear-indeterminate></v-bar-linear-indeterminate>
      </div>

      <div v-else-if="reportError" class="error-section">
        <v-alert :variant=" 'error'" dense>
          Kunde inte ladda rapport: {{ reportError }}
        </v-alert>
      </div>

      <div v-else class="Reports-content">
        <v-card>
          <v-card-title>
            <v-card-title-text>
              <v-icon left mdi="show-chart"></icon>
              <span>Kompletionsrapport: {{ selectedInstance ? selectedInstance.courseName : 'Ingen kurs vald' }}</span>
            </v-card-title-text>
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
                    </v-card-text>
                    <v-card-text>
                      <h3 class="display-2">{{ completedModules }}</h3>
                    </v-card-text>
                  </v-card>
                </v-col>

                <v-col cols="12" sm="6" md="4">
                  <v-card class="stat-card gradient-blue">
                    <v-card-title>
                      <v-card-subtitle>Genomslagsfrekvens</v-card-subtitle>
                    </v-card-text>
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
                :loading="loading"
                :search="search"
                :loading-text=" 'Laddar...' "
                :no-data-text=" 'Inga modulator hittades' "
                :custom-header="true"
              >
                <template v-slot:default>
                  <thead>
                    <tr>
                      <th>Modul</th>
                      <th>Status</th>
                      <th>Senast uppdaterad</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="component in tableData" :key="component.moduleNumber">
                      <td>{{ component.moduleNumber }}</td>
                      <td>
                        <v-icon
                          v-if="component.status === '✓'"
                          color="green"
                        >mdi-check</v-icon>
                        <v-icon
                          v-if="component.status === '✗'"
                          color="red"
                        >mdi-close</v-icon>
                        <span v-else>Ej valt</span>
                      </td>
                      <td>
                        <span v-if="component.updatedAt">
                          {{ formatDate(component.updatedAt) }}
                        </span>
                        <span v-else>Ej uppfört</span>
                      </td>
                    </tr>
                  </tbody>
                </template>
              </v-data-table>
            </v-container>
          </v-card-text>

          <v-card-actions>
            <v-btn
              color="primary"
              :disabled="!selectedInstance || !selectedStudent"
              @downloadReport
            >
              Exportera rapport
            </v-btn>
            <v-spacer></v-spacer>
            <v-btn
              @resetFilters
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

    // Course instances from API
    const loadCourseInstances = async () => {
      // Fetch course instances - would need API endpoint
      // For now, use placeholder data or fetch from store
    }

    onMounted(() => {
      loadCourseInstances()
    })

    const filteredStudents = computed(() => {
      if (!selectedInstance.value) return []
      // Filter students enrolled in this course instance
      return store.getters['students/getStudents'].filter(
        s => s.enrollments?.some(e => String(e.courseInstanceId) === String(selectedInstance.value))
      )
    })

    const applyFilter = () => {
      // Apply search filter
    }

    const loadReport = async () => {
      loading.value = true
      reportError.value = null

      if (!selectedInstance.value || !selectedStudent.value) {
        reportError.value = 'Välj både kursinstans och elev'
        loading.value = false
        return
      }

      try {
        const response = await fetch(`/api/learning/instances/${selectedInstance.value}/report/${selectedStudent.value}`, {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' },
        })

        if (response.ok) {
          const data = await response.json()
          if (data.success) {
            // Update UI with report data
            totalModules.value = data.totalModules
            completedModules.value = data.completedModules
            completionRate.value = parseFloat(data.completionRate)
            tableData.value = Object.entries(data.completedComponents || {}).map(
              ([moduleNumber, status]) => ({ moduleNumber, status })
            )
          }
        } else {
          const err = await response.text()
          reportError.value = err
        }
      } catch (err) {
        reportError.value = 'Nätverksfel'
      } finally {
        loading.value = false
      }
    }

    const formatDate = (dateStr) => {
      if (!dateStr) return ''
      const date = new Date(dateStr)
      return `${date.getFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`
    }

    const getStatusColor = (status) => {
      if (status === '✓') return 'green'
      if (status === '✗') return 'red'
      return 'gray'
    }

    const tableData = computed(() => {
      if (!completionRate.value) return []
      return Object.entries(completionComponents || {}).map(
        ([moduleNumber, status]) => ({ moduleNumber, status })
      )
    })

    const completionComponents = reactive({})

    return {
      courseInstances,
      selectedInstance,
      selectedStudent,
      loading,
      reportError,
      searchQuery,
      filteredStudents,
      totalModules: ref(0),
      completedModules: ref(0),
      completionRate: ref(0),
      tableData,
      completionComponents,
      loadCourseInstances,
      loadReport,
      formatDate,
      getStatusColor,
      applyFilter,
    }
  },
  computed: {
    // Computed properties for status colors
  }
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
  background: linear-gradient(135ff, #f6c23e, #f2a92c);
  color: #212121;
}

.gradient-blue {
  background: linear-gradient(135deg, #40a0f5, #3085d6);
  color: white;
}

.v-data-table thead tr th {
  background: #f7f9fc;
  padding: 12px 16px;
  font-weight: 600;
  font-size: 12px;
  text-transform: uppercase;
  color: #5f6368;
  border-bottom: 1px solid #eee;
}

.v-data-table tbody tr td {
  padding: 12px 16px;
  border-bottom: 1px solid #eee;
}

.v-data-table tbody tr:hover td {
  background: #fafafa;
}

.v-data-table .mdi {
  width: 20px;
  height: 20px;
}

.unread-badge {
  background: #e53935;
  color: white;
  padding: 2px 6px;
  border-radius: 10px;
  font-size: 12px;
  margin-left: 4px;
}
</style>
