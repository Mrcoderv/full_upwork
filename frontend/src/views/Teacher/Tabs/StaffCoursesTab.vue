<template>
  <div class="staff-courses-tab">
    <!-- Active Courses Card -->
    <div class="card">
      <div class="card-header">
        <h3>Aktiva kurser</h3>
        <span class="course-count">{{ activeCourses.length }}</span>
      </div>
      <div class="card-body">
        <div v-if="activeCourses.length === 0" class="empty-state">
          Inga aktiva kurser
        </div>
        <div v-else class="course-list">
          <div
            v-for="course in activeCourses"
            :key="course.instanceId"
            class="course-item"
            @click="openCourseStudents(course)"
          >
            <div class="course-main">
              <div class="course-name">{{ course.courseName }}</div>
              <div class="course-meta">
                <span class="course-code">{{ course.courseCode }}</span>
                <span v-if="course.coursePoints" class="course-points">{{ course.coursePoints }} hp</span>
                <span v-if="course.isResponsible" class="responsible-badge">Ansvarig</span>
              </div>
              <div class="course-dates">
                {{ formatDate(course.startDate) }} — {{ formatDate(course.endDate) }}
              </div>
            </div>
            <div class="course-students-count">
              <span class="student-count">{{ course.studentCount }}</span>
              <span class="student-label">elever</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Completed Courses Card -->
    <div class="card mt-4">
      <div class="card-header">
        <h3>Avslutade kurser</h3>
        <span class="course-count">{{ completedCourses.length }}</span>
      </div>
      <div class="card-body">
        <div v-if="completedCourses.length === 0" class="empty-state">
          Inga avslutade kurser
        </div>
        <div v-else class="course-list">
          <div
            v-for="course in completedCourses"
            :key="course.instanceId"
            class="course-item completed"
            @click="openCourseStudents(course)"
          >
            <div class="course-main">
              <div class="course-name">{{ course.courseName }}</div>
              <div class="course-meta">
                <span class="course-code">{{ course.courseCode }}</span>
                <span v-if="course.coursePoints" class="course-points">{{ course.coursePoints }} hp</span>
                <span v-if="course.isResponsible" class="responsible-badge">Ansvarig</span>
              </div>
              <div class="course-dates">
                {{ formatDate(course.startDate) }} — {{ formatDate(course.endDate) }}
              </div>
            </div>
            <div class="course-students-count">
              <span class="student-count">{{ course.studentCount }}</span>
              <span class="student-label">elever</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import { useRouter } from 'vue-router';

export default {
  name: 'StaffCoursesTab',
  props: {
    teacher: { type: Object, required: true },
    activeCourses: { type: Array, default: () => [] },
    completedCourses: { type: Array, default: () => [] },
  },
  setup(props) {
    const router = useRouter();

    const openCourseStudents = (course) => {
      router.push(`/teacher/${props.teacher._id}/courses/${course.instanceId}/students`);
    };

    const formatDate = (dateStr) => {
      if (!dateStr) return '';
      return new Date(dateStr).toLocaleDateString('sv-SE');
    };

    return {
      openCourseStudents,
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
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.card-header h3 {
  margin: 0;
  font-size: 1.1rem;
  color: #2c3e50;
}

.course-count {
  background: #007bff;
  color: white;
  padding: 2px 10px;
  border-radius: 12px;
  font-size: 0.85rem;
  font-weight: 600;
}

.card-body {
  padding: 16px;
}

.empty-state {
  color: #6c757d;
  text-align: center;
  padding: 20px;
}

.course-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.course-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 14px;
  border: 1px solid #dee2e6;
  border-left: 4px solid #28a745;
  border-radius: 4px;
  cursor: pointer;
  transition: background 0.15s;
}

.course-item:hover {
  background: #f8f9fa;
}

.course-item.completed {
  border-left-color: #6c757d;
  opacity: 0.85;
}

.course-main {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.course-name {
  font-weight: 600;
  color: #2c3e50;
}

.course-meta {
  display: flex;
  gap: 10px;
  align-items: center;
}

.course-code {
  font-size: 0.85rem;
  color: #6c757d;
}

.course-points {
  font-size: 0.85rem;
  color: #6c757d;
}

.responsible-badge {
  background: #e7f1ff;
  color: #004085;
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 0.75rem;
  font-weight: 500;
}

.course-dates {
  font-size: 0.85rem;
  color: #6c757d;
}

.course-students-count {
  display: flex;
  flex-direction: column;
  align-items: center;
  min-width: 60px;
}

.student-count {
  font-size: 1.4rem;
  font-weight: 700;
  color: #007bff;
}

.student-label {
  font-size: 0.75rem;
  color: #6c757d;
}
</style>
