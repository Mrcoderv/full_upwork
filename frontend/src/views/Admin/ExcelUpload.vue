<template>
  <div class="scrollable-view">
    <div class="container">
      <!-- Upload success alert -->
      <div
        v-if="uploadSuccess"
        class="alert alert-success alert-dismissible fade show"
        role="alert"
        style="position: absolute; top: 60px; left: 50%; transform: translateX(-50%); z-index: 1050"
      >
        Students have been uploaded successfully!
      </div>

      <!-- Flash Message System -->
      <div
        v-if="flashMessage.show"
        :class="`alert alert-${flashMessage.type} alert-dismissible fade show`"
        role="alert"
        style="
          position: fixed;
          top: 80px;
          left: 50%;
          transform: translateX(-50%);
          z-index: 1060;
          min-width: 300px;
          text-align: center;
        "
      >
        <span v-html="flashMessage.message"></span>
        <button
          type="button"
          class="btn-close"
          @click="hideFlashMessage"
          aria-label="Close"
        ></button>
      </div>

      <!-- File upload -->
      <!--
      <div class="form-container">
        <form @submit.prevent="uploadFile">
          <div class="file-input-wrapper">
            <label for="fileUpload" class="custom-file-label">Choose File</label>
            <span class="file-name">{{ selectedFileName || 'No file selected' }}</span>
            <input type="file" id="fileUpload" ref="fileInput" @change="handleFileUpload" hidden />
            <button class="btn btn-primary" type="submit">Upload</button>
          </div>
        </form>
      </div>
      -->
      <br />

      <div class="controls">
        <h2>Elever</h2>
        <div class="d-flex gap-3 mb-3 align-center flex-wrap">
          <input type="text" v-model="searchQuery" placeholder="Sök" class="search-input" style="flex:1; min-width:200px" />
          <select v-model="selectedTeacher" class="search-input" style="flex:0 0 240px">
            <option value="">Alla lärare</option>
            <option v-for="t in teachers" :key="t._id" :value="t._id">{{ t.name }}</option>
          </select>
        </div>
        <!-- 
        <button 
          v-if="$store.getters.isSystemAdmin" 
          class="btn btn-danger delete-all-btn" 
          @click="deleteAllStudents"
        >
          Delete All Students
        </button>
        -->
      </div>

      <!-- Student table -->
      <div class="table-container">
        <table v-if="filteredStudents.length > 0" class="dynamic-table">
          <thead>
            <tr>
              <th>Namn</th>
              <th>Personnummer</th>
              <th>Utbildning</th>
              <th v-if="isAdmin">Edit</th>
              <th>Startdatum</th>
              <th>Slutdatum</th>
              <th>Slutprov</th>
              <th>Kommun</th>
              <th>Tel</th>
              <th>Email</th>
              <th>Övrigt</th>
              <th>Lärare</th>
              <!-- <th class="dropout-column">Avhopp</th> -->
              <!-- <th></th> -->
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="student in filteredStudents"
              :key="student._id"
              :class="{ 'dropout-row': student.dropout }"
            >
              <td>
                <div v-if="student.dropout" class="inactive-label">INAKTIV</div>
                <router-link :to="`/student/${student._id}`">{{ student.name }}</router-link>
              </td>
              <td>{{ student.personalNumber }}</td>
              <td class="course-cell">
                <div class="course-list">
                  <div
                    v-if="Array.isArray(student.education) && student.education.length > 0"
                    class="course-group"
                  >
                    <!-- Collapsed view: show first education and count -->
                    <div
                      v-if="!expandedEducations.includes(student._id)"
                      class="course-item collapsed-view"
                      @click.stop="toggleEducation(student._id)"
                    >
                      <div class="course-header">
                        <strong>{{ getSortedEducation(student.education)[0].type }}:</strong>
                        {{ getEducationLabel(getSortedEducation(student.education)[0]) }}
                        <span class="expand-indicator" v-if="student.education.length > 1">
                          +{{ student.education.length - 1 }} mer
                        </span>
                      </div>
                      <div class="course-dates">
                        <span class="date-item">
                          <strong>Start:</strong>
                          {{ formatDate(getSortedEducation(student.education)[0].startDate) }}
                        </span>
                        <span class="date-item">
                          <strong>Slut:</strong>
                          {{ formatDate(getSortedEducation(student.education)[0].endDate) }}
                        </span>
                        <span
                          v-if="getSortedEducation(student.education)[0].grade"
                          class="date-item"
                        >
                          <strong>Grade:</strong>
                          {{ getSortedEducation(student.education)[0].grade }}
                        </span>
                      </div>
                    </div>
                    <!-- Expanded view: show all educations -->
                    <div v-else>
                      <div
                        v-for="course in getSortedEducation(student.education)"
                        :key="course._id || course.refId?._id"
                        class="course-item"
                      >
                        <div class="course-header">
                          <strong>{{ course.type }}:</strong>
                          {{ getEducationLabel(course) }}
                        </div>
                        <div class="course-dates">
                          <span class="date-item">
                            <strong>Start:</strong>
                            {{ formatDate(course.startDate) }}
                          </span>
                          <span class="date-item">
                            <strong>Slut:</strong>
                            {{ formatDate(course.endDate) }}
                          </span>
                          <span class="date-item">
                            <strong>Slutprov:</strong>
                            {{ formatDate(course.finalExamDate) }}
                          </span>
                          <span v-if="course.grade" class="date-item">
                            <strong>Grade:</strong>
                            {{ course.grade }}
                          </span>
                        </div>
                      </div>
                      <div class="collapse-trigger" @click.stop="toggleEducation(student._id)">
                        <span class="collapse-text">▼ Dölj</span>
                      </div>
                    </div>
                  </div>
                  <div v-else class="no-courses">Ingen kurs registrerad</div>
                </div>
              </td>
              <td v-if="isAdmin">
                <button class="btn btn-secondary btn-xs" @click="openEditStudent(student)">
                  Edit
                </button>
              </td>
              <td>{{ formatDate(student.startDate) }}</td>
              <td>{{ formatDate(student.endDate) }}</td>
              <td>{{ formatDate(student.finalExamDate) }}</td>
              <td>{{ student.municipality?.type || 'Ingen kommun' }}</td>
              <td>{{ student.phone }}</td>
              <td>{{ student.email }}</td>
              <td class="ovrigt-cell">
                <div class="comment-container" @click="toggleComment(student._id)">
                  <span
                    class="comment-text"
                    :class="{ truncated: !expandedComments.includes(student._id) }"
                    v-html="
                      formatComment(student.additionalInfo, expandedComments.includes(student._id))
                    "
                  ></span>
                  <span
                    v-if="
                      !expandedComments.includes(student._id) &&
                      student.additionalInfo?.length > 100
                    "
                    class="dots"
                  >
                    ⋯⋯⋯
                  </span>
                </div>
              </td>

              <td>{{ student.teacher }}</td>
              <!-- DROP OUT BUTTON
              <td class="dropout-column">
                <button
                  :class="['dropout-btn', student.dropout ? 'dropout-active' : 'dropout-inactive']"
                  @click="updateDropOut(student)"
                >
                  {{ student.dropout ? 'Avhopp' : 'Aktiv' }}
                </button>
              </td>
              <td>
                <button
                  class="btn btn-danger btn-xs delete-single-button"
                  @click="deleteStudent(student._id)"
                >
                  Delete
                </button>
              </td>
              -->
            </tr>
          </tbody>
        </table>
      </div>

      <!-- ✅ Fixed: Dialog moved OUTSIDE v-for loop -->
      <v-dialog v-model="editingStudentDialog" max-width="800px">
        <template #default>
          <v-card class="pa-4" v-if="editingStudent">
            <form @submit.prevent="saveEditedStudent">
              <div class="student-info-box">
                <h3>Redigera Student: {{ editingStudent.name }}</h3>
              </div>

              <!-- Basic Information -->
              <div class="form-section">
                <h4>Grundläggande Information</h4>
                <div class="form-row">
                  <div class="form-group">
                    <label for="name" class="form-label">Namn *</label>
                    <input
                      id="name"
                      v-model="editingStudent.name"
                      type="text"
                      class="form-control"
                      required
                    />
                  </div>
                  <div class="form-group">
                    <label for="personalNumber" class="form-label">Personnummer *</label>
                    <input
                      id="personalNumber"
                      v-model="editingStudent.personalNumber"
                      type="text"
                      class="form-control"
                      required
                    />
                  </div>
                </div>
                <div class="form-row">
                  <div class="form-group">
                    <label for="email" class="form-label">Email *</label>
                    <input
                      id="email"
                      v-model="editingStudent.email"
                      type="email"
                      class="form-control"
                      required
                    />
                  </div>
                  <div class="form-group">
                    <label for="phone" class="form-label">Telefon</label>
                    <input
                      id="phone"
                      v-model="editingStudent.phone"
                      type="tel"
                      class="form-control"
                    />
                  </div>
                </div>
                <div class="form-row">
                  <div class="form-group">
                    <label for="municipality" class="form-label">Kommun</label>
                    <select
                      id="municipality"
                      v-model="editingStudent.municipality.type"
                      class="form-control"
                    >
                      <option value="">Välj kommun</option>
                      <option value="Botkyrka">Botkyrka</option>
                      <option value="Danderyd">Danderyd</option>
                      <option value="Huddinge">Huddinge</option>
                      <option value="Järfälla">Järfälla</option>
                      <option value="KCNO">KCNO</option>
                      <option value="Lidingö">Lidingö</option>
                      <option value="Norrtälje">Norrtälje</option>
                      <option value="Nykvarn">Nykvarn</option>
                      <option value="Privat kunder">Privat kunder</option>
                      <option value="Salem">Salem</option>
                      <option value="Sigtuna">Sigtuna</option>
                      <option value="Sollentuna">Sollentuna</option>
                      <option value="Solna">Solna</option>
                      <option value="Sundbyberg">Sundbyberg</option>
                      <option value="Södertälje">Södertälje</option>
                      <option value="Täby">Täby</option>
                      <option value="Upplands Bro">Upplands Bro</option>
                      <option value="Upplands Väsby">Upplands Väsby</option>
                      <option value="Vallentuna">Vallentuna</option>
                      <option value="Vaxholm">Vaxholm</option>
                      <option value="Växjö">Växjö</option>
                      <option value="Österåker">Österåker</option>
                    </select>
                  </div>
                  <div class="form-group">
                    <label for="teacher" class="form-label">Lärare</label>
                    <input
                      id="teacher"
                      v-model="editingStudent.teacher"
                      type="text"
                      class="form-control"
                    />
                  </div>
                </div>
              </div>

              <!-- Status and Dates -->
              <div class="form-section">
                <h4>Status och Datum</h4>
                <div class="form-row">
                  <div class="form-group">
                    <label class="form-label">
                      <input
                        type="checkbox"
                        :checked="editingStudent.dropout"
                        @change="handleDropoutChangeInEdit"
                        :disabled="processingDropout"
                        class="form-checkbox"
                        id="edit-dropout-checkbox"
                      />
                      Avhopp (Dropout)
                    </label>
                    <span
                      v-if="processingDropout"
                      style="color: #666; font-size: 0.9rem; margin-left: 8px"
                    >
                      Bearbetar...
                    </span>
                    <p
                      v-if="editingStudent.dropout"
                      style="color: #dc3545; font-weight: bold; margin-top: 8px; font-size: 1.1rem"
                    >
                      ⚠️ INAKTIV
                    </p>
                  </div>
                  <div class="form-group">
                    <label class="form-label">
                      <input
                        type="checkbox"
                        v-model="editingStudent.attendedExam"
                        class="form-checkbox"
                      />
                      Deltog i slutprov
                    </label>
                  </div>
                  <div class="form-group">
                    <label class="form-label">
                      <input
                        type="checkbox"
                        v-model="editingStudent.paidExamFee"
                        class="form-checkbox"
                      />
                      Betalat provavgift
                    </label>
                  </div>
                </div>
                <div class="form-row">
                  <div class="form-group">
                    <label for="startDate" class="form-label">Startdatum</label>
                    <input
                      id="startDate"
                      v-model="editingStudent.startDate"
                      type="date"
                      class="form-control"
                    />
                  </div>
                  <div class="form-group">
                    <label for="endDate" class="form-label">Slutdatum</label>
                    <input
                      id="endDate"
                      v-model="editingStudent.endDate"
                      type="date"
                      class="form-control"
                    />
                  </div>
                </div>
              </div>

              <!-- Education Section -->
              <div class="form-section">
                <h4>Utbildning</h4>
                <div
                  v-for="(edu, index) in getSortedEducation(
                    editingStudent.education.filter((e) => !e.removedAt)
                  )"
                  :key="index"
                  class="education-box"
                >
                  <div class="education-header">
                    <h5>{{ getEducationLabel(edu) }}</h5>
                    <span class="education-type">{{ edu.type }}</span>
                  </div>

                  <div class="form-row">
                    <div class="form-group">
                      <label class="form-label">Startdatum för kurs</label>
                      <input v-model="edu.startDate" type="date" class="form-control" />
                    </div>
                    <div class="form-group">
                      <label class="form-label">Slutdatum för kurs</label>
                      <input v-model="edu.endDate" type="date" class="form-control" />
                    </div>
                    <div class="form-group">
                      <label class="form-label">Slutprov för kurs</label>
                      <input
                        v-model="edu.finalExamDate"
                        type="datetime-local"
                        class="form-control"
                      />
                    </div>
                  </div>

                  <div v-if="edu.type === 'Course'" class="form-row">
                    <div class="form-group">
                      <label class="form-label">Betyg</label>
                      <select v-model="edu.grade" class="form-control">
                        <option value="">Inget betyg</option>
                        <option value="A">A</option>
                        <option value="B">B</option>
                        <option value="C">C</option>
                        <option value="D">D</option>
                        <option value="E">E</option>
                        <option value="F">F</option>
                      </select>
                    </div>
                    <div class="form-group">
                      <label class="form-label">NP-poäng</label>
                      <input
                        v-model="edu.npScore"
                        type="number"
                        class="form-control"
                        min="0"
                        max="100"
                      />
                    </div>
                  </div>

                  <div class="form-row">
                    <div class="form-group">
                      <label class="form-label">Status</label>
                      <select v-model="edu.status" class="form-control">
                        <option value="">Ingen status</option>
                        <option value="active">Aktiv</option>
                        <option value="completed">Avslutad</option>
                        <option value="dropped">Avbruten</option>
                        <option value="suspended">Uppskjuten</option>
                      </select>
                    </div>
                    <div class="form-group">
                      <label class="form-label">
                        <input type="checkbox" v-model="edu.locked" class="form-checkbox" />
                        Låst
                      </label>
                    </div>
                  </div>

                  <div class="form-group">
                    <label class="form-label">Kommentarer för denna kurs</label>
                    <textarea
                      v-model="edu.comments"
                      class="form-control"
                      rows="2"
                      placeholder="Kursspecifika kommentarer..."
                    ></textarea>
                  </div>

                  <div class="education-controls">
                    <button
                      type="button"
                      class="btn btn-danger btn-xs left"
                      @click="confirmRemoveEducation(index)"
                    >
                      Ta bort kurs
                    </button>
                  </div>
                </div>
              </div>

              <!-- Handle adding a new education item -->
              <button
                v-if="!showEducationSelector"
                class="btn betyg-btn"
                style="width: 100%; background-color: #007dc3ff; color: white"
                @click.prevent="addEducation"
                type="button"
              >
                + Lägg till utbildning
              </button>

              <!-- Handle education selector -->
              <div v-if="showEducationSelector">
                <v-autocomplete
                  v-model="selectedEducation"
                  :items="educationOptions.filter((item) => item.type === 'Course')"
                  item-title="name"
                  return-object
                  label="Välj utbildning"
                />

                <button
                  class="btn btn-success btn-xs"
                  @click.prevent="confirmAddEducation"
                  type="button"
                >
                  Lägg till
                </button>
              </div>

              <!-- Final Exam Information -->
              <div class="form-section">
                <h4>Slutprov Information</h4>
                <div class="form-row">
                  <div class="form-group">
                    <label for="finalExamDate" class="form-label">Slutprovdatum</label>
                    <input
                      id="finalExamDate"
                      v-model="editingStudent.finalExamDate"
                      type="datetime-local"
                      class="form-control"
                    />
                  </div>
                  <div class="form-group">
                    <label for="examMunicipality" class="form-label">Provkommun</label>
                    <input
                      id="examMunicipality"
                      v-model="editingStudent.examMunicipality"
                      type="text"
                      class="form-control"
                    />
                  </div>
                </div>
                <div class="form-row">
                  <div class="form-group">
                    <label for="examLocation" class="form-label">Provplats</label>
                    <input
                      id="examLocation"
                      v-model="editingStudent.examLocation"
                      type="text"
                      class="form-control"
                    />
                  </div>
                  <div class="form-group">
                    <label for="examTime" class="form-label">Provtid</label>
                    <input
                      id="examTime"
                      v-model="editingStudent.examTime"
                      type="text"
                      class="form-control"
                      placeholder="t.ex. 09:00-12:00"
                    />
                  </div>
                </div>
              </div>

              <!-- Comments Section -->
              <div class="form-section">
                <h4>Kommentarer</h4>
                <div class="form-group">
                  <label for="additionalInfo" class="form-label">Allmänna kommentarer</label>
                  <textarea
                    id="additionalInfo"
                    v-model="editingStudent.additionalInfo"
                    placeholder="Skriv kommentarer här..."
                    rows="4"
                    class="highlighted-textarea"
                    style="width: 100%"
                  />
                </div>
              </div>

              <div class="modal-actions">
                <button @click="cancelEdit" class="btn btn-secondary" type="button">Avbryt</button>
                <button type="submit" class="btn btn-success">Spara ändringar</button>
              </div>
            </form>
          </v-card>
        </template>
      </v-dialog>
    </div>
  </div>
