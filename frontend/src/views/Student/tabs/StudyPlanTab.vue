<template>
  <div class="card">
    <div class="card-header">
      <div class="header-column header-left">
        <h3>Studieplan</h3>
      </div>
      <div class="header-column header-center">
        <select
          v-model="selectedTempo"
          class="tempo-select"
          :disabled="updatingTempo"
          @change="handleTempoChange"
        >
          <option :value="5">5v (100%)</option>
          <option :value="10">10v (50%)</option>
          <option :value="20">20v (25%)</option>
        </select>
      </div>
      <div v-if="student.enrollmentStats" class="header-column header-right enrollment-stats">
        <span class="stat-item">
          <strong>{{ student.enrollmentStats.totalEnrollments }}</strong>
          totalt
        </span>
        <span class="stat-item">
          <strong>{{ student.enrollmentStats.activeEnrollments }}</strong>
          aktiva
        </span>
      </div>
    </div>
    <div class="card-body">
      <div class="education-scroll-container">
        <div v-if="sortedEducation && sortedEducation.length > 0">
          <draggable
            v-model="sortedEducation"
            :animation="200"
            handle=".drag-handle"
            @end="handleEducationReorder"
            item-key="_id"
            class="education-list"
          >
            <template #item="{ element }">
              <div
                :key="element._id || element.refId?._id"
                class="education-item"
                :class="{ 
                  'enrollment-item': element.isEnrollment, 
                  'reviderad-item': element.status === 'reviderad',
                  'course-package-item': element.type === 'CoursePackage'
                }"
              >
                <div class="education-header">
                  <span class="drag-handle" title="Dra för att ändra ordning">☰</span>
                  <span class="education-type" :class="element.type === 'CoursePackage' ? 'type-package' : 'type-course'">
                    {{ element.type === 'CoursePackage' ? 'Kurspaket' : 'Kurs' }}
                  </span>
                  <span v-if="element.isEnrollment" class="enrollment-badge">{{ getStatusLabel(element.status || 'enrolled') }}</span>
                  <span v-if="element.type === 'Course' && (element.courseInstanceId || element.refId?._id)" class="education-name">
                    <router-link 
                      :to="getCourseLink(element)" 
                      class="course-link"
                      @click.stop
                    >
                      {{ getEducationName(element) }}<span v-if="getCourseInstanceCode(element)"> - {{ getCourseInstanceCode(element) }}</span>
                    </router-link>
                  </span>
                  <span v-else class="education-name">
                    {{ getEducationName(element) }}
                  </span>
                  <div class="education-actions">
                    <span v-if="element.startDate && element.endDate" class="education-period">
                      Period: {{ formatDateISO(element.startDate) }} - {{ formatDateISO(element.endDate) }}
                    </span>
                    <button
                      v-if="element.isEnrollment && element.type === 'Course'"
                      class="remove-course-button"
                      :disabled="removingEnrollment[element.enrollmentId]"
                      @click.stop="handleRemoveEnrollment(element)"
                    >
                      {{ removingEnrollment[element.enrollmentId] ? 'TAR BORT...' : 'TA BORT KURS' }}
                    </button>
                  </div>
                </div>

                <div class="education-details">
                  <!-- Teacher Information -->
                  <div v-if="getTeacherName(element)" class="education-teacher">
                    <strong>Lärare:</strong> {{ getTeacherName(element) }}
                  </div>

                  <!-- Status Dropdown (only for enrollments) -->
                  <div v-if="element.isEnrollment" class="education-status-section">
                    <label><strong>Status:</strong></label>
                    <select
                      v-if="element.enrollmentId && canEditStatus"
                      v-model="element.status"
                      @change="updateStatus(element)"
                      class="status-select"
                      :class="'status-' + (element.status || 'enrolled')"
                      :disabled="updatingStatus[element.enrollmentId]"
                    >
                      <option value="enrolled">Antagen</option>
                      <option value="completed">Betygsatt</option>
                      <option value="dropped">Avbrott</option>
                      <option value="inactive">Ej påbörjad</option>
                      <option value="reviderad">Reviderad</option>
                    </select>
                    <span v-else :class="'status-' + (element.status || 'enrolled')" class="status-display">
                      {{ getStatusLabel(element.status || 'enrolled') }}
                    </span>
                    <span v-if="updatingStatus[element.enrollmentId]" class="updating-indicator">
                      Uppdaterar...
                    </span>
                  </div>

                  <!-- Grade -->
                  <div v-if="element.grade" class="education-grade">
                    <strong>Betyg:</strong> {{ element.grade }}
                  </div>

                  <!-- Course Instance Info -->
                  <div
                    v-if="element.isEnrollment && element.courseInstance"
                    class="course-instance-info"
                  >
                    <strong>Kursinstans:</strong> {{ element.courseInstance.courseName }} ({{
                      formatDate(element.courseInstance.startDate)
                    }}
                    - {{ formatDate(element.courseInstance.endDate) }})
                  </div>
                </div>
              </div>
            </template>
          </draggable>
        </div>
        <div v-else class="no-education">Ingen utbildning registrerad</div>
      </div>

      <div v-if="completedCourses.length" class="completed-courses-section">
        <h4 class="completed-title">Lästa kurser</h4>
        <p class="completed-hint">
          Klicka på "Ny antagning" för att anmäla eleven till kursen igen.
        </p>
        <div class="completed-course-list">
          <div
            v-for="course in completedCourses"
            :key="course._id || course.enrollmentId"
            class="completed-course-item"
          >
            <div class="completed-course-info">
              <span class="completed-course-name">{{ getEducationName(course) }}</span>
              <span v-if="course.startDate && course.endDate" class="completed-course-period">
                {{ formatDateISO(course.startDate) }} - {{ formatDateISO(course.endDate) }}
              </span>
              <span v-if="course.grade" class="completed-course-grade">Betyg: {{ course.grade }}</span>
              <span v-if="course.completionCertificate" class="completed-course-certificate">
                Intyg: {{ course.completionCertificate }}
              </span>
            </div>
            <div class="completed-course-actions">
              <button
                class="certificate-button"
                :disabled="downloadingCertificate[course.enrollmentId || course._id]"
                @click="handleDownloadCertificate(course)"
              >
                {{
                  downloadingCertificate[course.enrollmentId || course._id]
                    ? 'LADDAR NER...'
                    : 'Ladda ner studieintyg'
                }}
              </button>
              <button
                v-if="canEditStatus"
                class="reenroll-button"
                :disabled="reEnrolling[course.enrollmentId || course._id]"
                @click="handleReEnroll(course)"
              >
                {{ reEnrolling[course.enrollmentId || course._id] ? 'ANMÄLER...' : 'Ny antagning' }}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import { ref, watch, computed } from 'vue';
