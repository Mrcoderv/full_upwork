<template>
  <div class="staff-students-tab">
    <div class="card">
      <div class="card-header">
        <h3>Elever per kurs</h3>
      </div>
      <div class="card-body">
        <!-- Course selector -->
        <div class="course-selector mb-3">
          <label>Välj kurs:</label>
          <select v-model="selectedCourseInstanceId" class="form-control" @change="fetchStudents">
            <option :value="null">— Välj en kurs —</option>
            <option
              v-for="course in allCourses"
              :key="course.instanceId"
              :value="course.instanceId"
            >
              {{ course.courseName }} ({{ course.courseCode }}) — {{ course.studentCount }} elever
            </option>
          </select>
        </div>

        <div v-if="loading" class="loading">
          <div class="spinner"></div>
          <p>Laddar elever...</p>
        </div>

        <div v-else-if="error" class="error-message">
          <p>{{ error }}</p>
        </div>

        <div v-else-if="students.length > 0" class="students-list">
          <table class="students-table">
            <thead>
              <tr>
                <th>Namn</th>
                <th>E-post</th>
                <th>Status</th>
                <th>Betyg</th>
                <th>Inskriven</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="student in students"
                :key="student.studentId"
                class="student-row"
              >
                <td class="student-name">{{ student.name }}</td>
                <td class="student-email">{{ student.email }}</td>
                <td>
                  <span class="status-badge" :class="'status-' + student.status">
                    {{ getStatusLabel(student.status) }}
                  </span>
                </td>
                <td>{{ student.grade || '—' }}</td>
                <td>{{ formatDate(student.enrollmentDate) }}</td>
                <td>
                  <router-link :to="`/student/${student.studentId}`" class="btn btn-sm btn-outline-primary">
                    Visa profil
                  </router-link>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div v-else-if="selectedCourseInstanceId" class="empty-state">
          Inga elever i denna kurs
        </div>

        <div v-else class="empty-state">
          Välj en kurs för att se elever
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import { ref, computed, watch } from 'vue';
import client from '@/api/client.js';

export default {
  name: 'StaffStudentsTab',
  props: {
    teacher: { type: Object, required: true },
    activeCourses: { type: Array, default: () => [] },
    completedCourses: { type: Array, default: () => [] },
  },
  setup(props) {
    const selectedCourseInstanceId = ref(null);
    const students = ref([]);
    const loading = ref(false);
    const error = ref(null);

    const allCourses = computed(() => {
      return [...props.activeCourses, ...props.completedCourses];
    });

    const fetchStudents = async () => {
      if (!selectedCourseInstanceId.value) {
        students.value = [];
        return;
      }

      loading.value = true;
      error.value = null;
      try {
        const response = await client.get(
          `/teachers/${props.teacher._id}/courses/${selectedCourseInstanceId.value}/students`
        );
        students.value = response.data;
      } catch (err) {
        console.error('Error fetching students:', err);
        error.value = 'Kunde inte ladda elever.';
        students.value = [];
      } finally {
        loading.value = false;
      }
    };

    const getStatusLabel = (status) => {
      const statusMap = {
        enrolled: 'Antagen',
        completed: 'Betygsatt',
        dropped: 'Avbrott',
        inactive: 'Ej påbörjad',
        reviderad: 'Reviderad',
      };
      return statusMap[status] || status;
    };

    const formatDate = (dateStr) => {
      if (!dateStr) return '—';
      return new Date(dateStr).toLocaleDateString('sv-SE');
    };

    return {
      selectedCourseInstanceId,
      students,
      loading,
      error,
      allCourses,
      fetchStudents,
      getStatusLabel,
      formatDate,
    };
  },
};
</script>

<style scoped>
.card {
  border-radius: 8px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.08);
}

.card-header {
  background: #f8f9fa;
  padding: 12px 16px;
  border-bottom: 1px solid #dee2e6;
}

.card-header h3 {
  margin: 0;
  font-size: 1.1rem;
  color: #2c3e50;
}

.card-body {
  padding: 16px;
}

.course-selector label {
  font-weight: 600;
  color: #495057;
  margin-bottom: 6px;
  display: block;
}

.form-control {
  width: 100%;
  padding: 8px 12px;
  border: 1px solid #ced4da;
  border-radius: 4px;
}

.students-table {
  width: 100%;
  border-collapse: collapse;
}

.students-table th {
  text-align: left;
  padding: 10px 12px;
  border-bottom: 2px solid #dee2e6;
  font-weight: 600;
  color: #495057;
  font-size: 0.85rem;
}

.students-table td {
  padding: 10px 12px;
  border-bottom: 1px solid #f0f0f0;
  font-size: 0.9rem;
}

.student-row:hover {
  background: #f8f9fa;
}

.student-name {
  font-weight: 500;
  color: #2c3e50;
}

.student-email {
  color: #6c757d;
}

.status-badge {
  padding: 3px 10px;
  border-radius: 4px;
  font-size: 0.8rem;
  font-weight: 500;
}

.status-enrolled {
  background: #d4edda;
  color: #155724;
}

.status-completed {
  background: #e2e3e5;
  color: #383d41;
}

.status-dropped {
  background: #f8d7da;
  color: #721c24;
}

.status-inactive {
  background: #e2e3e5;
  color: #383d41;
}

.status-reviderad {
  background: #fff3cd;
  color: #856404;
}

.empty-state {
  color: #6c757d;
  text-align: center;
  padding: 24px;
}

.loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 20px;
}

.spinner {
  width: 30px;
  height: 30px;
  border: 3px solid #f3f3f3;
  border-top: 3px solid #007bff;
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

.error-message {
  padding: 12px;
  background: #f8d7da;
  border-radius: 4px;
  color: #721c24;
}
</style>