</template>

<script>
  import client from '@/api/client.js'
  import { mapGetters } from 'vuex'
  import { useToast } from '@/composables/useToast.js'

  let toast;
  export default {
    setup() {
      toast = useToast();
    },
    data() {
      return {
        file: null,
        students: [],
        searchQuery: '',
        selectedTeacher: '',
        teachers: [],
        selectedFileName: '',
        uploadSuccess: false,
        editingStudent: null,
        editingStudentDialog: false,
        originalDropoutState: false,
        processingDropout: false,
        dropoutHandledViaEndpoint: false, // Track if dropout was handled via dedicated endpoint
        educationOptions: [],
        educationSelections: [],
        selectedEducation: null,
        showEducationSelector: false,
        showFinalExamPicker: false,
        finalExamDate: { date: null, time: null },
        formattedFinalExamDate: '',
        showGradeIndex: null,
        expandedComments: [],
        expandedEducations: [], // Track which students have expanded educations
        // Flash message system
        flashMessage: {
          show: false,
          type: 'success', // 'success', 'error', 'warning', 'info'
          message: '',
          duration: 5000, // Auto-hide after 5 seconds
        },
      }
    },

    computed: {
      ...mapGetters(['isAdmin']),
      filteredStudents() {
        return this.students
          .map((student) => ({
            ...student,
            courses: student.courses || [],
          }))
          .filter((student) => {
            if (this.selectedTeacher) {
              const teacherId = student.teacher?._id || student.teacher
              if (teacherId !== this.selectedTeacher) return false
            }
            const query = this.searchQuery.toLowerCase()
            return Object.values(student).some((value) =>
              String(value).toLowerCase().includes(query)
            )
          })
      },
    },

    methods: {
      // Flash message methods
      showFlashMessage(type, message, duration = 5000) {
        this.flashMessage = {
          show: true,
          type: type,
          message: message,
          duration: duration,
        }

        // Auto-hide after duration
        setTimeout(() => {
          this.hideFlashMessage()
        }, duration)
      },

      hideFlashMessage() {
        this.flashMessage.show = false
      },

      // Convenience methods for different message types
      showSuccess(message, duration = 5000) {
        this.showFlashMessage('success', message, duration)
      },

      showError(message, duration = 7000) {
        this.showFlashMessage('error', message, duration)
      },

      showWarning(message, duration = 6000) {
        this.showFlashMessage('warning', message, duration)
      },

      showInfo(message, duration = 5000) {
        this.showFlashMessage('info', message, duration)
      },

      confirmRemoveEducation(index) {
        const confirmText = 'Är du säker på att du vill ta bort denna utbildning från eleven?'
        if (confirm(confirmText)) {
          const courseName = this.editingStudent.education[index]?.name || 'kursen'
          this.removeEducation(index)
          this.showInfo(
            `📝 ${courseName} markerad för borttagning. Klicka "Spara ändringar" för att bekräfta.`
          )
          // Don't auto-save - let user save manually
        }
      },

      // Sort education: CoursePackages first, then courses chronologically
      getSortedEducation(education) {
        if (!education || !Array.isArray(education)) return []

        return [...education].sort((a, b) => {
          // First, separate CoursePackages from other types
          const aIsPackage = a.type === 'CoursePackage'
          const bIsPackage = b.type === 'CoursePackage'

          // CoursePackages come first
          if (aIsPackage && !bIsPackage) return -1
          if (!aIsPackage && bIsPackage) return 1

          // If both are CoursePackages, maintain their relative order (or sort by startDate if available)
          if (aIsPackage && bIsPackage) {
            if (!a.startDate && !b.startDate) return 0
            if (!a.startDate) return 1
            if (!b.startDate) return -1
            return new Date(a.startDate) - new Date(b.startDate)
          }

          // For courses (non-packages), sort chronologically by startDate
          if (!a.startDate && !b.startDate) return 0
          if (!a.startDate) return 1
          if (!b.startDate) return -1
          return new Date(a.startDate) - new Date(b.startDate)
        })
      },

      getEducationLabel(edu) {
        // First try to use the name field (which we populated in the schema)
        if (edu.name) {
          return edu.name
        }

        // Fallback to refId if name is not available
        if (!edu.refId) return '(missing)'
        if (edu.type === 'Course') return edu.refId.courseName || '(no name)'
        if (edu.type === 'CoursePackage')
          return 'CoursePackage: ' + (edu.refId.coursePackageName || '(no name)')
        if (edu.type === 'Program') return edu.refId.programName || '(no name)'
        return '(invalid type)'
      },
      formatComment(text) {
        if (!text) return ''
        return text.replace(/\n/g, '<br />')
      },
      toggleComment(studentId) {
        if (this.expandedComments.includes(studentId)) {
          this.expandedComments = this.expandedComments.filter((id) => id !== studentId)
        } else {
          this.expandedComments.push(studentId)
        }
      },
      toggleEducation(studentId) {
        if (this.expandedEducations.includes(studentId)) {
          this.expandedEducations = this.expandedEducations.filter((id) => id !== studentId)
        } else {
          this.expandedEducations.push(studentId)
        }
      },
      formatComment(text, expanded) {
        if (!text) return ''
        const safeText = text.replace(/</g, '&lt;').replace(/>/g, '&gt;')
        const display = expanded ? safeText : safeText.slice(0, 100)
        return display.replace(/\n/g, '<br />')
      },

      async saveGrade(studentId, courseId, grade) {
        try {
          const response = await client.put(
            `/student/${studentId}/education/${courseId}/grade`,
            { grade }
          )
          console.log('✅ Grade updated:', response.data)
        } catch (error) {
          console.error('❌ Error updating grade:', error)
        }
      },

      updateEducationSelection(val, index) {
        const current = this.editingStudent.education[index]
        this.editingStudent.education[index] = {
          ...current,
          type: val.type,
          name: val.name,
          refId: val.refId,
        }
      },

      updateEducationEntry(val, index) {
        const old = this.editingStudent.education[index]
        this.educationSelections.splice(index, 1, val)

        this.editingStudent.education[index] = {
          ...old,
          type: val.type,
          name: val.name, // name should already be a string
          refId: val.refId,
        }
      },

      applyFinalExamDate() {
        const { date, time } = this.finalExamDate

        if (!date || !time) {
          this.showWarning('Vänligen välj både datum och tid för slutprov.')
          return
        }

        // Convert raw `date` to ISO yyyy-mm-dd
        const parsedDate = new Date(date)
        if (isNaN(parsedDate.getTime())) {
          this.showError('❌ Ogiltigt datum.')
          return
        }

        const isoDatePart = parsedDate.toISOString().split('T')[0] // e.g., "2025-06-30"
        const isoString = `${isoDatePart}T${time}` // e.g., "2025-06-30T12:00"

        const finalDate = new Date(isoString)
        if (isNaN(finalDate.getTime())) {
          this.showError('❌ Ogiltigt kombinerat datum/tid.')
          return
        }

        this.editingStudent.finalExamDate = finalDate.toISOString()
        this.formattedFinalExamDate = `${isoDatePart} ${time}`
        this.showFinalExamPicker = false

        console.log('✅ Final ISO:', this.editingStudent.finalExamDate)
      },

      openEditStudent(student) {
        const clone = JSON.parse(JSON.stringify(student))

        // Ensure municipality is properly formatted
        if (typeof clone.municipality === 'string') {
          clone.municipality = { type: clone.municipality }
        } else if (!clone.municipality) {
          clone.municipality = { type: '' }
        }

        // Ensure education array exists and format dates properly
        if (!Array.isArray(clone.education)) {
          clone.education = []
        }

        // Format dates for HTML date inputs
        if (clone.startDate) {
          clone.startDate = this.formatDateForInput(clone.startDate)
        }
        if (clone.endDate) {
          clone.endDate = this.formatDateForInput(clone.endDate)
        }
        if (clone.finalExamDate) {
          clone.finalExamDate = this.formatDateTimeForInput(clone.finalExamDate)
        }

        // Format education entry dates
        clone.education.forEach((edu) => {
          if (edu.startDate) {
            edu.startDate = this.formatDateForInput(edu.startDate)
          }
          if (edu.endDate) {
            edu.endDate = this.formatDateForInput(edu.endDate)
          }
          if (edu.finalExamDate) {
            edu.finalExamDate = this.formatDateTimeForInput(edu.finalExamDate)
          }
        })

        this.editingStudent = clone
        this.originalDropoutState = clone.dropout || false
        this.dropoutHandledViaEndpoint = false
        console.log(this.editingStudent, 'Current cloned student')
        this.editingStudentDialog = true

        this.educationSelections = clone.education.map((edu) => ({
          type: edu.type,
          name: edu.refId?.courseName || edu.name || '(unnamed)',
          refId: typeof edu.refId === 'object' ? edu.refId._id : edu.refId,
        }))
      },

      // Handle dropout checkbox change in edit modal
      async handleDropoutChangeInEdit(event) {
        const checked = event.target.checked

        this.processingDropout = true

        try {
          if (checked) {
            // Setting to dropout (checked = true) - use dedicated endpoint
            const confirmed = confirm(
              `Är du säker på att du vill markera ${this.editingStudent.name} som avbrott (inaktiv)?\n\n` +
                `Detta kommer att:\n` +
                `- Ta bort eleven från APL-listor\n` +
                `- Ta bort eleven från slutprov\n` +
                `- Skicka en notis till ansvarig lärare`
            )

            if (!confirmed) {
              event.target.checked = this.originalDropoutState
              this.editingStudent.dropout = this.originalDropoutState
              return
            }

            const response = await client.post(`/student-details/${this.editingStudent._id}/dropout`)
            this.editingStudent.dropout = true
            this.dropoutHandledViaEndpoint = true

            // Update the student in the local list immediately
            const index = this.students.findIndex(
              (student) => student._id === this.editingStudent._id
            )
            if (index !== -1) {
              this.students.splice(index, 1, response.data.student)
            }

            toast.success('Eleven har markerats som avbrott (inaktiv).')
          } else {
            // Unchecking (setting to false) - use update endpoint
            const confirmed = confirm(
              `Är du säker på att du vill ta bort avbrott-status för ${this.editingStudent.name}?\n\n` +
                `Eleven kommer att:\n` +
                `- Återfås i APL-listor (om relevant)\n` +
                `- Kunna registreras för slutprov igen`
            )

            if (!confirmed) {
              event.target.checked = true
              this.editingStudent.dropout = true
              return
            }

            const response = await client.delete(`/student-details/${this.editingStudent._id}/dropout`)
            this.editingStudent.dropout = false
            this.dropoutHandledViaEndpoint = false // Reset flag so it can be saved normally

            // Update the student in the local list immediately
            const index = this.students.findIndex(
              (student) => student._id === this.editingStudent._id
            )
            if (index !== -1) {
              this.students.splice(index, 1, response.data.student)
            }

            toast.success('Avbrott-status har tagits bort för eleven.')
          }
        } catch (error) {
          console.error('Error updating dropout status:', error)
          const action = checked ? 'markera elev som avbrott' : 'ta bort avbrott-status'
          toast.error(`Kunde inte ${action}.`)
          // Revert checkbox to original state
          event.target.checked = this.originalDropoutState
          this.editingStudent.dropout = this.originalDropoutState
        } finally {
          this.processingDropout = false
        }
      },

      // Save student after editing
      async saveEditedStudent() {
        try {
          console.log('📤 Sending payload:', this.editingStudent)

          // Prepare the data for sending
          const studentData = { ...this.editingStudent }

          // If dropout was already handled via dedicated endpoint, exclude it from PUT
          // (to avoid overwriting the changes made by the dedicated endpoint)
          if (this.dropoutHandledViaEndpoint) {
            delete studentData.dropout
          }

          // Convert date strings back to proper format for the API (only if not already in ISO format)
          if (studentData.startDate && !studentData.startDate.includes('T')) {
            studentData.startDate = new Date(studentData.startDate).toISOString()
          }
          if (studentData.endDate && !studentData.endDate.includes('T')) {
            studentData.endDate = new Date(studentData.endDate).toISOString()
          }
          if (studentData.finalExamDate && !studentData.finalExamDate.includes('T')) {
            studentData.finalExamDate = new Date(studentData.finalExamDate).toISOString()
          }

          // Convert education entry dates (only if not already in ISO format)
          studentData.education.forEach((edu) => {
            if (edu.startDate && !edu.startDate.includes('T')) {
              edu.startDate = new Date(edu.startDate).toISOString()
            }
            if (edu.endDate && !edu.endDate.includes('T')) {
              edu.endDate = new Date(edu.endDate).toISOString()
            }
            if (edu.finalExamDate && !edu.finalExamDate.includes('T')) {
              edu.finalExamDate = new Date(edu.finalExamDate).toISOString()
            }
          })

          // 1. Save the edited student
          const response = await client.put(
            `/student/${this.editingStudent._id}`,
            studentData
          )

          console.log('✅ Student updated successfully:', response.data)

          // 2. Update the local state with the response data
          const updatedStudent = response.data

          if (updatedStudent) {
            // Find the student in the local list of students
            const index = this.students.findIndex((student) => student._id === updatedStudent._id)

            if (index !== -1) {
              // Replace the student data with the updated one
              this.students.splice(index, 1, updatedStudent)
            }
          }

          // Close the dialog and reset the editingStudent data
          this.editingStudentDialog = false
          this.editingStudent = null
          this.originalDropoutState = false
          this.dropoutHandledViaEndpoint = false
          this.processingDropout = false

          // Show success message
          this.showSuccess('✅ Studenten har sparats framgångsrikt!')
        } catch (error) {
          console.error('❌ Failed to update student:', error)
          this.showError(
            '❌ Kunde inte spara studenten. Kontrollera att alla obligatoriska fält är ifyllda.'
          )
        }
      },

      getCourseName(course) {
        if (!course || !course.courseId) return 'No course data'
        return course.courseId.courseName || 'Unnamed Course'
      },
      handleFileUpload(event) {
        this.selectedFileName =
          event.target.files.length > 0 ? event.target.files[0].name : 'No file selected'
        this.file = event.target.files[0]
      },

      async uploadFile() {
        if (!this.file) {
          this.showWarning('Vänligen välj en Excel-fil att ladda upp.')
          return
        }

        console.log('🟢 Starting file upload process...')

        const formData = new FormData()
        formData.append('file', this.file)

        try {
          const response = await client.post('/uploads/upload/xlsxupload', formData, {
            headers: {
              'Content-Type': 'multipart/form-data',
            },
          })

          console.log('✅ Upload successful:', response.data)
          this.uploadSuccess = true

          setTimeout(() => {
            this.uploadSuccess = false
          }, 3000)

          this.fetchStudents()
        } catch (error) {
          console.error('❌ Error uploading file:', error.response?.data?.error || error)

          if (error.response?.status === 422 && Array.isArray(error.response?.data?.reasons)) {
            const reasons = error.response.data.reasons
              .map((r) => `- ${r.student}: ${r.message}`)
              .join('\n')
            this.showError(
              `❌ Uppladdning avbruten på grund av omatchade kurser:<br/>${reasons.replace(
                /\n/g,
                '<br/>'
              )}`
            )
          } else if (error.response?.status === 409) {
            this.showWarning('⚠️ Några elever fanns redan i systemet och lades inte till.')
          } else if (error.response?.status === 401) {
            this.showError('❌ Du är inte inloggad. Vänligen logga in igen.')
          } else {
            this.showError('❌ Kunde inte ladda upp elever.')
          }
        }

        this.file = null
        this.selectedFileName = ''
        if (this.$refs.fileInput) {
          this.$refs.fileInput.value = ''
        }
      },

      async updateDropOut(student) {
        try {
          const response = await client.put(
            `/student/${student._id}`,
            { dropout: !student.dropout }
          )

          console.log('Updated student data:', response.data)

          this.students = this.students.map((s) =>
            s._id === student._id ? { ...response.data } : s
          )
        } catch (error) {
          console.error('Error updating dropout status:', error)
          this.showError('❌ Kunde inte uppdatera frånvarostatus.')
        }
      },

      async deleteStudent(studentId) {
        if (!confirm('Are you sure you want to delete this student?')) return

        try {
          await client.delete(`/student/${studentId}`)
          console.log(`🚨 Student deleted!: ${studentId}`)
          this.students = this.students.filter((s) => s._id !== studentId)
        } catch (error) {
          console.error('Error deleting student:', error)
          this.showError('❌ Kunde inte ta bort eleven.')
        }
      },

      async deleteAllStudents() {
        if (!confirm('⚠️ Are you sure you want to delete ALL students? This cannot be undone.'))
          return

        try {
          await client.delete('/students')
          console.log('🚨 All students deleted!')
          this.students = []
        } catch (error) {
          console.error('Error deleting all students:', error)
          this.showError('❌ Kunde inte ta bort alla elever.')
        }
      },

      async fetchTeachers() {
        try {
          const { data } = await client.get('/teachers')
          this.teachers = Array.isArray(data) ? data : data.teachers || []
        } catch {
          this.teachers = []
        }
      },

      async fetchStudents() {
        console.log('📡 fetchStudents called')

        try {
          const response = await client.get('/students')
          console.log('✅ Students fetched:', response.data)

          // Get student data and populate this.students
          this.students = response.data.map((student) => ({
            ...student,
            municipality: student.municipality || { type: '' },
            education: Array.isArray(student.education) ? student.education : [],
            courses: Array.isArray(student.courses) ? student.courses : [],
          }))
        } catch (error) {
          console.error('❌ Failed to fetch students:', error.response?.data || error)
          this.showError('❌ Kunde inte hämta elever.')
        }
      },

      async fetchEducationOptions() {
        try {
          const [programsRes, packagesRes, coursesRes] = await Promise.all([
            client.get('/all-programs'),
            client.get('/all-course-packages'),
            client.get('/all-courses'),
          ])

          this.educationOptions = [
            ...programsRes.data.map((p) => ({
              type: 'Program',
              name: p.programName,
              refId: p._id,
            })),
            ...packagesRes.data.map((p) => ({
              type: 'CoursePackage',
              name: p.coursePackageName,
              refId: p._id,
            })),
            ...coursesRes.data.map((c) => ({
              type: 'Course',
              name: `${c.courseName}${c.courseCode ? ` (${c.courseCode})` : ''}`,
              refId: c._id,
            })),
          ]

          console.log('📘 Loaded education options:', this.educationOptions)
        } catch (err) {
          console.error('❌ Failed to load education options:', err)
        }
      },

      formatDate(value) {
        if (!value) return ''
        if (typeof value === 'string' && value.includes('T')) return value.split('T')[0]
        return value
      },

      formatDateForInput(value) {
        if (!value) return ''
        const date = new Date(value)
        if (isNaN(date.getTime())) return ''
        return date.toISOString().split('T')[0]
      },

      formatDateTimeForInput(value) {
        if (!value) return ''
        const date = new Date(value)
        if (isNaN(date.getTime())) return ''
        // Format as YYYY-MM-DDTHH:MM for datetime-local input
        const year = date.getFullYear()
        const month = String(date.getMonth() + 1).padStart(2, '0')
        const day = String(date.getDate()).padStart(2, '0')
        const hours = String(date.getHours()).padStart(2, '0')
        const minutes = String(date.getMinutes()).padStart(2, '0')
        return `${year}-${month}-${day}T${hours}:${minutes}`
      },

      addEducation() {
        this.showEducationSelector = true
      },

      confirmAddEducation() {
        if (!this.selectedEducation) return

        const { type, name, refId } = this.selectedEducation

        this.editingStudent.education.push({
          type,
          name,
          refId,
          addedAt: new Date(),
          addedBy: this.$store.state.user?.name || 'unknown',
          grade: '', // ✅ Explicit default
          reason: null,
          comments: null,
          npScore: null,
          locked: false,
          removedAt: null,
          status: 'enrolled',
          startDate: null,
          endDate: null,
          finalExamDate: null,
        })

        this.educationSelections.push({ type, name, refId })

        this.selectedEducation = null
        this.showEducationSelector = false

        // Show success message
        this.showSuccess(`✅ ${name} har lagts till. Klicka "Spara ändringar" för att bekräfta.`)
      },

      cancelEdit() {
        this.editingStudentDialog = false
        this.editingStudent = null
        this.originalDropoutState = false
        this.dropoutHandledViaEndpoint = false
        this.processingDropout = false
        this.selectedEducation = null
        this.educationSelections = []
        this.finalExamDate = { date: null, time: null }
        this.formattedFinalExamDate = ''
        this.showGradeIndex = null // 🔁 Reset grade toggles
      },

      removeEducation(index) {
        const edu = this.editingStudent.education[index]
        if (edu) {
          edu.removedAt = new Date().toISOString() // 🕒 Soft delete marker
        }
      },
    },
    mounted() {
      this.fetchStudents()
      this.fetchEducationOptions()
      this.fetchTeachers()
    },
  }
