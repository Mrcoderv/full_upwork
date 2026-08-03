<template>
  <div
    v-if="event"
    class="modal fade show d-block"
    tabindex="-1"
    role="dialog"
    style="background: rgba(0, 0, 0, 0.5)"
  >
    <div class="modal-dialog modal-xl" role="document">
      <div class="modal-content p-4 rounded-lg shadow">
        <div class="d-flex justify-content-between align-items-start mb-4">
          <div>
            <h5 class="modal-title fw-bold">
              {{ event.extendedProps?.teacher || event.teacher || 'Okänd lärare' }}
            </h5>
            <p class="text-muted mb-1">Provdetaljer för alla studenter i detta prov:</p>
          </div>
          <button type="button" class="btn-close" @click="closeModal"></button>
        </div>

        <!-- Provdetaljer sektion -->
        <div class="bg-white border rounded p-3 mb-4 shadow-sm">
          <h6>📝 Provuppgifter</h6>
          <div v-if="examTime && examMunicipality && examLocation">
            <strong>Tid:</strong>
            {{ examTime }}
            <strong>Kommun:</strong>
            {{ examMunicipality }}
            <strong>Plats:</strong>
            {{ examLocation }}
          </div>
          <div v-else class="text-muted">
            <em>
              Inga provuppgifter satta ännu. Använd formuläret nedan för att sätta tid, kommun och
              plats.
            </em>
          </div>
        </div>

        <!-- Tabell -->
        <div v-if="courseName || courseInstanceCode" class="mb-3">
          <h6 v-if="courseName" class="fw-semibold mb-1">Kurs: {{ courseName }}</h6>
          <h6 v-if="courseInstanceCode" class="fw-semibold mb-2">Kursinstans: {{ courseInstanceCode }}</h6>
        </div>
        <h6 class="fw-semibold">Studenter kopplade till detta prov</h6>
        
        <div class="table-responsive mb-4">
          <table class="table table-striped align-middle">
            <thead class="table-light">
              <tr>
                <th>Namn</th>
                <th>Personnummer</th>
                <th>Info</th>
                <th>Närvaro</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(student, index) in studentsData" :key="student._id || index">
                <td>
                  <router-link :to="`/student/${student._id}`">{{ student.name }}</router-link>
                </td>
                <td>{{ student.personalNumber }}</td>
                <td>
                  <v-textarea
                    v-if="canEdit"
                    v-model="student.additionalInfo"
                    label="Information"
                    outlined
                    dense
                    hide-details
                    rows="2"
                    auto-grow
                    @blur="updateStudentInfo(student)"
                  />
                  <span v-else style="white-space: pre-wrap;">{{ student.additionalInfo || '-' }}</span>
                </td>
                <td>
                  <input
                    type="checkbox"
                    v-model="student.attended"
                    :disabled="!canEdit"
                    class="form-check-input"
                    @change="saveAttendance(student)"
                  />
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- Form för admin/lärare -->
        <form
          v-if="canEdit"
          @submit.prevent="submitExam"
          class="d-flex flex-wrap align-items-center gap-3"
        >
          <div class="d-flex align-items-center gap-2">
            <label class="mb-0 fw-semibold">Provtid:</label>
            <select v-model="selectedHour" class="time-select" @change="updateTime">
              <option v-for="hour in 24" :key="hour" :value="hour.toString().padStart(2, '0')">
                {{ hour.toString().padStart(2, '0') }}
              </option>
            </select>
            <span class="time-separator">:</span>
            <select v-model="selectedMinute" class="time-select" @change="updateTime">
              <option
                v-for="minute in [0, 15, 30, 45]"
                :key="minute"
                :value="minute.toString().padStart(2, '0')"
              >
                {{ minute.toString().padStart(2, '0') }}
              </option>
            </select>
            <span class="time-separator">–</span>
            <label class="mb-0">Slut:</label>
            <select v-model="selectedEndHour" class="time-select" @change="updateTime">
              <option
                v-for="hour in 24"
                :key="'end-' + hour"
                :value="hour.toString().padStart(2, '0')"
              >
                {{ hour.toString().padStart(2, '0') }}
              </option>
            </select>
            <span class="time-separator">:</span>
            <select v-model="selectedEndMinute" class="time-select" @change="updateTime">
              <option
                v-for="minute in [0, 15, 30, 45]"
                :key="'endm-' + minute"
                :value="minute.toString().padStart(2, '0')"
              >
                {{ minute.toString().padStart(2, '0') }}
              </option>
            </select>
          </div>

          <div class="d-flex align-items-center gap-2">
            <label class="mb-0 fw-semibold">Kommun:</label>
            <select v-model="examMunicipality" class="form-select">
              <option
                v-for="(locations, municipality) in examMunicipalities"
                :key="municipality"
                :value="municipality"
              >
                {{ municipality }}
              </option>
            </select>
          </div>

          <div class="d-flex align-items-center gap-2">
            <label class="mb-0 fw-semibold">Plats:</label>
            <select v-model="examLocation" class="form-select">
              <option
                v-for="location in examMunicipalities[examMunicipality]"
                :key="location"
                :value="location"
              >
                {{ location }}
              </option>
            </select>
          </div>

          <button type="submit" class="btn btn-primary ms-auto" :disabled="isSaving">
            {{ isSaving ? 'Sparar...' : 'Spara prov' }}
          </button>
        </form>
        <div v-if="showSuccessMessage" class="success-message">Prov sparat!</div>
      </div>
    </div>
  </div>
