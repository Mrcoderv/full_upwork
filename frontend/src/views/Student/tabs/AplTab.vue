<template>
  <div class="apl-tab-container">
    <div class="apl-header">
      <h2><v-icon left>mdi-folder-library</v-icon>APL Information</h2>
      <v-select
        v-model="studentFilter"
        :items="allStudents"
        item-text="name"
        item-value="_id"
        label="Välj elev"
        clearable
        dense
        @filter="loadStudentAPL"
      />
    </div>

    <div v-if="loading" class="loading-state">
      Laddar APL-data...
    </div>

    <div v-else class="apl-content">
      <!-- Status Overview -->
      <div class="apl-status-overview">
        <v-row>
          <v-col cols="6">
            <v-card class="status-summary-card gray">
              <v-card-title>Grå</v-card-title>
              <v-card-text>{{ grayCount }} elever</v-card-text>
            </v-card>
          </v-col>
          <v-col cols="6">
            <v-card class="status-summary-card blue">
              <v-card-title>Blå</v-card-title>
              <v-card-text>{{ blueCount }} elever</v-card-text>
            </v-card>
          </v-col>
          <v-col cols="6">
            <v-card class="status-summary-card yellow">
              <v-card-title>Gul</v-card-title>
              <v-card-text>{{ yellowCount }} elever</v-card-text>
            </v-card>
          </v-col>
          <v-col cols="6">
            <v-card class="status-summary-card purple">
              <v-card-title>Lila</v-card-title>
              <v-card-text>{{ purpleCount }} elever</v-card-text>
            </v-card>
          </v-col>
        </v-row>
        <v-row>
          <v-col cols="6">
            <v-card class="status-summary-card red">
              <v-card-title>Röd</v-card-title>
              <v-card-text>{{ redCount }} elever</v-card-text>
            </v-card>
          </v-col>
          <v-col cols="6">
            <v-card class="status-summary-card green">
              <v-card-title>Grön</v-card-title>
              <v-card-text>{{ greenCount }} elever</v-card-text>
            </v-card>
          </v-col>
        </v-row>
      </div>

      <!-- APL List -->
      <div v-if="allStudents.length > 0" class="apl-list">
        <v-divider></v-divider>
        <h4>Elevs APL-lista</h4>
        <v-data-table
          :items="aplList"
          :items-per-page="10"
          :loading="loading"
          :search="search"
          :no-data-text=" 'Inga APL-insättningar' "
        >
          <template v-slot:default>
            <thead>
              <tr>
                <th>Elev</th>
                <th>Status</th>
                <th>Periodstart</th>
                <th>Periodslut</th>
                <th>Veckor kvar</th>
                <th>Aktion</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="student in aplList" :key="student._id">
                <td>{{ student.name }}</td>
                <td>
                  <v-badge
                    color="statusColor(student.aplStatus)"
                    :text="getStatusLabel(student.aplStatus)"
                  >
                  </v-badge>
                </td>
                <td>{{ formatDate(student.aplStartDate) }}</td>
                <td>{{ formatDate(student.aplEndDate) }}</td>
                <td v-if="student.aplWeeksRemaining !== null">
                  <v-badge :color="getWeeksRemainingColor(student.aplWeeksRemaining)">
                    {{ student.aplWeeksRemaining }} veckor
                  </v-badge>
                </td>
                <td v-else>
                  —
                </td>
                <td>
                  <v-badge
                    v-if="student.aplBehindSchedule"
                    color="warning"
                    small
                    >Bak i schema</v-badge>
                </td>
                <td>
                  <v-btn
                    small
                    color="primary"
                    @click="viewDetails(student._id)"
                  >
                    Detaljer
                  </v-btn>
                </td>
              </tr>
            </tbody>
          </template>
        </v-data-table>
        </div>

        <!-- No students message -->
        <div v-else class="no-students">
          <v-icon mdi="account-circle" class="large-icon"></v-icon>
          <p>Inga elever med APL-insättning</p>
        </div>
      </div>
    </div>
</template>

<script>
import { ref, onMounted, computed } from 'vue'

