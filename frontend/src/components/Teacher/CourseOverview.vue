<template>
  <v-container>
    <v-card>
      <v-card-title>Min kursöversikt</v-card-title>
      <v-card-text>
        <v-data-table
          :headers="headers"
          :items="courses"
          :loading="loading"
          class="elevation-1 course-table"
          item-value="_id"
        >
          <template #item.courseCode="{ item }">
            <a 
              href="#" 
              class="course-code-link"
              @click.prevent="handleCourseCodeClick(item)"
            >
              {{ item.courseCode }}
            </a>
          </template>
          <template #item.startDate="{ item }">
            {{ formatDate(item.startDate) }}
          </template>
          <template #item.endDate="{ item }">
            {{ formatDate(item.endDate) }}
          </template>
          <template #item.slutprovDate="{ item }">
            {{ formatDate(item.slutprovDate) }}
          </template>
          <template #item.responsibleTeacher="{ item }">
            {{ getResponsibleTeacher(item) }}
          </template>
        </v-data-table>

        <!-- Course Details Modal -->
        <v-dialog v-model="showModal" max-width="800px" persistent>
          <v-card>
            <v-card-title class="d-flex align-center">
              <span class="text-h5">{{ courseDetails.courseName || 'Kursdetaljer' }}</span>
              <v-spacer></v-spacer>
              <v-btn icon variant="text" @click="closeModal">
                <v-icon>mdi-close</v-icon>
              </v-btn>
            </v-card-title>
            <v-card-text v-if="loadingDetails">
              <div class="text-center py-4">
                <v-progress-circular indeterminate color="primary"></v-progress-circular>
                <p class="mt-4">Laddar kursdetaljer...</p>
              </div>
            </v-card-text>
            <v-card-text v-else>
              <div v-if="courseDetails.isCourseInstance" class="course-instance-info mb-4">
                <div class="info-item">
                  <strong>Kurskod:</strong> {{ courseDetails.courseCode }}
                </div>
                <div v-if="courseDetails.startDate && courseDetails.endDate" class="info-item">
                  <strong>Period:</strong> {{ formatDate(courseDetails.startDate) }} - {{ formatDate(courseDetails.endDate) }}
                </div>
                <div v-if="courseDetails.mainCourseId" class="info-item">
                  <strong>Huvudkurs:</strong> {{ courseDetails.mainCourseId?.courseName || 'Okänd' }}
                </div>
              </div>

              <div class="teacher-info mb-4">
                <div v-if="courseDetails.teacher && courseDetails.teacher._id">
                  <strong>Ansvarig lärare:</strong>
                  <a href="#" class="teacher-link" @click.prevent="viewTeacher(courseDetails.teacher._id)">
                    {{ courseDetails.teacher.username }}
                  </a>
                </div>
                <div v-else-if="courseDetails.teachers && courseDetails.teachers.length > 0">
                  <strong>Lärare:</strong>
                  <span v-for="(teacher, index) in courseDetails.teachers" :key="teacher._id">
                    <a href="#" class="teacher-link" @click.prevent="viewTeacher(teacher._id)">
                      {{ teacher.username }}
                    </a>
                    <span v-if="index < courseDetails.teachers.length - 1">, </span>
                  </span>
                </div>
                <div v-else>
                  <strong>Lärare:</strong> Ingen ansvarig lärare tilldelad
                </div>
              </div>

              <h3 class="mb-3">Elever ({{ courseDetails.students?.length || 0 }})</h3>
              <div v-if="courseDetails.students && courseDetails.students.length > 0" class="students-list">
                <ul class="students-ul">
                  <li v-for="student in courseDetails.students" :key="student._id" class="student-item">
                    <a href="#" class="student-link" @click.prevent="viewStudent(student._id)">
                      {{ student.name }}
                    </a>
                    <span v-if="student.email" class="student-email"> ({{ student.email }})</span>
                  </li>
                </ul>
              </div>
              <div v-else class="no-students">
                Inga elever inskrivna i denna kurs
              </div>
            </v-card-text>
            <v-card-actions>
              <v-spacer></v-spacer>
              <v-btn color="primary" @click="closeModal">Stäng</v-btn>
            </v-card-actions>
          </v-card>
        </v-dialog>
      </v-card-text>
    </v-card>
  </v-container>
</template>