import { useStore } from 'vuex';
import client from '@/api/client.js';
import { useToast } from '@/composables/useToast.js';
import draggable from 'vuedraggable';

export default {
  name: 'StudyPlanTab',
  components: {
    draggable,
  },
  props: {
    student: {
      type: Object,
      required: true,
    },
  },
  setup(props, { emit }) {
    const store = useStore();
    const toast = useToast();
    const sortedEducation = ref([]);
    const localStudent = ref(props.student);
    const updatingStatus = ref({});
    const removingEnrollment = ref({});
    const selectedTempo = ref(5);
    const updatingTempo = ref(false);

    const canEditStatus = computed(() => {
      const role = store.getters.userRole;
      return ['admin', 'systemadmin', 'teacher'].includes(role);
    });

    // Sort education: CoursePackages first, then courses chronologically
    const sortEducation = (education) => {
      if (!education || !Array.isArray(education)) return [];
      
      return [...education].sort((a, b) => {
        // First, separate CoursePackages from other types
        const aIsPackage = a.type === 'CoursePackage';
        const bIsPackage = b.type === 'CoursePackage';
        
        // CoursePackages come first
        if (aIsPackage && !bIsPackage) return -1;
        if (!aIsPackage && bIsPackage) return 1;
        
        // If both are CoursePackages, maintain their relative order (or sort by startDate if available)
        if (aIsPackage && bIsPackage) {
          if (!a.startDate && !b.startDate) return 0;
          if (!a.startDate) return 1;
          if (!b.startDate) return -1;
          return new Date(a.startDate) - new Date(b.startDate);
        }
        
        // For courses (non-packages), sort chronologically by startDate
        if (!a.startDate && !b.startDate) return 0;
        if (!a.startDate) return 1;
        if (!b.startDate) return -1;
        return new Date(a.startDate) - new Date(b.startDate);
      });
    };

    const getTempoFromEducation = (educationArray) => {
      const tempoOptions = [5, 10, 20];
      const counts = new Map(tempoOptions.map((tempo) => [tempo, 0]));

      for (const item of educationArray || []) {
        if (!item?.isEnrollment || !item.startDate || !item.endDate) continue;
        const start = new Date(item.startDate);
        const end = new Date(item.endDate);
        if (isNaN(start.getTime()) || isNaN(end.getTime())) continue;
        const weeks = Math.round((end - start) / (7 * 24 * 60 * 60 * 1000));
        const closest = tempoOptions.reduce(
          (prev, curr) =>
            Math.abs(curr - weeks) < Math.abs(prev - weeks) ? curr : prev,
          tempoOptions[0]
        );
        counts.set(closest, (counts.get(closest) || 0) + 1);
      }

      let bestTempo = tempoOptions[0];
      let bestCount = -1;
      for (const tempo of tempoOptions) {
        const count = counts.get(tempo) || 0;
        if (count > bestCount) {
          bestTempo = tempo;
          bestCount = count;
        }
      }
      return bestTempo;
    };

    watch(
      () => props.student,
      (newStudent) => {
        localStudent.value = newStudent;
        if (!newStudent?.education) {
          sortedEducation.value = [];
          return;
        }
        sortedEducation.value = sortEducation(newStudent.education);
        selectedTempo.value = getTempoFromEducation(sortedEducation.value);
      },
      { immediate: true, deep: true }
    );

    const handleEducationReorder = async () => {
      if (!localStudent.value?.education || sortedEducation.value.length === 0) return;

      try {
        const updatedEducation = recalculateEducationDates(sortedEducation.value);
        sortedEducation.value = updatedEducation;
        localStudent.value.education = updatedEducation;

        for (const edu of updatedEducation.filter((edu) => edu.enrollmentId)) {
          await client.put(`/enrollments/${edu.enrollmentId}`, {
            startDate: edu.startDate,
            endDate: edu.endDate,
          });
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
        console.log('Education dates updated successfully');
      } catch (err) {
        console.error('Error updating education dates:', err);
        toast.error('Kunde inte uppdatera utbildningsdatum');
        // Optionally emit an event to reload student data from parent
      }
    };

    const recalculateEducationDates = (educationArray) => {
      if (educationArray.length === 0) return [];
      const dateSlots = [...educationArray]
        .map((item) => ({
          startDate: item.startDate ? new Date(item.startDate) : null,
          endDate: item.endDate ? new Date(item.endDate) : null,
        }))
        .sort((a, b) => {
          if (!a.startDate && !b.startDate) return 0;
          if (!a.startDate) return 1;
          if (!b.startDate) return -1;
          return a.startDate - b.startDate;
        });

      return educationArray.map((item, index) => {
        const slot = dateSlots[index];
        return {
          ...item,
          startDate: slot?.startDate ? slot.startDate.toISOString() : item.startDate,
          endDate: slot?.endDate ? slot.endDate.toISOString() : item.endDate,
        };
      });
    };

    const getEducationName = (edu) => {
      if (edu.name) return edu.name;
      if (!edu.refId) return 'Okänd';
      if (edu.type === 'Course') return edu.refId.courseName || 'Okänd kurs';
      if (edu.type === 'CoursePackage') return edu.refId.coursePackageName || 'Okänt kurspaket';
      if (edu.type === 'Program') return edu.refId.programName || 'Okänt program';
      return 'Okänd';
    };

    const formatDate = (date) => {
      if (!date) return '';
      return new Date(date).toLocaleDateString('sv-SE');
    };

    const formatDateISO = (date) => {
      if (!date) return '';
      const d = new Date(date);
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    };

    const getCourseInstanceCode = (edu) => {
      // Get course instance code if available
      if (edu.courseInstance?.courseCode) {
        return edu.courseInstance.courseCode;
      }
      if (edu.courseInstanceId && typeof edu.courseInstanceId === 'object' && edu.courseInstanceId.courseCode) {
        return edu.courseInstanceId.courseCode;
      }
      return null;
    };

    const getCourseLink = (edu) => {
      // Students are enrolled in CourseInstances, not Courses
      // Courses are only templates - always link to the CourseInstance
      if (edu.courseInstanceId) {
        const instanceId = typeof edu.courseInstanceId === 'object' 
          ? edu.courseInstanceId._id || edu.courseInstanceId 
          : edu.courseInstanceId;
        return `/education/${instanceId}?type=instance`;
      }
      // Fallback: if no course instance ID, try refId (shouldn't happen for enrollments)
      if (edu.refId?._id) {
        // This is a legacy case - should not happen for new enrollments
        console.warn('Linking to Course instead of CourseInstance - this should not happen for enrollments');
        return `/education/${edu.refId._id}`;
      }
      // Fallback to empty string if no ID available
      return '#';
    };

    const getTeacherName = (edu) => {
      // Check if teacherId is populated in the enrollment
      if (edu.teacherId) {
        if (typeof edu.teacherId === 'object') {
          return edu.teacherId.name || edu.teacherId.username || null;
        }
      }
      // Check if addedBy has teacher name
      if (edu.addedBy && edu.addedBy !== 'System') {
        return edu.addedBy;
      }
      // Check courseInstance for teacher
      if (edu.courseInstance?.teacherId) {
        if (typeof edu.courseInstance.teacherId === 'object') {
          return edu.courseInstance.teacherId.name || edu.courseInstance.teacherId.username || null;
        }
      }
      return null;
    };

    const getStatusLabel = (status) => {
      const statusMap = {
        'enrolled': 'Antagen',
        'completed': 'Betygsatt',
        'dropped': 'Avbrott',
        'inactive': 'Ej påbörjad',
        'reviderad': 'Reviderad',
        'active': 'Aktiv',
        'suspended': 'Suspenderad',
      };
      return statusMap[status] || status;
    };

    const updateStatus = async (element) => {
      if (!element.enrollmentId || !element.status) return;
      
      const originalStatus = localStudent.value.education?.find(
        e => e.enrollmentId === element.enrollmentId
      )?.status || element.status;
      
      updatingStatus.value[element.enrollmentId] = true;
      try {
        const response = await client.put(`/enrollments/${element.enrollmentId}/status`, {
          status: element.status,
        });
        
        console.log('Status update successful:', response.data);
        
        // Update local state
        const index = sortedEducation.value.findIndex(e => e.enrollmentId === element.enrollmentId);
        if (index !== -1) {
          sortedEducation.value[index].status = element.status;
          // Update teacher info if returned
          if (response.data.enrollment?.teacherId) {
            sortedEducation.value[index].teacherId = response.data.enrollment.teacherId;
          }
        }
        
        // Update localStudent as well
        if (localStudent.value.education) {
          const studentEduIndex = localStudent.value.education.findIndex(
            e => e.enrollmentId === element.enrollmentId
          );
          if (studentEduIndex !== -1) {
            localStudent.value.education[studentEduIndex].status = element.status;
          }
        }
      } catch (err) {
        console.error('Error updating enrollment status:', err);
        console.error('Error response:', err.response?.data);
        const errorMessage = err.response?.data?.message || err.response?.data?.error || 'Kunde inte uppdatera status';
        toast.error(`Kunde inte uppdatera status: ${errorMessage}`);
        
        // Revert the change
        const index = sortedEducation.value.findIndex(e => e.enrollmentId === element.enrollmentId);
        if (index !== -1) {
          sortedEducation.value[index].status = originalStatus;
        }
      } finally {
        updatingStatus.value[element.enrollmentId] = false;
      }
    };

    const handleRemoveEnrollment = async (element) => {
      if (!element?.enrollmentId || !props.student?._id) return;

      const confirmed = window.confirm(
        `Är du säker på att du vill ta bort kursen "${getEducationName(element)}"?`
      );
      if (!confirmed) return;

      removingEnrollment.value[element.enrollmentId] = true;
      try {
        await client.delete(
          `/students/${props.student._id}/enrollments/${element.enrollmentId}`
        );

        const refreshed = await client.get(`/student-details/${props.student._id}`);
        emit('student-updated', refreshed.data);
      } catch (err) {
        console.error('Error removing enrollment:', err);
        const errorMessage =
          err.response?.data?.message ||
          err.response?.data?.error ||
          'Kunde inte ta bort kursen';
        toast.error(`Kunde inte ta bort kursen: ${errorMessage}`);
      } finally {
        removingEnrollment.value[element.enrollmentId] = false;
      }
    };

    const handleTempoChange = async () => {
      const currentTempo = getTempoFromEducation(sortedEducation.value);
      const nextTempo = Number(selectedTempo.value);
      if (!nextTempo || nextTempo === currentTempo || !props.student?._id) {
        selectedTempo.value = currentTempo;
        return;
      }

      const confirmed = window.confirm(
        'Är du säker på att du vill ändra studietakten? Endast framtida kurser ändras.'
      );
      if (!confirmed) {
        selectedTempo.value = currentTempo;
        return;
      }

      updatingTempo.value = true;
      try {
        await client.put(`/students/${props.student._id}/studyplan-tempo`, {
          tempoWeeks: nextTempo,
        });
        const refreshed = await client.get(`/student-details/${props.student._id}`);
        emit('student-updated', refreshed.data);
      } catch (err) {
        console.error('Error updating study plan tempo:', err);
        const errorMessage =
          err.response?.data?.message ||
          err.response?.data?.error ||
          'Kunde inte uppdatera studietakten';
        toast.error(`Kunde inte uppdatera studietakten: ${errorMessage}`);
        selectedTempo.value = currentTempo;
      } finally {
        updatingTempo.value = false;
      }
    };

    // Completed courses ("Lästa kurser") eligible for re-registration
    const completedCourses = computed(() => {
      return (sortedEducation.value || []).filter(
        (edu) =>
          edu.isEnrollment &&
          edu.type === 'Course' &&
          edu.status === 'completed'
      );
    });

    const reEnrolling = ref({});

    const downloadingCertificate = ref({});

    const handleDownloadCertificate = async (course) => {
      if (!course?.enrollmentId || !props.student?._id) return;
      const key = course.enrollmentId;
      downloadingCertificate.value[key] = true;
      try {
        const response = await client.get(`/study-certificate/${key}/pdf`, {
          responseType: 'blob',
        });
        const blob = new Blob([response.data], { type: 'application/pdf' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `studieintyg-${getEducationName(course).replace(/\s+/g, '-')}.pdf`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
      } catch (err) {
        console.error('Error downloading certificate:', err);
        const errorMessage =
          err.message || err.response?.data?.message || 'Något gick fel';
        toast.error(`Kunde inte ladda ner studieintyg: ${errorMessage}`);
      } finally {
        downloadingCertificate.value[key] = false;
      }
    };

    const handleReEnroll = async (course) => {
      if (!course || !props.student?._id) return;

      const courseName = getEducationName(course);
      const confirmed = window.confirm(
        `Är du säker på att du vill anmäla eleven till kursen "${courseName}" igen?`
      );
      if (!confirmed) return;

      const key = course.enrollmentId || course._id;
      reEnrolling.value[key] = true;
      try {
        // Start one day after the last scheduled course, or today if none
        const lastEnd = sortedEducation.value
          .map((edu) => (edu.endDate ? new Date(edu.endDate).getTime() : 0))
          .filter((time) => !isNaN(time))
          .reduce((max, time) => Math.max(max, time), 0);
        const start = lastEnd > 0 ? new Date(lastEnd) : new Date();
        start.setDate(start.getDate() + 1);
        const startDate = start.toISOString().slice(0, 10);

        const tempoWeeks = Number(selectedTempo.value) || 5;
        const end = new Date(start);
        end.setDate(end.getDate() + tempoWeeks * 7);
        const endDate = end.toISOString().slice(0, 10);

        await client.post('/process-education', {
          studentId: props.student._id,
          educationEntries: [
            {
              type: 'Course',
              refId: course.refId?._id || course.refId,
              name: courseName,
              startDate,
              endDate,
            },
          ],
          needsSupport: false,
          examMode: 'on-site',
        });

        const refreshed = await client.get(`/student-details/${props.student._id}`);
        emit('student-updated', refreshed.data);
        toast.success(`Eleven har anmälts till kursen "${courseName}" igen.`);
      } catch (err) {
        console.error('Error re-enrolling student in course:', err);
        const errorMessage =
          err.response?.data?.message ||
          err.response?.data?.error ||
          'Kunde inte anmäla eleven till kursen igen';
        toast.error(`Kunde inte anmäla eleven till kursen igen: ${errorMessage}`);
      } finally {
        reEnrolling.value[key] = false;
      }
    };

    return {
      sortedEducation,
      handleEducationReorder,
      getEducationName,
      formatDate,
      formatDateISO,
      getCourseInstanceCode,
      getCourseLink,
      getTeacherName,
      getStatusLabel,
      updateStatus,
      canEditStatus,
      updatingStatus,
      handleRemoveEnrollment,
      removingEnrollment,
      selectedTempo,
      updatingTempo,
      handleTempoChange,
      completedCourses,
      reEnrolling,
      handleReEnroll,
      downloadingCertificate,
      handleDownloadCertificate,
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
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: center;
  gap: 12px;
}
.card-header h3 {
  margin: 0;
  color: #2c3e50;
}
.header-column {
  display: flex;
  align-items: center;
}
.header-left {
  justify-content: flex-start;
}
.header-center {
  justify-content: center;
}
.header-right {
  justify-content: flex-end;
}
.tempo-select {
  min-width: 140px;
  padding: 6px 10px;
  border: 1px solid #dee2e6;
  border-radius: 4px;
  font-size: 14px;
  background: #fff;
}
.card-body {
  padding: 20px;
}
.education-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.education-item {
  padding: 10px;
  border: 1px solid #dee2e6;
  border-radius: 4px;
}
.education-header {
  display: flex;
  gap: 10px;
  align-items: center;
  flex-wrap: wrap;
}
.education-actions {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}
.education-type {
  background: #007bff;
  color: white;
  padding: 2px 8px;
  border-radius: 12px;
  font-size: 12px;
}
.education-period {
  color: #6c757d;
  font-size: 14px;
}
.remove-course-button {
  background: #dc3545;
  color: #fff;
  border: none;
  padding: 6px 10px;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
  letter-spacing: 0.4px;
  white-space: nowrap;
}
.remove-course-button:disabled {
  opacity: 0.7;
  cursor: not-allowed;
}
.remove-course-button:hover:not(:disabled) {
  background: #c82333;
}

.type-package {
  background: #6f42c1;
}

.type-course {
  background: #007bff;
}
.education-name {
  font-weight: 500;
}

.course-link {
  color: #007bff;
  text-decoration: none;
  cursor: pointer;
  transition: color 0.2s;
}

.course-link:hover {
  color: #0056b3;
  text-decoration: underline;
}
.education-grade {
  margin-top: 5px;
  color: #6c757d;
}
.no-education {
  text-align: center;
  color: #6c757d;
  font-style: italic;
  padding: 20px;
}
.enrollment-stats {
  display: flex;
  gap: 15px;
  font-size: 14px;
}
.stat-item {
  color: #6c757d;
}
.enrollment-item {
  border-left: 4px solid #28a745;
  background-color: #f8fff9;
}
.reviderad-item {
  border-left: 4px solid #ffc107; /* Yellow color for reviderad */
  background-color: #fffaf0;
}
.enrollment-badge {
  background: #28a745;
  color: white;
  padding: 2px 8px;
  border-radius: 12px;
  font-size: 10px;
  margin-left: 10px;
}
.education-details {
  margin-top: 10px;
  font-size: 14px;
  color: #6c757d;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.education-teacher {
  margin-bottom: 5px;
}

.education-dates {
  margin-bottom: 5px;
}

.course-package-item {
  border-left: 4px solid #6f42c1;
  background-color: #f8f4ff;
}
.education-status-section {
  margin-bottom: 5px;
  display: flex;
  align-items: center;
  gap: 10px;
}

.status-select {
  padding: 4px 8px;
  border: 1px solid #dee2e6;
  border-radius: 4px;
  font-size: 14px;
  min-width: 150px;
}

.status-select.status-enrolled {
  border-color: #28a745;
  color: #28a745;
}

.status-select.status-completed {
  border-color: #6c757d;
  color: #6c757d;
}

.status-select.status-dropped {
  border-color: #dc3545;
  color: #dc3545;
}

.status-select.status-inactive {
  border-color: #6c757d;
  color: #6c757d;
}

.status-select.status-reviderad {
  border-color: #ffc107;
  color: #ffc107;
}

.status-display {
  padding: 4px 8px;
  border-radius: 4px;
  font-weight: 500;
}

.status-enrolled {
  color: #28a745;
  font-weight: 500;
}

.status-active {
  color: #007bff;
  font-weight: 500;
}

.status-completed {
  color: #6c757d;
  font-weight: 500;
}

.status-dropped {
  color: #dc3545;
  font-weight: 500;
}

.status-inactive {
  color: #6c757d;
  font-weight: 500;
}

.status-reviderad {
  color: #ffc107;
  font-weight: 500;
}
.course-instance-info {
  margin-top: 5px;
  font-size: 12px;
  color: #495057;
  background: #f8f9fa;
  padding: 5px;
  border-radius: 4px;
}
.education-scroll-container {
  padding: 10px;
}
.drag-handle {
  cursor: move;
  font-size: 20px;
  color: #6c757d;
  margin-right: 8px;
  user-select: none;
}
.drag-handle:hover {
  color: #007bff;
}
.education-item {
  cursor: grab;
}
.education-item:active {
  cursor: grabbing;
}
.sortable-ghost {
  opacity: 0.4;
}
.sortable-chosen {
  cursor: grabbing !important;
}

.updating-indicator {
  font-size: 12px;
  color: #6c757d;
  font-style: italic;
  margin-left: 10px;
}
.completed-courses-section {
  margin-top: 24px;
  padding: 10px;
  border-top: 1px solid #dee2e6;
}
.completed-title {
  margin: 0 0 4px 0;
  color: #2c3e50;
  font-size: 16px;
}
.completed-hint {
  margin: 0 0 12px 0;
  color: #6c757d;
  font-size: 13px;
}
.completed-course-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.completed-course-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  padding: 10px 12px;
  border: 1px solid #dee2e6;
  border-left: 4px solid #6c757d;
  border-radius: 4px;
  background: #fafafa;
}
.completed-course-info {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}
.completed-course-name {
  font-weight: 600;
  color: #2c3e50;
}
.completed-course-period {
  color: #6c757d;
  font-size: 13px;
}
.completed-course-grade {
  color: #6c757d;
  font-size: 13px;
}
.reenroll-button {
  background: #28a745;
  color: #fff;
  border: none;
  padding: 6px 12px;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
  letter-spacing: 0.4px;
  white-space: nowrap;
}
.reenroll-button:disabled {
  opacity: 0.7;
  cursor: not-allowed;
}
.reenroll-button:hover:not(:disabled) {
  background: #218838;
}
.certificate-button {
  background: #007bff;
  color: #fff;
  border: none;
  padding: 6px 12px;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
  letter-spacing: 0.4px;
  white-space: nowrap;
}
.certificate-button:disabled {
  opacity: 0.7;
  cursor: not-allowed;
}
.certificate-button:hover:not(:disabled) {
  background: #0056b3;
}
.completed-course-actions {
  display: flex;
  gap: 8px;
  align-items: center;
  flex-shrink: 0;
}
.completed-course-certificate {
  color: #6c757d;
  font-size: 13px;
}
</style>