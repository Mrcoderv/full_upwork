<template>
  <div class="scrollable-view">
    <div class="container mt-4">
      <div class="header-section">
        <button class="btn btn-sm btn-outline-secondary mb-3" @click="goBack">
          &larr; Tillbaka till profil
        </button>
        <h1 class="page-title">
          {{ courseName }}
          <span v-if="courseCode" class="course-code">{{ courseCode }}</span>
        </h1>
      </div>

      <div v-if="loading" class="loading">
        <div class="spinner"></div>
        <p>Laddar elever...</p>
      </div>

      <div v-else-if="error" class="error-message">
        <p>{{ error }}</p>
      </div>

      <div v-else class="card">
        <div class="card-body">
          <div v-if="students.length === 0" class="empty-state">
            Inga elever i denna kurs
          </div>
          <table v-else class="students-table">
            <thead>
              <tr>
                <th>Namn</th>
                <th>E-post</th>
                <th>Telefon</th>
                <th>Status</th>
                <th>Betyg</th>
                <th>Inskriven</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="student in students" :key="student.studentId">
                <td class="student-name">{{ student.name }}</td>
                <td>{{ student.email }}</td>
                <td>{{ student.phone || '—' }}</td>
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
      </div>
    </div>
  </div>
</template>

<script>
import { ref, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import client from '@/api/client.js';

export default {
  name: 'StaffStudentsPage',
  setup() {
    const route = useRoute();
    const router = useRouter();
    const loading = ref(true);
    const error = ref(null);
    const students = ref([]);
    const courseName = ref('');
    const courseCode = ref('');

    const fetchStudents = async () => {
      loading.value = true;
      error.value = null;
      try {
        const { id, courseInstanceId } = route.params;
        const response = await client.get(`/teachers/${id}/courses/${courseInstanceId}/students`);
        students.value = response.data;

        // Try to get course name from the teacher profile
        try {
          const profileResponse = await client.get(`/teachers/${id}/profile`);
          const allCourses = [
            ...profileResponse.data.activeCourses,
            ...profileResponse.data.completedCourses,
          ];
          const course = allCourses.find(c => c.instanceId === courseInstanceId);
          if (course) {
            courseName.value = course.courseName;
            courseCode.value = course.courseCode;
          }
        } catch {
          // Silently fail — course name is not critical
        }
      } catch (err) {
        console.error('Error fetching students:', err);
        error.value = 'Kunde inte ladda elever.';
      } finally {
        loading.value = false;
      }
    };

    const goBack = () => {
      router.push(`/teacher/${route.params.id}`);
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

    onMounted(fetchStudents);

    return {
      loading,
      error,
      students,
      courseName,
      courseCode,
      goBack,
      getStatusLabel,
      formatDate,
    };
  },
};
</script>

<style scoped>
.header-section {
  margin-bottom: 16px;
}

.page-title {
  font-size: 1.4rem;
  color: #2c3e50;
}

.course-code {
  color: #6c757d;
  font-size: 1rem;
  margin-left: 8px;
}

.card {
  border-radius: 8px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.08);
}

.card-body {
  padding: 16px;
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

.student-name {
  font-weight: 500;
  color: #2c3e50;
}

.status-badge {
  padding: 3px 10px;
  border-radius: 4px;
  font-size: 0.8rem;
  font-weight: 500;
}

.status-enrolled { background: #d4edda; color: #155724; }
.status-completed { background: #e2e3e5; color: #383d41; }
.status-dropped { background: #f8d7da; color: #721c24; }
.status-inactive { background: #e2e3e5; color: #383d41; }
.status-reviderad { background: #fff3cd; color: #856404; }

.empty-state {
  text-align: center;
  color: #6c757d;
  padding: 24px;
}

.loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 40px;
}

.spinner {
  width: 40px;
  height: 40px;
  border: 4px solid #f3f3f3;
  border-top: 4px solid #007bff;
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

.error-message {
  padding: 16px;
  background: #f8d7da;
  border-radius: 4px;
  color: #721c24;
}
</style>
