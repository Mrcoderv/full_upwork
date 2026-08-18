<template>
  <div class="course-archive-container">
    <div v-if="student.education && student.education.length > 0">
      <div
        v-for="enrollment in sortedEnrollments"
        :key="enrollment.enrollmentId || enrollment._id"
        class="card enrollment-card"
        :class="{ 'completed-enrollment': enrollment.status === 'completed' }"
      >
        <div class="card-header">
          <div class="header-left">
            <h4>{{ getEducationName(enrollment) }}</h4>
            <span v-if="enrollment.courseInstance?.courseCode" class="course-code">
              {{ enrollment.courseInstance.courseCode }}
            </span>
          </div>
          <div class="header-right">
            <span v-if="enrollment.status" class="status-badge" :class="'status-' + enrollment.status">
              {{ getStatusLabel(enrollment.status) }}
            </span>
            <span v-if="enrollment.startDate" class="enrollment-dates">
              {{ formatDate(enrollment.startDate) }} — {{ formatDate(enrollment.endDate) }}
            </span>
          </div>
        </div>
        <div class="card-body">
          <div v-if="enrollment.teacherId" class="enrollment-teacher">
            <strong>Lärare:</strong> {{ enrollment.teacherId.name || enrollment.teacherId.username || '—' }}
          </div>
          <div v-if="enrollment.grade" class="enrollment-grade">
            <strong>Betyg:</strong> {{ enrollment.grade }}
          </div>
          <DocumentSection
            :student="student"
            type="COURSE_ARCHIVE"
            :enrollment-id="enrollment.enrollmentId"
          />
        </div>
      </div>
    </div>
    <div v-else class="empty-state">
      <p>Studenten har inga kurser i arkivet.</p>
    </div>
  </div>
</template>

<script>
import { computed } from 'vue';
import DocumentSection from '../../Admin/SearchTabs/DocumentSection.vue';

export default {
  name: 'CourseArchiveTab',
  components: {
    DocumentSection,
  },
  props: {
    student: {
      type: Object,
      required: true,
    },
  },
  setup(props) {
    const sortedEnrollments = computed(() => {
      const enrollments = props.student.education || [];
      // Sort: completed first, then enrolled, then others. Within each group, newest first.
      const statusOrder = { completed: 0, enrolled: 1, reviderad: 2, inactive: 3, dropped: 4 };
      return [...enrollments].sort((a, b) => {
        const orderA = statusOrder[a.status] ?? 5;
        const orderB = statusOrder[b.status] ?? 5;
        if (orderA !== orderB) return orderA - orderB;
        // Within same status group, newest first
        const dateA = a.startDate ? new Date(a.startDate).getTime() : 0;
        const dateB = b.startDate ? new Date(b.startDate).getTime() : 0;
        return dateB - dateA;
      });
    });

    const getEducationName = (edu) => {
      if (edu.name) return edu.name;
      if (!edu.refId) return 'Okänd';
      if (edu.type === 'Course') return edu.refId.courseName || 'Okänd kurs';
      if (edu.type === 'CoursePackage') return edu.refId.coursePackageName || 'Okänt kurspaket';
      if (edu.type === 'Program') return edu.refId.programName || 'Okänt program';
      return 'Okänd';
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

    const formatDate = (date) => {
      if (!date) return '';
      return new Date(date).toLocaleDateString('sv-SE');
    };

    return {
      sortedEnrollments,
      getEducationName,
      getStatusLabel,
      formatDate,
    };
  },
};
</script>

<style scoped>
.course-archive-container {
  display: flex;
  flex-direction: column;
  gap: 20px;
}
.enrollment-card {
  background: white;
  border-radius: 8px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}
.enrollment-card.completed-enrollment {
  opacity: 0.85;
}
.card-header {
  background: #f8f9fa;
  padding: 15px 20px;
  border-bottom: 1px solid #dee2e6;
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}
.header-left {
  display: flex;
  align-items: center;
  gap: 10px;
}
.header-right {
  display: flex;
  align-items: center;
  gap: 12px;
}
.card-header h4 {
  margin: 0;
  color: #2c3e50;
}
.course-code {
  color: #6c757d;
  font-size: 0.9rem;
}
.enrollment-dates {
  color: #6c757d;
  font-size: 14px;
}
.card-body {
  padding: 16px;
}
.enrollment-teacher,
.enrollment-grade {
  font-size: 0.9rem;
  color: #495057;
  margin-bottom: 8px;
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
</style>