export default {
  name: 'AplTab',
  setup() {
    const allStudents = ref([])
    const loading = ref(false)
    const search = ref('')

    // Mock data - in real implementation, would fetch from API
    const mockStudents = [
      {
        _id: '1',
        name: 'Anna Andersson',
        aplStatus: 'RED',
        aplStatusHistory: [
          { status: 'GRAY', changedAt: new Date('2024-01-15') },
          { status: 'RED', changedAt: new Date('2024-08-10') }
        ],
        aplStatusAuto: true,
        aplWeeksRemaining: 2,
        aplStartDate: new Date('2024-01-15'),
        aplEndDate: new Date('2024-08-20')
      },
      {
        _id: '2',
        name: 'Berta Berg',
        aplStatus: 'BLUE',
        aplStatusHistory: [
          { status: 'GRAY', changedAt: new Date('2024-02-01') }
        ],
        aplStatusAuto: false,
        aplWeeksRemaining: 8,
        aplStartDate: new Date('2024-02-05'),
        aplEndDate: new Date('2024-08-10')
      },
      {
        _id: '3',
        name: 'Calle Carlsson',
        aplStatus: 'GREEN',
        aplStatusHistory: [
          { status: 'GRAY', changedAt: new Date('2024-03-10') },
          { status: 'YELLOW', changedAt: new Date('2024-05-20') },
          { status: 'GREEN', changedAt: new Date('2024-07-15') }
        ],
        aplStatusAuto: false,
        aplWeeksRemaining: 6,
        aplStartDate: new Date('2024-03-01'),
        aplEndDate: new Date('2024-08-25')
      }
    ]

    onMounted(() => {
      allStudents.value = mockStudents
      loadStudentAPL()
    })

    const loadStudentAPL = () => {
      // Filter students based on search
      // In real implementation, would fetch from API
    }

    const statusClass = computed(() => {
      const statusMap = {
        GRAY: 'gray',
        BLUE: 'blue',
        YELLOW: 'yellow',
        PURPLE: 'purple',
        RED: 'red',
        GREEN: 'green'
      }
      return statusMap[this.student.aplStatus] || 'gray'
    })

    const statusLabel = computed(() => {
      const labels = {
        GRAY: 'Grå',
        BLUE: 'Blå',
        YELLOW: 'Gul',
        PURPLE: 'Lila',
        RED: 'Röd',
        GREEN: 'Grön'
      }
      return labels[this.student.aplStatus] || 'Ej angivet'
    })

    const getStatusLabel = (status) => {
      const labels = {
        GRAY: 'Grå',
        BLUE: 'Blå',
        YELLOW: 'Gul',
        PURPLE: 'Lila',
        RED: 'Röd',
        GREEN: 'Grön'
      }
      return labels[status] || status
    }

    const getWeeksRemainingColor = (weeks) => {
      if (weeks <= 2) return 'red'
      if (weeks <= 4) return 'orange'
      return 'green'
    }

    const getStatusColor = (status) => {
      const statusMap = {
        GRAY: 'gray',
        BLUE: 'blue',
        YELLOW: 'yellow',
        PURPLE: 'purple',
        RED: 'red',
        GREEN: 'green'
      }
      return statusMap[status] || 'gray'
    }

    // Count students by status
    const grayCount = computed(() => allStudents.value.filter(s => s.aplStatus === 'GRAY').length)
    const blueCount = computed(() => allStudents.value.filter(s => s.aplStatus === 'BLUE').length)
    const yellowCount = computed(() => allStudents.value.filter(s => s.aplStatus === 'YELLOW').length)
    const purpleCount = computed(() => allStudents.value.filter(s => s.aplStatus === 'PURPLE').length)
    const redCount = computed(() => allStudents.value.filter(s => s.aplStatus === 'RED').length)
    const greenCount = computed(() => allStudents.value.filter(s => s.aplStatus === 'GREEN').length)

    // APL list filtered data
    const aplList = computed(() => {
      return allStudents.value.map(student => ({
        ...student,
        statusLabel: getStatusLabel(student.aplStatus),
        statusColor: getStatusColor(student.aplStatus),
        weeksRemainingDisplay: student.aplWeeksRemaining !== null 
          ? `${student.aplWeeksRemaining} veckor`
          : 'Odefinit'
      }))
    })

    // View details for a student
    const viewDetails = (studentId) => {
      // Navigate to student details or show modal
      console.log('View details for:', studentId)
    }

    return {
      allStudents,
      loading,
      search,
      apLList,
      grayCount,
      blueCount,
      yellowCount,
      purpleCount,
      redCount,
      greenCount,
      statusClass,
      statusLabel,
      getStatusLabel,
      getWeeksRemainingColor,
      getStatusColor,
      viewDetails,
      loadStudentAPL
    }
  }
}
</script>

<style scoped>
.apl-tab-container {
  padding: 24px;
  max-width: 1200px;
  margin: 0 auto;
}

.apl-header {
  margin-bottom: 24px;
  padding-bottom: 16px;
  border-bottom: 1px solid #e0e0e0;
}

.apl-status-overview {
  margin-bottom: 24px;
  display: none; /* Hidden by default, can be shown on larger screens */
}

.status-summary-card {
  background: white;
  border-radius: 8px;
  padding: 16px;
  text-align: center;
  box-shadow: 0 1px 3px rgba(0,0,0,0.1);
  min-height: 80px;
}

.status-summary-card gray {
  border-top: 4px solid #78909c;
}

.status-summary-card blue {
  border-top: 4px solid #3f51b5;
}

.status-summary-card yellow {
  border-top: 4px solid #fdd835;
}

.status-summary-card purple {
  border-top: 4px solid #9c27b0;
}

.status-summary-card red {
  border-top: 4px solid #f44336;
}

.status-summary-card green {
  border-top: 4px solid #4caf50;
}

.apl-list {
  margin-top: 20px;
}

.large-icon {
  font-size: 48px;
  color: #b0b0b0;
  margin-bottom: 20px;
}

.no-students {
  text-align: center;
  padding: 40px;
  color: #666;
}
</style>