</template>

<script>
  import client from '@/api/client.js'
  import { useToast } from '@/composables/useToast.js'

  export default {
    props: { event: { type: Object, required: true } },
    emits: ['close', 'update'],
    data() {
      return {
        isSaving: false,
        studentsData: [],
        showSuccessMessage: false,
        loadingCourses: {},
        currentTeacherId: null, // Store the current teacher's Teacher model _id
        examMunicipalities: {
          Sollentuna: ['308', '310', 'lilla rummet', 'Aniara', 'Kung Agnes'],
          Akalla: ['Vision', 'Hässja', 'Arkarli', '316'],
        },
        selectedHour: '09',
        selectedMinute: '00',
        selectedEndHour: '12',
        selectedEndMinute: '00',
        examTime: '',
        examMunicipality: '',
        examLocation: '',
      }
    },
    computed: {
      canEdit() {
        const currentUser = this.$store?.state?.user
        if (!currentUser) return false
        const isAdmin = ['admin', 'systemadmin'].includes(currentUser.role)
        
        // Get the event's teacherId (this is the Teacher model _id, not User _id)
        const eventTeacherId = this.event.extendedProps?.teacherId?._id?.toString() || 
                               this.event.extendedProps?.teacherId?.toString() || 
                               this.event.teacherId?.toString()
        
        // For teachers, check if their Teacher record ID matches the event's teacherId
        let isEventTeacher = false
        if (currentUser.role === 'teacher' && eventTeacherId && this.currentTeacherId) {
          isEventTeacher = this.currentTeacherId.toString() === eventTeacherId
        }
        
        return isAdmin || isEventTeacher
      },
      courseInstanceCode() {
        // Get course instance code from the first student (all students should have the same one)
        if (this.studentsData && this.studentsData.length > 0) {
          return this.studentsData[0].courseInstanceCode || this.studentsData[0].courseCode || null
        }
        return null
      },
      courseName() {
        // Get course name from the first student (all students should have the same one)
        if (this.studentsData && this.studentsData.length > 0) {
          return this.studentsData[0].courseName || null
        }
        return null
      },
    },
    watch: {
      event: {
        immediate: true,
        async handler(newEvent) {
          if (!newEvent) return

          const exProps = newEvent.extendedProps || {}

          if (exProps.students && Array.isArray(exProps.students) && exProps.students.length > 0) {
            await this.setStudentsFromProps(exProps)
          } else {
            console.warn('🟠 Inga students i extendedProps – försöker hämta manuellt...')
            try {
              const response = await client.get('/calendar-events/syncable')
              const allEvents = response.data
              const match = allEvents.find((e) => e._id === newEvent.id || e.id === newEvent.id)

              if (match?.extendedProps?.students) {
                await this.setStudentsFromProps(match.extendedProps)
              } else {
                console.error('❌ Ingen matchande event hittades för ID:', newEvent.id)
                this.studentsData = []
              }
            } catch (err) {
              console.error('❌ Kunde inte hämta event från API:', err)
              this.studentsData = []
            }
          }
        },
      },
    },
    async mounted() {
      // Get current teacher ID if user is a teacher (for permission checks)
      const currentUser = this.$store?.state?.user
      if (currentUser && currentUser.role === 'teacher') {
        try {
          const res = await client.get('/me/teacher')
          if (res.data && res.data._id) {
            this.currentTeacherId = res.data._id.toString()
          }
        } catch (err) {
          console.error('❌ Kunde inte hämta lärare:', err)
          // If the endpoint doesn't exist yet, try to get it from the event data
          // The event should have the teacherId in extendedProps
        }
      }
      this.refreshEventData()
    },
    methods: {
      async refreshEventData() {
        if (!this.event) return

        try {
          const response = await client.get('/calendar-events/syncable')
          const allEvents = response.data

          const teacherId = (
            this.event.extendedProps?.teacherId || this.event.teacherId
          )?.toString?.()
          const eventDate = new Date(this.event.start).toISOString().split('T')[0]

          console.log('🔍 refreshEventData – searching for match:')
          console.log('  TeacherId:', teacherId)
          console.log('  EventDate:', eventDate)

          const match = allEvents.find((e) => {
            const ep = e.extendedProps || {}
            const matchTeacherId = ep.teacherId?.toString?.()
            const matchDate = new Date(e.start).toISOString().split('T')[0]
            return matchTeacherId === teacherId && matchDate === eventDate
          })

          if (match?.extendedProps?.students) {
            await this.setStudentsFromProps(match.extendedProps)
          } else {
            console.warn(
              '⚠️ Ingen matchande event hittades i syncable – använder originaldata istället'
            )
            const exProps = this.event.extendedProps || {}
            if (exProps.students && Array.isArray(exProps.students)) {
              await this.setStudentsFromProps(exProps)
            } else {
              this.studentsData = []
            }
          }
        } catch (error) {
          console.error('❌ Fel vid refreshEventData:', error)
          const exProps = this.event.extendedProps || {}
          if (exProps.students && Array.isArray(exProps.students)) {
            await this.setStudentsFromProps(exProps)
          } else {
            this.studentsData = []
          }
        }
      },
      async loadStudentCourses(student) {
        if (this.loadingCourses[student._id]) return;
        
        this.loadingCourses[student._id] = true;
        try {
          const studentDetails = await client.get(`/student-details/${student._id}`);
          const education = studentDetails.data?.education || [];
          
          // Format course instances for dropdown - use courseInstance from enrollment data
          const courseInstances = education
            .filter(edu => {
              // Include enrollments that have courseInstanceId or courseInstance
              return edu.courseInstanceId || edu.courseInstance || (edu.type === 'Course' && edu.enrollmentId);
            })
            .map(edu => {
              // Get course instance from enrollment
              const instance = edu.courseInstance || (edu.courseInstanceId ? { _id: edu.courseInstanceId } : null);
              const mainCourse = edu.refId; // mainCourseId from enrollment
              
              // Get course instance code - prefer from courseInstance, fallback to courseCode
              const courseInstanceCode = instance?.courseCode || 
                                        edu.courseInstanceCode || 
                                        mainCourse?.courseCode || 
                                        '';
              
              // Get course name from main course
              const courseName = mainCourse?.courseName || edu.name || 'Okänd kurs';
              
              return {
                id: instance?._id || edu.courseInstanceId || edu.enrollmentId,
                courseInstanceCode: courseInstanceCode,
                courseName: courseName,
                enrollmentId: edu.enrollmentId || edu._id,
                displayName: `${courseInstanceCode} - ${courseName}`.trim()
              };
            });

          // Find current course instance in the list
          const currentInstanceId = student.courseInstanceId || 
            student.enrollmentId ||
            (student.courseInstanceCode ? courseInstances.find(c => c.courseInstanceCode === student.courseInstanceCode)?.id : null);

          student.availableCourseInstances = courseInstances;
          student.selectedCourseInstance = currentInstanceId || (courseInstances.length > 0 ? courseInstances[0].id : null);
          
          // Update courseInstanceCode if course instance is selected
          if (student.selectedCourseInstance) {
            const selectedInstance = courseInstances.find(c => c.id?.toString() === student.selectedCourseInstance?.toString());
            if (selectedInstance) {
              student.courseInstanceCode = selectedInstance.courseInstanceCode;
              student.courseName = selectedInstance.courseName;
              student.courseInstanceId = selectedInstance.id;
              student.enrollmentId = selectedInstance.enrollmentId;
            }
          }
        } catch (error) {
          console.error("Kunde inte hämta elevens kursinstanser:", error);
          student.availableCourseInstances = [];
          student.selectedCourseInstance = null;
        } finally {
          this.loadingCourses[student._id] = false;
        }
      },
      updateStudentCourseInstance(student) {
        const selectedInstance = student.availableCourseInstances.find(c => c.id?.toString() === student.selectedCourseInstance?.toString());
        if (selectedInstance) {
          student.courseInstanceCode = selectedInstance.courseInstanceCode;
          student.courseName = selectedInstance.courseName;
          student.courseInstanceId = selectedInstance.id;
          student.enrollmentId = selectedInstance.enrollmentId;
          this.saveEventStudents();
        }
      },
      updateStudentInfo(student) {
        // Save the updated info field
        this.saveEventStudents();
      },
      async saveEventStudents() {
        if (!this.event.id) return;
        
        try {
          // Format students for saving
          const formattedStudents = this.studentsData.map((s) => {
            const selectedInstance = s.availableCourseInstances?.find(c => c.id?.toString() === s.selectedCourseInstance?.toString());
            return {
              _id: s._id,
              name: s.name,
              personalNumber: s.personalNumber,
              additionalInfo: s.additionalInfo || "",
              attended: s.attended ?? false,
              courseInstanceCode: selectedInstance?.courseInstanceCode || s.courseInstanceCode || '',
              courseName: selectedInstance?.courseName || s.courseName || '',
              courseInstanceId: selectedInstance?.id || s.courseInstanceId || null,
              enrollmentId: selectedInstance?.enrollmentId || s.enrollmentId || null
            };
          });

          // Update the calendar event
          await client.put(`/calendar-events/${this.event.id}`, {
            extendedProps: {
              ...this.event.extendedProps,
              students: formattedStudents
            }
          });

          // Update local event
          this.event.extendedProps.students = formattedStudents;
        } catch (error) {
          console.error("Kunde inte spara studenter:", error);
        }
      },
      async setStudentsFromProps(exProps) {
        // First, get the base student data from extendedProps
        const baseStudents = (exProps.students || []).map((s) => ({
          _id: s._id,
          name: s.name,
          personalNumber: s.personalNumber,
          additionalInfo: s.additionalInfo || '',
          courseInstanceCode: s.courseInstanceCode || s.courseCode || '',
          courseName: s.courseName || '',
          courseInstanceId: s.courseInstanceId || s.courseId || null,
          enrollmentId: s.enrollmentId || null,
          attended: s.attended ?? false,
          examTime: s.examTime || '',
          examMunicipality: s.examMunicipality || '',
          examLocation: s.examLocation || '',
          finalExamDate: s.finalExamDate || null,
          availableCourseInstances: [],
          selectedCourseInstance: null
        }))

        // Load courses for each student
        for (const student of baseStudents) {
          await this.loadStudentCourses(student);
        }

        // Fetch the latest attendance data for this event
        try {
          const eventDate = this.event.start
          const teacherId = exProps.teacherId

          if (eventDate && teacherId && baseStudents.length > 0) {
            const response = await client.get(
              `/calendar-events/attendance/${encodeURIComponent(eventDate)}/${teacherId}`
            )
            const attendanceData = response.data

            // Merge attendance data with base student data
            this.studentsData = baseStudents.map((student) => {
              const attendance = attendanceData.find(
                (a) =>
                  (a.studentId?._id || a.studentId)?.toString() === (student._id || '').toString()
              )
              if (attendance) {
                return {
                  ...student,
                  attended: attendance.attended ?? student.attended,
                  examTime: attendance.examTime || student.examTime,
                  examMunicipality: attendance.examMunicipality || student.examMunicipality,
                  examLocation: attendance.examLocation || student.examLocation,
                  finalExamDate: student.finalExamDate, // Preserve the finalExamDate
                }
              }
              return student
            })
          } else {
            this.studentsData = baseStudents
          }
        } catch (error) {
          console.warn('Could not fetch attendance data, using base data:', error)
          this.studentsData = baseStudents
        }

        // Set exam info from extendedProps or from the first student with exam info
        this.examTime =
          exProps.examTime ||
          this.studentsData.find((s) => s.examTime)?.examTime ||
          `${this.selectedHour}:${this.selectedMinute}`
        this.examMunicipality =
          exProps.examMunicipality ||
          this.studentsData.find((s) => s.examMunicipality)?.examMunicipality ||
          ''
        this.examLocation =
          exProps.examLocation || this.studentsData.find((s) => s.examLocation)?.examLocation || ''

        // Debug logging
        console.log('🔍 Frontend - ExtendedProps exam info:', {
          examTime: exProps.examTime,
          examMunicipality: exProps.examMunicipality,
          examLocation: exProps.examLocation,
        })
        console.log('🔍 Frontend - Final exam info:', {
          examTime: this.examTime,
          examMunicipality: this.examMunicipality,
          examLocation: this.examLocation,
        })

        // Debug logging for students and finalExamDate
        console.log(
          '🔍 Frontend - Students data:',
          this.studentsData.map((s) => ({
            name: s.name,
            finalExamDate: s.finalExamDate,
            attended: s.attended,
          }))
        )

        // If no exam info exists yet, set default time
        if (!this.examTime || this.examTime === '') {
          this.examTime = `${this.selectedHour}:${this.selectedMinute}`
        }

        // Update time selectors if examTime is set
        if (this.examTime && this.examTime.includes(':')) {
          if (this.examTime.includes('-')) {
            // format: HH:MM-HH:MM
            const [start, end] = this.examTime.split('-')
            const [sh, sm] = start.split(':')
            const [eh, em] = end.split(':')
            this.selectedHour = sh
            this.selectedMinute = sm
            this.selectedEndHour = eh
            this.selectedEndMinute = (em || '00').toString().padStart(2, '0')
          } else {
            const [hour, minute] = this.examTime.split(':')
            this.selectedHour = hour
            this.selectedMinute = minute
            // heuristic default end: +3 hours
            const endH = (parseInt(hour, 10) + 3) % 24
            this.selectedEndHour = endH.toString().padStart(2, '0')
            this.selectedEndMinute = '00'
          }
        }
      },
      updateTime() {
        const endMinutes = this.selectedEndMinute || '00'
        if (this.selectedEndHour && this.selectedEndHour !== '') {
          this.examTime = `${this.selectedHour}:${this.selectedMinute}-${this.selectedEndHour}:${endMinutes}`
        } else {
          this.examTime = `${this.selectedHour}:${this.selectedMinute}`
        }
      },
      closeModal() {
        this.$emit('close')
      },
      async saveAttendance(student) {
        const toast = useToast()
        try {
          // Use the student's exam date if available, otherwise use the event date
          const examDate = student.finalExamDate || this.event.start

          console.log('🔍 Frontend - saveAttendance called for student:', {
            name: student.name,
            finalExamDate: student.finalExamDate,
            eventStart: this.event.start,
            examDate: examDate,
          })

          await client.post(
            '/calendar-events/mark-attendance',
            {
              date: examDate,
              teacherId: this.event.extendedProps?.teacherId || this.event.teacherId,
              students: [
                {
                  _id: student._id,
                  attended: !!student.attended,
                  personalNumber: student.personalNumber,
                  examTime: student.examTime || this.examTime || '',
                  examMunicipality: student.examMunicipality || this.examMunicipality || '',
                  examLocation: student.examLocation || this.examLocation || '',
                },
              ],
              examTime: this.examTime,
              examMunicipality: this.examMunicipality,
              examLocation: this.examLocation,
            }
          )
          // Refresh the event data to show the updated information
          await this.refreshEventData()
        } catch (error) {
          console.error('❌ Kunde inte spara närvaro:', error.response?.data || error.message)
          toast.error('Kunde inte spara närvaro, försök igen.')
        }
      },
      async submitExam() {
        const toast = useToast()
        if (!this.examTime || !this.examMunicipality || !this.examLocation) {
          toast.error('Välj tid, kommun och plats för provet.')
          return
        }

        this.isSaving = true
        try {
          // Prefer locally loaded students; fallback to event props
          const students =
            this.studentsData && this.studentsData.length > 0
              ? this.studentsData
              : Array.isArray(this.event?.extendedProps?.students)
              ? this.event.extendedProps.students
              : []

          const studentIds = students.map((s) => s?._id).filter((id) => !!id)

          if (studentIds.length === 0) {
            this.isSaving = false
            console.error('❌ Inga student-ID:n tillgängliga för uppdatering.')
            toast.error(
              'Inga studenter kopplade till detta prov kunde hittas. Försök ladda om sidan eller öppna eventet igen.'
            )
            return
          }
          const teacherId = this.event.extendedProps?.teacherId || this.event.teacherId

          // Use the first student's exam date if available, otherwise use the event date
          const examDate = students[0]?.finalExamDate || this.event.start

          console.log('🔍 Frontend - submitExam called with:', {
            firstStudentName: students[0]?.name,
            firstStudentFinalExamDate: students[0]?.finalExamDate,
            eventStart: this.event.start,
            examDate: examDate,
          })

          await client.post(
            '/calendar-events/mark-attendance',
            {
              date: examDate,
              teacherId,
              students: students.map((s) => ({
                _id: s._id,
                attended: !!s.attended,
                personalNumber: s.personalNumber,
                examTime: this.examTime,
                examMunicipality: this.examMunicipality,
                examLocation: this.examLocation,
              })),
              examTime: this.examTime,
              examMunicipality: this.examMunicipality,
              examLocation: this.examLocation,
            }
          )

          await client.post(
            '/examtime-location',
            {
              studentIds,
              examTime: this.examTime,
              examMunicipality: this.examMunicipality,
              examLocation: this.examLocation,
            }
          )
          this.event.extendedProps.examTime = this.examTime
          this.event.extendedProps.examMunicipality = this.examMunicipality
          this.event.extendedProps.examLocation = this.examLocation

          this.showSuccessMessage = true
          await this.refreshEventData()

          setTimeout(() => {
            this.showSuccessMessage = false
            this.$emit('update')
            this.closeModal()
          }, 2000)
        } catch (error) {
          console.error('❌ Fel vid uppdatering:', error.response?.data || error.message)
          toast.error('Ett fel uppstod vid sparande av provet. Försök igen.')
        } finally {
          this.isSaving = false
        }
      },
    },
  }