<script>
  import client from '@/api/client.js'
  import { useToast } from '@/composables/useToast.js'

  export default {
    name: 'CourseOverview',
    setup() {
      const toast = useToast()
      return { toast }
    },
    data() {
      return {
        loading: true,
        courses: [],
        showModal: false,
        loadingDetails: false,
        courseDetails: {},
        headers: [
          { title: 'Kursnamn', key: 'courseName', sortable: true, align: 'start' },
          { title: 'Kurskod', key: 'courseCode', sortable: true, align: 'start' },
          { title: 'Startdatum', key: 'startDate', sortable: true, align: 'start' },
          { title: 'Slutdatum', key: 'endDate', sortable: true, align: 'start' },
          { title: 'Slutprovsdatum', key: 'slutprovDate', sortable: true, align: 'start' },
          { title: 'Antal anmälda', key: 'enrollmentCount', sortable: true, align: 'start' },
          { title: 'Ansvarig lärare', key: 'responsibleTeacher', sortable: true, align: 'start' },
        ],
      };
    },
    async created() {
      await this.fetchMyCourses();
    },
    methods: {
      async fetchMyCourses() {
        this.loading = true;
        try {
          const response = await client.get('/course-instances/mine');
          const instances = response.data.instances || [];
          
          // Debug: Log first instance to see data structure
          if (instances.length > 0) {
            console.log('Sample course instance:', instances[0]);
            console.log('Responsible teacher data:', instances[0].responsibleTeacher);
          }
          
          // Deduplicate by _id to prevent duplicate entries
          const seen = new Map();
          this.courses = instances.filter(instance => {
            const id = instance._id?.toString() || instance.id?.toString();
            if (!id) return false;
            if (seen.has(id)) {
              return false;
            }
            seen.set(id, true);
            return true;
          });
        } catch (error) {
          console.error('Error fetching my courses:', error);
          this.courses = [];
        } finally {
          this.loading = false;
        }
      },
      formatDate(dateString) {
        if (!dateString) return 'N/A';
        const options = { year: 'numeric', month: 'short', day: 'numeric' };
        return new Date(dateString).toLocaleDateString('sv-SE', options);
      },
      getResponsibleTeacher(item) {
        // Handle different possible data structures
        const teacher = item.responsibleTeacher;
        
        if (!teacher) {
          return 'Ej tilldelad';
        }
        
        // If userId is populated with username
        if (teacher.userId?.username) {
          return teacher.userId.username;
        }
        
        // If userId is an object but not populated, try to get it from the object
        if (teacher.userId && typeof teacher.userId === 'object' && teacher.userId.username) {
          return teacher.userId.username;
        }
        
        // If there's a username directly on the teacher object (fallback)
        if (teacher.username) {
          return teacher.username;
        }
        
        // Debug: Log what we actually have
        console.log('Teacher data structure:', {
          teacher,
          hasUserId: !!teacher.userId,
          userIdType: typeof teacher.userId,
          userIdValue: teacher.userId
        });
        
        return 'Ej tilldelad';
      },
      handleCourseCodeClick(item) {
        if (item && item._id) {
          this.showCourseDetails(item._id);
        }
      },
      async showCourseDetails(instanceId) {
        this.showModal = true;
        this.loadingDetails = true;
        this.courseDetails = {};
        
        try {
          const response = await client.get(`/details/Kursinstans/${instanceId}`);
          this.courseDetails = response.data;
        } catch (error) {
          console.error('Error fetching course details:', error);
          this.toast.error('Kunde inte ladda kursdetaljer');
          this.closeModal();
        } finally {
          this.loadingDetails = false;
        }
      },
      closeModal() {
        this.showModal = false;
        this.courseDetails = {};
      },
      viewStudent(studentId) {
        this.$router.push(`/student/${studentId}`);
      },
      viewTeacher(teacherId) {
        this.$router.push(`/detaljer/Lärare/${teacherId}`);
      },
    },
  };
</script>

<style scoped>
.v-card-title {
  font-weight: bold;
}

/* Ensure table headers are visible and black - Vuetify 3 */
:deep(.v-data-table) {
  border-collapse: separate;
}

:deep(.v-data-table__thead) {
  background-color: #f5f5f5 !important;
  display: table-header-group !important;
  visibility: visible !important;
}

:deep(.v-data-table__thead tr) {
  display: table-row !important;
}

:deep(.v-data-table__thead th) {
  color: #000000 !important;
  font-weight: 600 !important;
  font-size: 14px !important;
  background-color: #f5f5f5 !important;
  border-bottom: 2px solid #dee2e6 !important;
  padding: 12px 16px !important;
  display: table-cell !important;
  visibility: visible !important;
  opacity: 1 !important;
}

:deep(.v-data-table-header__content) {
  color: #000000 !important;
  font-weight: 600 !important;
  visibility: visible !important;
  opacity: 1 !important;
}

:deep(.v-data-table-header__title) {
  color: #000000 !important;
  font-weight: 600 !important;
  visibility: visible !important;
  opacity: 1 !important;
}

/* Fallback for any th elements */
:deep(.v-data-table th),
:deep(.course-table th) {
  color: #000000 !important;
  font-weight: 600 !important;
  display: table-cell !important;
  visibility: visible !important;
  opacity: 1 !important;
  background-color: #f5f5f5 !important;
}

.course-code-link {
  color: #1976d2;
  text-decoration: none;
  cursor: pointer;
  font-weight: 500;
}

.course-code-link:hover {
  text-decoration: underline;
}

.course-instance-info {
  background: #f8f9fa;
  padding: 15px;
  border-radius: 8px;
  margin-bottom: 20px;
}

.info-item {
  margin-bottom: 8px;
  font-size: 14px;
}

.info-item:last-child {
  margin-bottom: 0;
}

.teacher-info {
  margin: 20px 0 30px;
  font-size: 16px;
}

.teacher-link {
  color: #1976d2;
  text-decoration: none;
  cursor: pointer;
}

.teacher-link:hover {
  text-decoration: underline;
}

.students-list {
  margin-top: 15px;
}

.students-ul {
  list-style: none;
  padding: 0;
  margin: 0;
}

.student-item {
  padding: 10px;
  border-bottom: 1px solid #e9ecef;
  transition: background-color 0.2s;
}

.student-item:hover {
  background-color: #f8f9fa;
}

.student-item:last-child {
  border-bottom: none;
}

.student-link {
  color: #1976d2;
  text-decoration: none;
  font-weight: 500;
  cursor: pointer;
}

.student-link:hover {
  text-decoration: underline;
}

.student-email {
  color: #6c757d;
  font-size: 14px;
}

.no-students {
  color: #6c757d;
  font-style: italic;
  padding: 20px;
  text-align: center;
}
</style>