</script>

<style scoped>
  .align-right {
    margin-left: auto; /* Pushes the content to the right */
  }

  .justify-center {
    justify-content: center; /* Centers the checkbox horizontally */
  }

  .align-center {
    align-items: center; /* Centers the checkbox vertically */
  }

  /* Fix dialog clipping */
  .v-overlay__content {
    z-index: 3000 !important;
    position: fixed !important;
  }

  .betyg-btn {
    transition: background-color 0.3s ease, color 0.3s ease;
  }

  .betyg-btn:hover {
    background-color: #0056b3 !important;
    color: white !important;
  }

  .comment-display {
    white-space: pre-wrap;
    word-break: break-word;
    font-family: inherit;
  }

  .comment-container {
    max-width: none;
    cursor: pointer;
    position: relative;
    color: #333;
  }

  .comment-text.truncated {
    display: inline;
    white-space: nowrap;
  }

  .dots {
    color: green;
    font-weight: bold;
    margin-left: 4px;
  }

  .education-box {
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    position: relative;
  }

  .education-controls {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .education-controls .left {
    margin-right: auto;
  }

  .education-controls .right {
    margin-left: auto;
  }

  .inactive-label {
    background-color: #dc3545;
    color: white;
    padding: 4px 8px;
    border-radius: 4px;
    font-weight: bold;
    font-size: 0.9rem;
    text-transform: uppercase;
    display: inline-block;
    margin-bottom: 5px;
  }

  .dropout-row {
    background-color: rgba(255, 0, 0, 0.2);
  }

  /* Dropout Button Styling */
  .dropout-btn {
    display: inline-block;
    width: 70px;
    padding: 0px;
    font-size: 14px;
    font-weight: bold;
    text-align: center;
    border: none;
    border-radius: 5px;
    cursor: pointer;
    transition: background 0.3s ease, color 0.3s ease;
  }

  /* Dropout is Active */
  .dropout-active {
    background-color: #dc3545;
    color: white;
  }

  /* Dropout is Inactive */
  .dropout-inactive {
    background-color: #28a745;
    color: white;
  }

  /* Hover Effects */
  .dropout-btn:hover {
    opacity: 0.8;
  }

  .custom-checkbox:checked {
    accent-color: red;
  }

  .container {
    width: 100%;
    max-width: 100%;
    margin: 0 auto;
    padding: 20px;
    box-sizing: border-box;
  }

  .table-container {
    width: 100%;
    max-height: 59vh;
    /* ✅ Adjust height as needed */
    overflow-x: auto;
    /* ✅ Keeps horizontal scrolling */
    overflow-y: auto;
    /* ✅ Enables vertical scrolling */
    border: 1px solid #ddd;
    /* ✅ Adds a border for clarity */
  }

  /* Ensures table header stays visible while scrolling */
  .dynamic-table thead {
    position: sticky;
    top: 0;
    background-color: white;
    /* ✅ Ensures header is readable */
    z-index: 2;
  }

  .dynamic-table {
    width: max-content;
    min-width: 100%;
    table-layout: auto;
    border-collapse: collapse;
  }

  th,
  td {
    padding: 4px 6px;
    /* Reduce padding */
    line-height: 1.2;
    /* Slightly tighter spacing */
    text-align: left;
    /* Ensure left alignment */
    vertical-align: top;
    /* Align to top so multi-line Övrigt expands downward */
    white-space: nowrap;
    /* Prevents unwanted wrapping by default */
    border: 1px solid #ddd;
    /* Add border */
  }

  /* Do not wrap inside the Övrigt column */
  td.ovrigt-cell,
  td.ovrigt-cell * {
    white-space: nowrap !important;
  }

  .course-list ul,
  .coursepackage-list ul {
    display: block;
    /* Ensure list items stack properly */
    flex-wrap: wrap;
    align-items: flex-start;
    justify-content: flex-start;
    max-height: none;
    /* ✅ Remove height restriction */
    overflow: visible;
    /* ✅ Ensure all items are visible */
    list-style: none;
    padding: 0;
    margin: 0;
    text-align: left;
  }

  .course-list li,
  .coursepackage-list {
    display: block;
    /* ✅ Ensure items stack */
    margin-bottom: 4px;
    /* ✅ Space between course names */
  }

  .custom-file-label {
    display: inline-block;
    padding: 8px 12px;
    background-color: #007bff;
    color: white;
    cursor: pointer;
    border-radius: 5px;
    transition: background-color 0.2s ease-in-out;
  }

  .custom-file-label:hover {
    background-color: #0056b3;
  }

  .btn-primary {
    padding: 8px 12px;
    background-color: #007bff;
    color: white;
    border: none;
    border-radius: 5px;
    cursor: pointer;
  }

  .btn-primary:hover {
    background-color: #0056b3;
  }

  .btn-xs {
    padding: 2px 6px;
    /* Smaller padding */
    font-size: 10px;
    /* Smaller text */
    line-height: 1;
  }

  .edit-dialog {
    position: fixed;
    top: 10%;
    left: 50%;
    transform: translateX(-50%);
    background: white;
    padding: 20px;
    border-radius: 10px;
    z-index: 2000;
    max-height: 500px;
    /* ✅ max height */
    overflow-y: auto;
    /* ✅ enable vertical scroll */
    max-width: 500px;
    width: 100%;
  }

  .edit-dialog form > * {
    display: block;
    width: 100%;
    margin-bottom: 10px;
  }

  .highlighted-textarea {
    border: 2px solid #007bff;
    border-radius: 6px;
    padding: 10px;
    font-size: 14px;
    background-color: #f9fcff;
    transition: border-color 0.3s, box-shadow 0.3s;
  }

  .highlighted-textarea:focus {
    border-color: #0056b3;
    outline: none;
    box-shadow: 0 0 5px rgba(0, 123, 255, 0.4);
  }

  .form-label {
    font-weight: bold;
    margin-bottom: 5px;
    display: block;
  }

  .section-heading {
    font-size: 16px;
    font-weight: bold;
    margin: 15px 0 5px 0;
  }

  .student-info-box {
    border: 1px solid #ccc;
    padding: 12px;
    border-radius: 8px;
    background-color: #f7f9fa;
    margin-bottom: 3px;
  }

  .student-info-box p {
    margin: 0;
  }

  .education-box {
    border: 1px solid #d2e3fc;
    border-left: 4px solid #4285f4;
    padding: 12px;
    border-radius: 6px;
    background-color: #f8fbff;
    margin-bottom: 15px;
  }

  .education-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 15px;
    padding-bottom: 10px;
    border-bottom: 1px solid #e0e0e0;
  }

  .education-header h5 {
    margin: 0;
    color: #333;
  }

  .education-type {
    background-color: #007dc3;
    color: white;
    padding: 4px 8px;
    border-radius: 4px;
    font-size: 12px;
    font-weight: bold;
  }

  .form-section {
    margin-bottom: 25px;
    padding: 15px;
    border: 1px solid #e0e0e0;
    border-radius: 8px;
    background-color: #fafafa;
  }

  .form-section h4 {
    margin: 0 0 15px 0;
    color: #333;
    font-size: 16px;
    border-bottom: 2px solid #007dc3;
    padding-bottom: 5px;
  }

  .form-row {
    display: flex;
    gap: 15px;
    margin-bottom: 15px;
  }

  .form-group {
    flex: 1;
    display: flex;
    flex-direction: column;
  }

  .form-control {
    padding: 8px 12px;
    border: 1px solid #ddd;
    border-radius: 4px;
    font-size: 14px;
    transition: border-color 0.3s ease;
  }

  .form-control:focus {
    outline: none;
    border-color: #007dc3;
    box-shadow: 0 0 0 2px rgba(0, 125, 195, 0.2);
  }

  .form-checkbox {
    margin-right: 8px;
    transform: scale(1.2);
  }

  .modal-actions {
    display: flex;
    justify-content: flex-end;
    gap: 10px;
    margin-top: 20px;
    padding-top: 15px;
    border-top: 1px solid #e0e0e0;
  }

  .btn {
    padding: 10px 20px;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-size: 14px;
    font-weight: 500;
    transition: all 0.3s ease;
  }

  .btn-secondary {
    background-color: #6c757d;
    color: white;
  }

  .btn-secondary:hover {
    background-color: #5a6268;
  }

  .btn-success {
    background-color: #28a745;
    color: white;
  }

  .btn-success:hover {
    background-color: #218838;
  }

  .btn-danger {
    background-color: #dc3545;
    color: white;
  }

  .btn-danger:hover {
    background-color: #c82333;
  }

  /* Course Grouping Styles */
  .course-group {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .course-item {
    background-color: #f8f9fa;
    border: 1px solid #e9ecef;
    border-radius: 6px;
    padding: 10px;
    margin-bottom: 8px;
  }

  .course-header {
    font-weight: 600;
    margin-bottom: 6px;
    color: #495057;
  }

  .course-dates {
    display: flex;
    flex-direction: column;
    gap: 4px;
    font-size: 0.9em;
  }

  .date-item {
    color: #6c757d;
  }

  .date-item strong {
    color: #495057;
    margin-right: 4px;
  }

  .no-courses {
    color: #6c757d;
    font-style: italic;
    text-align: center;
    padding: 10px;
  }

  /* Grade is now shown in course-dates section, no special styling needed */

  .collapsed-view {
    cursor: pointer;
    transition: background-color 0.2s ease;
  }

  .collapsed-view:hover {
    background-color: #e9ecef;
  }

  .expand-indicator {
    color: #007bff;
    font-size: 0.85em;
    font-weight: 500;
    margin-left: 8px;
    padding: 2px 6px;
    background-color: #e7f3ff;
    border-radius: 4px;
  }

  .collapse-trigger {
    cursor: pointer;
    text-align: center;
    padding: 8px;
    margin-top: 8px;
    color: #007bff;
    font-weight: 500;
    font-size: 0.9em;
    border-top: 1px dashed #dee2e6;
    padding-top: 10px;
    transition: color 0.2s ease;
  }

  .collapse-trigger:hover {
    color: #0056b3;
  }

  .collapse-text {
    display: inline-block;
  }
</style>