</script>

<style scoped>
  .modal {
    display: flex;
    align-items: center;
    justify-content: center;
  }
  
  /* Ensure Vuetify menus appear above modal */
  :deep(.v-overlay__content) {
    z-index: 10000 !important;
  }
  
  :deep(.v-menu__content) {
    z-index: 10000 !important;
  }
  
  :deep(.v-select__menu) {
    z-index: 10000 !important;
  }
  .table td {
    vertical-align: middle;
    white-space: pre-line;
  }
  .modal-footer .form-select .modal-footer .form-control {
    min-width: 120px;
  }

  .time-picker-container {
    display: inline-flex;
    align-items: center;
    border: 1px solid #ced4da;
    border-radius: 4px;
    background: white;
    min-width: 120px;
    height: 38px;
  }

  .time-select {
    border: none;
    background: transparent;
    padding: 6px 8px;
    font-size: 14px;
    cursor: pointer;
    outline: none;
    min-width: 50px;
    text-align: center;
  }

  .time-select:first-child {
    border-radius: 4px 0 0 4px;
  }

  .time-select:last-child {
    border-radius: 0 4px 4px 0;
  }

  .time-select:hover {
    background-color: #f8f9fa;
  }

  .time-select:focus {
    background-color: #e9ecef;
  }

  .time-separator {
    padding: 0 4px;
    font-weight: bold;
    color: #495057;
    font-size: 16px;
  }

  .success-message {
    position: fixed;
    top: 20px;
    right: 20px;
    background-color: #28a745;
    color: white;
    padding: 15px 25px;
    border-radius: 8px;
    font-weight: bold;
    font-size: 16px;
    z-index: 9999;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    animation: flash 0.5s ease-in-out 3;
  }

  @keyframes flash {
    0%,
    100% {
      opacity: 1;
      transform: scale(1);
    }
    50% {
      opacity: 0.8;
      transform: scale(1.05);
    }
  }
</style>
