<template>
  <div class="card">
    <div class="card-header">
      <h3>APL Information</h3>
    </div>
    <div class="card-body">
      <!-- Current APL Status -->
      <div class="apl-section">
        <h4 class="section-title">Nuvarande Status</h4>
        <div class="status-badge" :class="statusClass">
          <span class="status-label">{{ statusLabel }}</span>
        </div>
        <div v-if="student.aplStatusAuto" class="auto-red-note">
          <strong>Auto-röd:</strong> APL-perioden slutar inom
          {{ student.aplWeeksRemaining }}
          {{ student.aplWeeksRemaining === 1 ? 'vecka' : 'veckor' }} —
          statusen är automatiskt satt till "Snart slut".
        </div>
      </div>

      <!-- APL Period -->
      <div v-if="student.aplStartDate || student.aplEndDate" class="apl-section">
        <h4 class="section-title">APL-period</h4>
        <div class="apl-period-row">
          <strong>Start:</strong>
          <span>{{ formatDateOnly(student.aplStartDate) || '–' }}</span>
        </div>
        <div class="apl-period-row">
          <strong>Slut:</strong>
          <span>{{ formatDateOnly(student.aplEndDate) || '–' }}</span>
          <span v-if="student.aplWeeksRemaining !== null && student.aplWeeksRemaining >= 0" class="weeks-remaining">
            ({{ student.aplWeeksRemaining }} v kvar)
          </span>
        </div>
      </div>

      <!-- Status History -->
      <div v-if="student.aplStatusHistory && student.aplStatusHistory.length > 0" class="apl-section">
        <h4 class="section-title">Statushistorik</h4>
        <div class="history-container">
          <div 
            v-for="(entry, index) in sortedStatusHistory" 
            :key="index" 
            class="history-item"
          >
            <span class="history-status" :class="getStatusClass(entry.status)">
              {{ getStatusLabel(entry.status) }}
            </span>
            <span class="history-date">
              {{ formatDate(entry.changedAt) }}
            </span>
            <span v-if="entry.changedBy" class="history-by">
              av {{ entry.changedBy }}
            </span>
          </div>
        </div>
      </div>

      <!-- Uploaded Files -->
      <div class="apl-section">
        <h4 class="section-title">Uppladdade Filer</h4>
        <FileUploaderDownloader
          :studentId="student._id"
          :studentName="student.name"
        />
      </div>
    </div>
  </div>
</template>

<script>
import { computed } from 'vue';
import FileUploaderDownloader from '@/components/FileUploaderDownloader.vue';

export default {
  name: 'AplTab',
  components: {
    FileUploaderDownloader,
  },
  props: {
    student: {
      type: Object,
      required: true,
    },
  },
  setup(props) {
    const statusMap = {
      GRAY: { label: 'Ny Elev', class: 'status-gray' },
      BLUE: { label: 'Kontaktad', class: 'status-blue' },
      YELLOW: { label: 'APL på gång', class: 'status-yellow' },
      PURPLE: { label: 'Behöver uppföljning', class: 'status-purple' },
      RED: { label: 'Snart slut', class: 'status-red' },
      GREEN: { label: 'Klar praktik', class: 'status-green' },
    };

    const statusLabel = computed(() => {
      const status = props.student.aplStatus || 'GRAY';
      return statusMap[status]?.label || status;
    });

    const statusClass = computed(() => {
      const status = props.student.aplStatus || 'GRAY';
      return statusMap[status]?.class || 'status-gray';
    });

    const sortedStatusHistory = computed(() => {
      if (!props.student.aplStatusHistory || !Array.isArray(props.student.aplStatusHistory)) {
        return [];
      }
      return [...props.student.aplStatusHistory].sort((a, b) => {
        const dateA = new Date(a.changedAt);
        const dateB = new Date(b.changedAt);
        return dateB - dateA; // Most recent first
      });
    });

    const getStatusLabel = (status) => {
      return statusMap[status]?.label || status;
    };

    const getStatusClass = (status) => {
      return statusMap[status]?.class || 'status-gray';
    };

    const formatDate = (dateString) => {
      if (!dateString) return '';
      const date = new Date(dateString);
      return date.toLocaleDateString('sv-SE', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    };

    const formatDateOnly = (dateString) => {
      if (!dateString) return '';
      const date = new Date(dateString);
      if (isNaN(date.getTime())) return '';
      return date.toLocaleDateString('sv-SE', {
        year: 'numeric',
        month: 'numeric',
        day: 'numeric',
      });
    };

    return {
      statusLabel,
      statusClass,
      sortedStatusHistory,
      getStatusLabel,
      getStatusClass,
      formatDate,
      formatDateOnly,
    };
  },
};
</script>

<style scoped>
.card {
  background: white;
  border-radius: 8px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  overflow: hidden;
}

.card-header {
  background: #f8f9fa;
  padding: 15px 20px;
  border-bottom: 1px solid #dee2e6;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.card-header h3 {
  margin: 0;
  color: #2c3e50;
}

.card-body {
  padding: 20px;
}

.apl-section {
  margin-bottom: 30px;
}

.apl-section:last-child {
  margin-bottom: 0;
}

.section-title {
  margin: 0 0 15px 0;
  font-size: 1rem;
  font-weight: 600;
  color: #495057;
  border-bottom: 2px solid #dee2e6;
  padding-bottom: 8px;
}

.status-badge {
  display: inline-block;
  padding: 12px 24px;
  border-radius: 6px;
  font-weight: 600;
  font-size: 1.1rem;
  text-align: center;
  margin-bottom: 10px;
}

.status-gray {
  background-color: #6c757d;
  color: white;
}

.status-blue {
  background-color: #007bff;
  color: white;
}

.status-yellow {
  background-color: #ffc107;
  color: #212529;
}

.status-purple {
  background-color: #6f42c1;
  color: white;
}

.status-red {
  background-color: #dc3545;
  color: white;
}

.status-green {
  background-color: #28a745;
  color: white;
}

.history-container {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.history-item {
  display: flex;
  align-items: center;
  gap: 15px;
  padding: 10px;
  border: 1px solid #dee2e6;
  border-radius: 4px;
  background-color: #f8f9fa;
}

.history-status {
  display: inline-block;
  padding: 4px 12px;
  border-radius: 4px;
  font-size: 0.875rem;
  font-weight: 500;
  min-width: 140px;
  text-align: center;
}

.history-date {
  color: #6c757d;
  font-size: 0.875rem;
  flex: 1;
}

.history-by {
  color: #6c757d;
  font-size: 0.875rem;
  font-style: italic;
}

.auto-red-note {
  margin-top: 12px;
  padding: 10px 12px;
  background: #fce4e4;
  border: 1px solid #f5c6c6;
  border-radius: 4px;
  color: #b02a37;
  font-size: 0.9rem;
}

.apl-period-row {
  margin-bottom: 6px;
  color: #495057;
}

.apl-period-row strong {
  min-width: 60px;
  display: inline-block;
}

.weeks-remaining {
  color: #b02a37;
  font-weight: 600;
}
</style>
