<template>
  <div class="scrollable-view">
    <div class="course-instances-container">
      <div class="header-section">
        <h3 class="page-title">Kursinstanser</h3>
        <!-- 
        <button class="btn btn-danger" style="margin-left: 20px;" @click="deleteAllCourseInstances">
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24">
            <path fill="currentColor" d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>
          </svg>
          Radera alla kursinstanser
        </button>
        -->
      </div>

      <!-- Filters -->
      <div class="filters-section">
        <div class="filter-group instance-filter-group">
          <label for="courseInstanceFilter">Kurs (namn eller kod):</label>
          <v-text-field
            id="courseInstanceFilter"
            v-model="instanceSearchQuery"
            placeholder="Sök kurs (namn eller kod)"
            clearable
            density="compact"
            variant="outlined"
            hide-details
            class="instance-autocomplete"
          />
        </div>

        <div class="filter-group">
          <label for="dateFilter">Period:</label>
          <input id="startDate" v-model="filters.startDate" type="date" @change="loadInstances" />
          <span>till</span>
          <input id="endDate" v-model="filters.endDate" type="date" @change="loadInstances" />
        </div>

        <div class="filter-group">
          <label for="statusFilter">Status:</label>
          <select id="statusFilter" v-model="filters.isActive" @change="loadInstances">
            <option value="">Alla</option>
            <option value="true">Aktiva</option>
            <option value="false">Inaktiva</option>
          </select>
        </div>

        <button class="btn btn-primary create-instance-button" @click="showCreateModal = true">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24">
            <path fill="currentColor" d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z" />
          </svg>
          Skapa ny instans
        </button>
      </div>

      <!-- Statistics -->
      <div v-if="statistics" class="stats-section">
        <div class="stat-card">
          <h4>Totalt antal instanser</h4>
          <p class="stat-number">{{ statistics.totalInstances }}</p>
        </div>
        <div class="stat-card">
          <h4>Aktiva instanser</h4>
          <p class="stat-number">{{ statistics.activeInstances }}</p>
        </div>
        <div class="stat-card">
          <h4>Totalt antal inskrivningar</h4>
          <p class="stat-number">{{ statistics.totalEnrollments }}</p>
        </div>
        <div class="stat-card">
          <h4>Genomsnittlig inskrivning per instans</h4>
          <p class="stat-number">{{ statistics.averageEnrollments }}</p>
        </div>
      </div>

      <!-- Instances Table -->
      <div class="table-container">
        <table class="table">
          <thead>
            <tr>
              <th @click="setSort('courseName')">
                Kursnamn
                <span v-if="sortKey === 'courseName'">{{ sortOrder === 'asc' ? '▲' : '▼' }}</span>
              </th>
              <th @click="setSort('courseCode')">
                Kurskod
                <span v-if="sortKey === 'courseCode'">{{ sortOrder === 'asc' ? '▲' : '▼' }}</span>
              </th>
              <th @click="setSort('startDate')">
                Startdatum
                <span v-if="sortKey === 'startDate'">{{ sortOrder === 'asc' ? '▲' : '▼' }}</span>
              </th>
              <th class="end-date-header" @click="setSort('endDate')">
                Slutdatum
                <span v-if="sortKey === 'endDate'">{{ sortOrder === 'asc' ? '▲' : '▼' }}</span>
              </th>
              <th class="end-date-header" @click="setSort('slutprovDate')">
                Slutprov
                <span v-if="sortKey === 'slutprovDate'">{{ sortOrder === 'asc' ? '▲' : '▼' }}</span>
              </th>
              <th @click="setSort('enrollmentCount')">
                Inskrivningar
                <span v-if="sortKey === 'enrollmentCount'">
                  {{ sortOrder === 'asc' ? '▲' : '▼' }}
                </span>
              </th>
              <th @click="setSort('isActive')">
                Status
                <span v-if="sortKey === 'isActive'">{{ sortOrder === 'asc' ? '▲' : '▼' }}</span>
              </th>
              <th @click="setSort('createdBy')">
                Skapad av
                <span v-if="sortKey === 'createdBy'">{{ sortOrder === 'asc' ? '▲' : '▼' }}</span>
              </th>
              <th @click="setSort('responsibleTeacher')">
                Ansvarig lärare
                <span v-if="sortKey === 'responsibleTeacher'">
                  {{ sortOrder === 'asc' ? '▲' : '▼' }}
                </span>
              </th>
              <th>Åtgärder</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="instance in sortedInstances" :key="instance._id">
              <td>{{ instance.courseName }}</td>
              <td>{{ instance.courseCode }}</td>
              <td>{{ formatDate(instance.startDate) }}</td>
              <td>{{ formatDate(instance.endDate) }}</td>
              <td>{{ formatDate(instance.slutprovDate) || '-' }}</td>
              <td>
                <span class="enrollment-count">{{ instance.enrollmentCount }}</span>
                <button
                  class="btn btn-sm btn-outline-primary ms-2"
                  title="Visa inskrivningar"
                  @click="viewEnrollments(instance._id)"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                  >
                    <path
                      fill="currentColor"
                      d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"
                    />
                  </svg>
                </button>
              </td>
              <td>
                <span :class="['status-badge', instance.isActive ? 'active' : 'inactive']">
                  {{ instance.isActive ? 'Aktiv' : 'Inaktiv' }}
                </span>
              </td>
              <td>{{ instance.createdBy?.username || 'System' }}</td>
              <td>{{ instance.responsibleTeacher?.userId?.username || '-' }}</td>
              <td class="actions-cell">
                <div class="actions-buttons">
                  <button
                    class="btn btn-sm btn-outline-secondary"
                    title="Redigera"
                    @click="editInstance(instance)"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                    >
                      <path
                        fill="currentColor"
                        d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"
                      />
                    </svg>
                  </button>
                  <button
                    class="btn btn-sm btn-add-student"
                    title="Lägg till student"
                    @click="openAddStudentModal(instance)"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                    >
                      <path fill="currentColor" d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z" />
                    </svg>
                  </button>
                  <button
                    class="btn btn-sm btn-outline-danger"
                    title="Ta bort"
                    @click="deleteInstance(instance._id)"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                    >
                      <path
                        fill="currentColor"
                        d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"
                      />
                    </svg>
                  </button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Create/Edit Modal -->
      <div id="instanceModal" ref="instanceModal" class="modal fade" tabindex="-1">
        <div class="modal-dialog modal-lg">
          <div class="modal-content">
            <div class="modal-header">
              <h5 class="modal-title">
                {{ editingInstance ? 'Redigera' : 'Skapa ny' }} kursinstans
              </h5>
              <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
            </div>
            <div class="modal-body">
              <form @submit.prevent="saveInstance">
                <div class="row">
                  <div class="col-md-6">
                    <div class="form-group">
                      <label for="mainCourseId">Huvudkurs *</label>
                      <select
                        id="mainCourseId"
                        v-model="instanceForm.mainCourseId"
                        class="form-control"
                        required
                        :disabled="editingInstance"
                        @change="autoGenerateCourseCode"
                      >
                        <option value="">Välj kurs</option>
                        <option v-for="course in courses" :key="course._id" :value="course._id">
                          {{ course.courseName }} ({{ course.courseCode }})
                        </option>
                      </select>
                    </div>
                  </div>
                </div>

                <div v-if="!editingInstance" class="row">
                  <div class="col-md-12">
                    <div class="form-group">
                      <label for="templateId">Kursmall (kopierar moduler)</label>
                      <select
                        id="templateId"
                        v-model="instanceForm.templateId"
                        class="form-control"
                      >
                        <option value="">Ingen mall</option>
                        <option v-for="template in templates" :key="template._id" :value="template._id">
                          {{ template.templateName }}
                          <template v-if="template.courseId?.courseName">
                            ({{ template.courseId.courseName }})
                          </template>
                        </option>
                      </select>
                    </div>
                  </div>
                </div>

                <div class="row">
                  <div class="col-md-4">
                    <div class="form-group">
                      <label for="startDate">Startdatum *</label>
                      <input
                        id="startDate"
                        v-model="instanceForm.startDate"
                        type="date"
                        class="form-control"
                        required
                        @change="handleStartDateChange"
                      />
                    </div>
                  </div>
                  <div class="col-md-4">
                    <div class="form-group">
                      <label for="durationWeeks">Kurslängd</label>
                      <select
                        id="durationWeeks"
                        v-model="durationWeeks"
                        class="form-control"
                        :disabled="editingInstance"
                        @change="updateEndDateFromDuration"
                      >
                        <option value="">Välj längd</option>
                        <option value="5">5 veckor</option>
                        <option value="10">10 veckor</option>
                        <option value="20">20 veckor</option>
                      </select>
                    </div>
                  </div>
                  <div class="col-md-4">
                    <div class="form-group">
                      <label for="endDate">Slutdatum *</label>
                      <input
                        id="endDate"
                        v-model="instanceForm.endDate"
                        type="date"
                        class="form-control"
                        required
                      />
                    </div>
                  </div>
                </div>

                <div class="row">
                  <div class="col-md-6">
                    <div class="form-group">
                      <label for="slutprovDate">Slutprov</label>
                      <input
                        id="slutprovDate"
                        v-model="instanceForm.slutprovDate"
                        type="date"
                        class="form-control"
                      />
                    </div>
                  </div>
                  <div class="col-md-6">
                    <div class="form-group">
                      <div class="d-flex align-items-center justify-content-between">
                        <label for="responsibleTeacher">Ansvarig lärare</label>
                        <button
                          type="button"
                          class="btn btn-sm btn-outline-primary"
                          title="Lägg till assisterande lärare"
                          :disabled="showAssistantTeacher"
                          @click="addAssistantTeacher"
                        >
                          +
                        </button>
                      </div>
                      <select
                        id="responsibleTeacher"
                        v-model="instanceForm.responsibleTeacher"
                        class="form-control"
                      >
                        <option value="">Ingen ansvarig lärare</option>
                        <option v-for="teacher in teachers" :key="teacher._id" :value="teacher._id">
                          {{ teacher.userId?.username || teacher.userId?.email || 'Okänd lärare' }}
                        </option>
                      </select>
                    </div>
                    <div v-if="showAssistantTeacher" class="form-group">
                      <label for="assistantTeacher">Assisterande lärare</label>
                      <select
                        id="assistantTeacher"
                        v-model="instanceForm.assistantTeacher"
                        class="form-control"
                      >
                        <option value="">Ingen assisterande lärare</option>
                        <option v-for="teacher in teachers" :key="teacher._id" :value="teacher._id">
                          {{ teacher.userId?.username || teacher.userId?.email || 'Okänd lärare' }}
                        </option>
                      </select>
                    </div>
                  </div>
                </div>

                <div class="row">
                  <div class="col-md-6">
                    <div class="form-group">
                      <label for="courseName">Kursnamn</label>
                      <input
                        id="courseName"
                        v-model="instanceForm.courseName"
                        type="text"
                        class="form-control"
                        placeholder="Lämna tomt för att använda huvudkursens namn"
                      />
                    </div>
                  </div>
                  <div class="col-md-6">
                    <div class="form-group">
                      <label for="courseCode">Kurskod</label>
                      <input
                        id="courseCode"
                        v-model="instanceForm.courseCode"
                        type="text"
                        class="form-control"
                        placeholder="Lämna tomt för att auto-generera (baserat på startdatum)"
                      />
                    </div>
                  </div>
                </div>

                <div class="row">
                  <div class="col-md-6">
                    <div class="form-group">
                      <label for="coursePoints">
                        Poäng (valfritt - ärvs från huvudkurs om tomt)
                      </label>
                      <input
                        id="coursePoints"
                        v-model="instanceForm.coursePoints"
                        type="text"
                        class="form-control"
                        placeholder="Lämna tomt för att ärva från huvudkurs"
                      />
                    </div>
                  </div>
                  <div class="col-md-6">
                    <div class="form-group">
                      <label for="courseExtent">
                        Omfattning (valfritt - ärvs från huvudkurs om tomt)
                      </label>
                      <input
                        id="courseExtent"
                        v-model="instanceForm.courseExtent"
                        type="text"
                        class="form-control"
                        placeholder="Lämna tomt för att ärva från huvudkurs"
                      />
                    </div>
                  </div>
                </div>

                <div class="form-group">
                  <label for="notes">Anteckningar</label>
                  <textarea
                    id="notes"
                    v-model="instanceForm.notes"
                    class="form-control"
                    rows="3"
                  ></textarea>
                </div>

                <div class="form-check">
                  <input
                    id="isActive"
                    v-model="instanceForm.isActive"
                    type="checkbox"
                    class="form-check-input"
                  />
                  <label class="form-check-label" for="isActive">Aktiv</label>
                </div>
              </form>
            </div>
            <div class="modal-footer">
              <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">
                Avbryt
              </button>
              <button
                type="button"
                class="btn btn-primary"
                :disabled="isSaving"
                @click="saveInstance"
              >
                {{ isSaving ? 'Sparar...' : editingInstance ? 'Uppdatera' : 'Skapa' }}
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- Add Student Modal -->
      <div id="addStudentModal" ref="addStudentModal" class="modal fade" tabindex="-1">
        <div class="modal-dialog">
          <div class="modal-content">
            <div class="modal-header">
              <h5 class="modal-title">
                Lägg till studenter till {{ selectedInstanceForAddStudent?.courseName }}
              </h5>
              <button
                type="button"
                class="btn-close"
                data-bs-dismiss="modal"
                @click="closeAddStudentModal"
              ></button>
            </div>
            <div class="modal-body">
              <div class="form-group">
                <label for="studentSearch">Sök student</label>
                <v-autocomplete
                  v-model="selectedStudentForAdd"
                  :items="studentSearchResults"
                  item-title="displayName"
                  item-value="_id"
                  label="Sök och välj elev"
                  :loading="isSearchingStudents"
                  :search="studentSearchQuery"
                  return-object
                  clearable
                  :no-data-text="
                    studentSearchQuery.length < 2
                      ? 'Skriv minst 2 tecken för att söka'
                      : 'Inga elever hittades'
                  "
                  :menu-props="{ maxHeight: '300px', zIndex: 10000 }"
                  density="compact"
                  @update:search="searchStudents"
                  @update:model-value="handleStudentSelect"
                >
                  <template #item="{ props, item }">
                    <v-list-item
                      v-bind="props"
                      :title="
                        item.raw.displayName ||
                        `${item.raw.name} (${item.raw.email || item.raw.personalNumber || ''})`
                      "
                    />
                  </template>
                  <template #selection="{ item }">
                    {{
                      item.raw.displayName ||
                      `${item.raw.name} (${item.raw.email || item.raw.personalNumber || ''})`
                    }}
                  </template>
                </v-autocomplete>
              </div>

              <div v-if="selectedStudentsToAdd.length > 0" class="selected-students">
                <h6>Valda studenter:</h6>
                <div
                  v-for="(student, index) in selectedStudentsToAdd"
                  :key="student._id"
                  class="selected-student-item"
                >
                  <span>{{ student.name }}</span>
                  <button
                    class="btn btn-sm btn-outline-danger"
                    @click="removeStudentFromList(index)"
                  >
                    ×
                  </button>
                </div>
              </div>
            </div>
            <div class="modal-footer">
              <button type="button" class="btn btn-secondary" @click="closeAddStudentModal">
                Avbryt
              </button>
              <button
                type="button"
                class="btn btn-primary"
                :disabled="selectedStudentsToAdd.length === 0 || isAddingStudents"
                @click="saveStudentsToInstance"
              >
                {{ isAddingStudents ? 'Sparar...' : 'Spara' }}
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- Enrollments Modal -->
      <div id="enrollmentsModal" ref="enrollmentsModal" class="modal fade" tabindex="-1">
        <div class="modal-dialog modal-xl">
          <div class="modal-content">
            <div class="modal-header">
              <h5 class="modal-title">Inskrivningar för {{ selectedInstance?.courseName }}</h5>
              <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
            </div>
            <div class="modal-body">
              <div v-if="enrollments.length === 0" class="text-center py-4">
                <p>Inga inskrivningar för denna kursinstans.</p>
              </div>
              <div v-else>
                <table class="table table-sm">
                  <thead>
                    <tr>
                      <th>Student</th>
                      <th>Status</th>
                      <th>Startdatum</th>
                      <th>Slutdatum</th>
                      <th>Senaste inloggning</th>
                      <th>Betyg</th>
                      <th>Närvaro</th>
                      <th>Åtgärder</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr
                      v-for="enrollment in enrollments"
                      :key="enrollment._id"
                      :class="{ 'dropout-row': enrollment.studentId?.dropout }"
                    >
                      <td>
                        <div v-if="enrollment.studentId?.dropout" class="inactive-label">
                          INAKTIV
                        </div>
                        {{ enrollment.studentId?.name || 'Okänd student' }}
                      </td>
                      <td>
                        <span :class="['status-badge', getStatusClass(enrollment.status)]">
                          {{ getStatusText(enrollment.status) }}
                        </span>
                      </td>
                      <td>{{ formatDate(enrollment.startDate) }}</td>
                      <td>{{ formatDate(enrollment.endDate) }}</td>
                      <td>{{ enrollment.lastLoginAt ? formatDate(enrollment.lastLoginAt) : '-' }}</td>
                      <td>{{ enrollment.grade || '-' }}</td>
                      <td>
                        {{
                          enrollment.attendancePercentage
                            ? `${enrollment.attendancePercentage}%`
                            : '-'
                        }}
                      </td>
                      <td>
                        <button
                          class="btn btn-sm btn-outline-primary"
                          @click="viewStudentDetails(enrollment.studentId?._id)"
                        >
                          Visa student
                        </button>
                        <button
                          v-if="enrollment.studentId && enrollment.studentId._id"
                          class="btn btn-sm btn-outline-danger ms-2"
                          title="Ta bort inskrivning"
                          @click="deleteEnrollment(enrollment._id)"
                        >
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            width="14"
                            height="14"
                            viewBox="0 0 24 24"
                          >
                            <path
                              fill="currentColor"
                              d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"
                            />
                          </svg>
                        </button>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <button
                v-if="enrollments.some((e) => !e.studentId || !e.studentId._id)"
                class="btn btn-danger mt-3"
                @click="deleteUnknownEnrollments"
              >
                Ta bort alla okända elever
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
  import { ref, onMounted, computed, watch } from 'vue'
  import { useStore } from 'vuex'
  import client from '@/api/client.js'
  import { useToast } from '@/composables/useToast.js'

  export default {
    name: 'CourseInstances',
    setup() {
      const store = useStore()
      const toast = useToast()

      const instances = ref([])
      const courses = ref([])
      const enrollments = ref([])
      const selectedInstance = ref(null)
      const showCreateModal = ref(false)
      const editingInstance = ref(null)
      const isSaving = ref(false)

      const filters = ref({
        courseId: '',
        startDate: '',
        endDate: '',
        isActive: '',
      })

      const allCourseInstancesForFilter = ref([])
      const isLoadingInstances = ref(false)
      const instanceSearchQuery = ref('')

      const instanceForm = ref({
        mainCourseId: '',
        startDate: '',
        endDate: '',
        slutprovDate: '',
        responsibleTeacher: '',
        assistantTeacher: '',
        courseName: '',
        courseCode: '',
        coursePoints: '',
        courseExtent: '',
        notes: '',
        isActive: true,
        templateId: '',
      })
      const durationWeeks = ref('')
      const showAssistantTeacher = ref(false)

      const teachers = ref([])
      const templates = ref([])

      // Add Student Modal state
      const selectedInstanceForAddStudent = ref(null)
      const studentSearchQuery = ref('')
      const studentSearchResults = ref([])
      const selectedStudentsToAdd = ref([])
      const isAddingStudents = ref(false)
      const isSearchingStudents = ref(false)
      const selectedStudentForAdd = ref(null)
      const allStudentsCache = ref([])

      const statistics = computed(() => {
        if (instances.value.length === 0) return null

        const totalInstances = instances.value.length
        const activeInstances = instances.value.filter((i) => i.isActive).length
        const totalEnrollments = instances.value.reduce(
          (sum, i) => sum + (i.enrollmentCount || 0),
          0
        )
        const averageEnrollments =
          totalInstances > 0 ? (totalEnrollments / totalInstances).toFixed(1) : 0

        return {
          totalInstances,
          activeInstances,
          totalEnrollments,
          averageEnrollments,
        }
      })

      const sortKey = ref('')
      const sortOrder = ref('asc')

      const setSort = (key) => {
        if (sortKey.value === key) {
          sortOrder.value = sortOrder.value === 'asc' ? 'desc' : 'asc'
        } else {
          sortKey.value = key
          sortOrder.value = 'asc'
        }
      }

      const filteredInstances = computed(() => {
        let filtered = instances.value

        const query = instanceSearchQuery.value?.toLowerCase().trim()
        if (query) {
          filtered = filtered.filter((i) => {
            const courseName = i.courseName?.toLowerCase() || ''
            const courseCode = i.courseCode?.toLowerCase() || ''
            return courseName.includes(query) || courseCode.includes(query)
          })
        }

        return filtered
      })

      const sortedInstances = computed(() => {
        if (!sortKey.value) return filteredInstances.value
        return [...filteredInstances.value].sort((a, b) => {
          let aVal = a[sortKey.value]
          let bVal = b[sortKey.value]
          // Handle nested fields
          if (sortKey.value === 'createdBy') {
            aVal = a.createdBy?.username || ''
            bVal = b.createdBy?.username || ''
          } else if (sortKey.value === 'responsibleTeacher') {
            aVal = a.responsibleTeacher?.userId?.username || ''
            bVal = b.responsibleTeacher?.userId?.username || ''
          } else if (sortKey.value === 'enrollmentCount') {
            aVal = a.enrollmentCount || 0
            bVal = b.enrollmentCount || 0
          } else if (sortKey.value === 'isActive') {
            aVal = a.isActive ? 1 : 0
            bVal = b.isActive ? 1 : 0
          }
          // Date fields
          if (
            sortKey.value === 'startDate' ||
            sortKey.value === 'endDate' ||
            sortKey.value === 'slutprovDate'
          ) {
            aVal = aVal ? new Date(aVal) : new Date(0)
            bVal = bVal ? new Date(bVal) : new Date(0)
          }
          if (aVal < bVal) return sortOrder.value === 'asc' ? -1 : 1
          if (aVal > bVal) return sortOrder.value === 'asc' ? 1 : -1
          return 0
        })
      })

      const loadCourses = async () => {
        try {
          const response = await client.get('/courses')
          courses.value = response.data
        } catch (error) {
          console.error('Error loading courses:', error)
        }
      }

      const loadInstances = async () => {
        try {
          const params = new URLSearchParams()
          if (filters.value.courseId) params.append('courseId', filters.value.courseId)
          if (filters.value.startDate) params.append('startDate', filters.value.startDate)
          if (filters.value.endDate) params.append('endDate', filters.value.endDate)
          if (filters.value.isActive !== '') params.append('isActive', filters.value.isActive)

          const response = await client.get(`/course-instances?${params.toString()}`)
          instances.value = response.data.instances
          
          // Update autocomplete options with all instances
          updateInstanceFilterOptions(instances.value)
        } catch (error) {
          console.error('Error loading instances:', error)
        }
      }

      const updateInstanceFilterOptions = (instancesList) => {
        allCourseInstancesForFilter.value = Array.isArray(instancesList)
          ? instancesList
          : []
      }

      const saveInstance = async () => {
        isSaving.value = true
        try {
          // Prepare form data
          const formData = { ...instanceForm.value }

          // Remove empty optional fields so backend can inherit from base course
          if (!formData.coursePoints || formData.coursePoints.trim() === '') {
            delete formData.coursePoints
          }
          if (!formData.courseExtent || formData.courseExtent.trim() === '') {
            delete formData.courseExtent
          }
          // Always send slutprovDate when editing, even if empty (to allow clearing)
          // When creating, only send if it has a value
          if (editingInstance.value) {
            // When editing, always send slutprovDate (even if empty string) so backend knows to update it
            // Ensure it's a string in YYYY-MM-DD format
            if (!formData.slutprovDate || formData.slutprovDate.trim() === '') {
              formData.slutprovDate = '' // Send empty string to clear it
            } else {
              // Convert to YYYY-MM-DD format regardless of input format
              let dateStr = String(formData.slutprovDate).trim()

              // Check if it's already in YYYY-MM-DD format
              if (dateStr.match(/^\d{4}-\d{2}-\d{2}$/)) {
                formData.slutprovDate = dateStr
              } else {
                // Try to parse it - could be MM/DD/YYYY, DD/MM/YYYY, or Date object
                let date

                // Check if it's MM/DD/YYYY format
                if (dateStr.match(/^\d{1,2}\/\d{1,2}\/\d{4}$/)) {
                  const parts = dateStr.split('/')
                  const month = parseInt(parts[0], 10) - 1 // Month is 0-indexed
                  const day = parseInt(parts[1], 10)
                  const year = parseInt(parts[2], 10)
                  date = new Date(year, month, day)
                } else {
                  // Try standard Date parsing
                  date = new Date(dateStr)
                }

                if (!isNaN(date.getTime())) {
                  const year = date.getFullYear()
                  const month = String(date.getMonth() + 1).padStart(2, '0')
                  const day = String(date.getDate()).padStart(2, '0')
                  formData.slutprovDate = `${year}-${month}-${day}`
                } else {
                  console.warn('[WARNING] Could not parse slutprovDate:', dateStr)
                  formData.slutprovDate = dateStr // Send as-is and let backend handle it
                }
              }
            }
            console.log(
              '[DEBUG] Sending slutprovDate to backend:',
              formData.slutprovDate,
              '(original:',
              instanceForm.value.slutprovDate,
              ')'
            )
          } else {
            // When creating, only send if it has a value
            if (!formData.slutprovDate || formData.slutprovDate.trim() === '') {
              delete formData.slutprovDate
            }
          }
          if (!formData.responsibleTeacher || formData.responsibleTeacher.trim() === '') {
            delete formData.responsibleTeacher
          }
          if (!formData.assistantTeacher || formData.assistantTeacher.trim() === '') {
            delete formData.assistantTeacher
          }
          if (!formData.courseName || formData.courseName.trim() === '') {
            delete formData.courseName
          }
          if (!formData.courseCode || formData.courseCode.trim() === '') {
            delete formData.courseCode
          }

          if (editingInstance.value) {
            await client.put(`/course-instances/${editingInstance.value._id}`, formData)
          } else {
            await client.post('/course-instances', formData)
          }

          // Reload instances to get the latest data (including updated slutprovDate)
          await loadInstances()
          closeModal()

          // Hide Bootstrap modal
          const modalElement = document.getElementById('instanceModal')
          if (modalElement) {
            const modal = bootstrap.Modal.getInstance(modalElement)
            if (modal) {
              modal.hide()
            }
          }
        } catch (error) {
          console.error('Error saving instance:', error)
          toast.error('Ett fel uppstod när instansen skulle sparas.')
        } finally {
          isSaving.value = false
        }
      }

      const editInstance = (instance) => {
        editingInstance.value = instance
        // Check if slutprovDate is a valid date (not 1970-01-01 which indicates invalid date)
        let slutprovDateValue = ''
        if (instance.slutprovDate) {
          const date = new Date(instance.slutprovDate)
          // Check if it's a valid date and not the epoch (1970-01-01)
          if (!isNaN(date.getTime()) && date.getFullYear() > 1970) {
            // Use local date components to avoid timezone shifts
            const year = date.getFullYear()
            const month = String(date.getMonth() + 1).padStart(2, '0')
            const day = String(date.getDate()).padStart(2, '0')
            slutprovDateValue = `${year}-${month}-${day}`
          }
        }

        instanceForm.value = {
          mainCourseId: instance.mainCourseId._id,
          startDate: instance.startDate.split('T')[0],
          endDate: instance.endDate.split('T')[0],
          slutprovDate: slutprovDateValue,
          responsibleTeacher: instance.responsibleTeacher?._id || instance.responsibleTeacher || '',
          assistantTeacher: instance.assistantTeacher?._id || instance.assistantTeacher || '',
          courseName: instance.courseName,
          courseCode: instance.courseCode,
          coursePoints: instance.coursePoints,
          courseExtent: instance.courseExtent,
          notes: instance.notes,
          isActive: instance.isActive,
        }
        durationWeeks.value = ''
        showAssistantTeacher.value = !!instanceForm.value.assistantTeacher
        showCreateModal.value = true
      }

      const loadTeachers = async () => {
        try {
          const response = await client.get('/teachers')
          // Backend returns array directly or wrapped in data
          teachers.value = Array.isArray(response.data)
            ? response.data
            : response.data?.teachers || []
        } catch (error) {
          console.error('Error loading teachers:', error)
          teachers.value = []
        }
      }

      const loadTemplates = async () => {
        try {
          const response = await client.get('/course-templates')
          templates.value = response.data.templates || []
        } catch (error) {
          console.error('Error loading course templates:', error)
          templates.value = []
        }
      }

      const autoGenerateCourseCode = () => {
        if (
          !instanceForm.value.mainCourseId ||
          !instanceForm.value.startDate ||
          editingInstance.value
        ) {
          return // Don't auto-generate if editing or missing required fields
        }

        const selectedCourse = courses.value.find((c) => c._id === instanceForm.value.mainCourseId)
        if (!selectedCourse || instanceForm.value.courseCode) {
          return // Don't override if user has typed something
        }

        // Generate course code like in course-matching: baseCode + YY + MM
        const startDate = new Date(instanceForm.value.startDate)
        const year = String(startDate.getFullYear()).slice(-2)
        const month = String(startDate.getMonth() + 1).padStart(2, '0')
        instanceForm.value.courseCode = `${selectedCourse.courseCode}${year}${month}`

        // Also auto-generate course name if empty
        if (!instanceForm.value.courseName) {
          instanceForm.value.courseName = selectedCourse.courseName
        }
      }

      const formatDateForInput = (date) => {
        const year = date.getFullYear()
        const month = String(date.getMonth() + 1).padStart(2, '0')
        const day = String(date.getDate()).padStart(2, '0')
        return `${year}-${month}-${day}`
      }

      const parseInputDate = (dateString) => {
        if (!dateString) return null
        const [year, month, day] = dateString.split('-').map(Number)
        if (!year || !month || !day) return null
        return new Date(year, month - 1, day)
      }

      const calculateFridayEndDate = (startDate, weeks) => {
        const baseDate = new Date(startDate)
        baseDate.setDate(baseDate.getDate() + (weeks - 1) * 7)
        const dayOfWeek = baseDate.getDay()
        const daysUntilFriday = (5 - dayOfWeek + 7) % 7
        baseDate.setDate(baseDate.getDate() + daysUntilFriday)
        return baseDate
      }

      const updateEndDateFromDuration = () => {
        if (editingInstance.value) return
        if (!instanceForm.value.startDate || !durationWeeks.value) return

        const startDate = parseInputDate(instanceForm.value.startDate)
        const weeks = Number(durationWeeks.value)
        if (!startDate || Number.isNaN(weeks)) return

        const endDate = calculateFridayEndDate(startDate, weeks)
        instanceForm.value.endDate = formatDateForInput(endDate)
      }

      const handleStartDateChange = () => {
        autoGenerateCourseCode()
        updateEndDateFromDuration()
      }

      const addAssistantTeacher = () => {
        showAssistantTeacher.value = true
      }

      const closeModal = () => {
        editingInstance.value = null
        instanceForm.value = {
          mainCourseId: '',
          startDate: '',
          endDate: '',
          slutprovDate: '',
          responsibleTeacher: '',
          assistantTeacher: '',
          courseName: '',
          courseCode: '',
          coursePoints: '',
          courseExtent: '',
          notes: '',
          isActive: true,
        }
        durationWeeks.value = ''
        showAssistantTeacher.value = false
        showCreateModal.value = false
      }

      const deleteInstance = async (instanceId) => {
        if (!confirm('Är du säker på att du vill ta bort denna kursinstans?')) return

        try {
          await client.delete(`/course-instances/${instanceId}`)
          await loadInstances()
        } catch (error) {
          console.error('Error deleting instance:', error)
          toast.error('Ett fel uppstod när instansen skulle tas bort.')
        }
      }

      const viewEnrollments = async (instanceId) => {
        try {
          const response = await client.get(`/course-instances/${instanceId}/enrollments`)
          enrollments.value = response.data.enrollments
          selectedInstance.value = instances.value.find((i) => i._id === instanceId)

          const modal = new bootstrap.Modal(document.getElementById('enrollmentsModal'))
          modal.show()
        } catch (error) {
          console.error('Error loading enrollments:', error)
        }
      }

      const viewStudentDetails = (studentId) => {
        if (studentId) {
          window.open(`/student/${studentId}`, '_blank')
        }
      }

      const openAddStudentModal = (instance) => {
        selectedInstanceForAddStudent.value = instance
        studentSearchQuery.value = ''
        studentSearchResults.value = []
        selectedStudentsToAdd.value = []
        selectedStudentForAdd.value = null
        // Pre-load all students for better autocomplete experience
        if (allStudentsCache.value.length === 0) {
          searchStudents('')
        }
        const modal = new bootstrap.Modal(document.getElementById('addStudentModal'))
        modal.show()
      }

      const closeAddStudentModal = () => {
        selectedInstanceForAddStudent.value = null
        studentSearchQuery.value = ''
        studentSearchResults.value = []
        selectedStudentsToAdd.value = []
        selectedStudentForAdd.value = null
      }

      const searchStudents = async (query) => {
        studentSearchQuery.value = query || ''
        const searchQuery = (query || '').trim()

        if (searchQuery.length < 2) {
          studentSearchResults.value = []
          return
        }

        // If we don't have students cached yet, fetch all students
        if (allStudentsCache.value.length === 0) {
          isSearchingStudents.value = true
          try {
            const response = await client.get('/students')
            allStudentsCache.value = Array.isArray(response.data) ? response.data : []
            // Add displayName for each student
            allStudentsCache.value = allStudentsCache.value.map((s) => ({
              ...s,
              displayName: `${s.name}${s.email ? ` (${s.email})` : ''}${
                s.personalNumber ? ` - ${s.personalNumber}` : ''
              }`,
            }))
          } catch (error) {
            console.error('Error fetching students:', error)
            allStudentsCache.value = []
          } finally {
            isSearchingStudents.value = false
          }
        }

        // Filter students by search query (client-side filtering)
        const lowerQuery = searchQuery.toLowerCase()
        studentSearchResults.value = allStudentsCache.value.filter(
          (s) =>
            s.name?.toLowerCase().includes(lowerQuery) ||
            s.email?.toLowerCase().includes(lowerQuery) ||
            s.personalNumber?.includes(searchQuery)
        )
      }

      const handleStudentSelect = (student) => {
        if (student && !selectedStudentsToAdd.value.some((s) => s._id === student._id)) {
          addStudentToList(student)
          // Clear the selection after adding
          selectedStudentForAdd.value = null
        }
      }

      const addStudentToList = (student) => {
        if (!selectedStudentsToAdd.value.some((s) => s._id === student._id)) {
          selectedStudentsToAdd.value.push(student)
        }
      }

      const removeStudentFromList = (index) => {
        selectedStudentsToAdd.value.splice(index, 1)
      }

      const saveStudentsToInstance = async () => {
        if (!selectedInstanceForAddStudent.value || selectedStudentsToAdd.value.length === 0) {
          return
        }

        isAddingStudents.value = true
        try {
          const studentIds = selectedStudentsToAdd.value.map((s) => s._id)
          await client.post(
            `/course-instances/${selectedInstanceForAddStudent.value._id}/add-students`,
            {
              studentIds: studentIds,
            }
          )

          toast.success(
            `${selectedStudentsToAdd.value.length} student(er) tillagd(e) till kursinstansen!`
          )
          await loadInstances()
          closeAddStudentModal()

          // Hide Bootstrap modal
          const modalElement = document.getElementById('addStudentModal')
          if (modalElement) {
            const modal = bootstrap.Modal.getInstance(modalElement)
            if (modal) {
              modal.hide()
            }
          }
        } catch (error) {
          console.error('Error adding students:', error)
          toast.error('Kunde inte lägga till studenter. Försök igen.')
        } finally {
          isAddingStudents.value = false
        }
      }

      const formatDate = (dateString) => {
        return new Date(dateString).toLocaleDateString('sv-SE')
      }

      const getStatusClass = (status) => {
        const classes = {
          enrolled: 'enrolled',
          active: 'active',
          completed: 'completed',
          dropped: 'dropped',
          inactive: 'inactive',
          suspended: 'suspended',
        }
        return classes[status] || 'enrolled'
      }

      const getStatusText = (status) => {
        const texts = {
          enrolled: 'Inskriven',
          active: 'Aktiv',
          completed: 'Slutförd',
          dropped: 'Avbruten',
          inactive: 'Inaktiv',
          suspended: 'Avstängd',
        }
        return texts[status] || status
      }

      const deleteAllCourseInstances = async () => {
        if (
          !confirm(
            'Är du säker på att du vill ta bort ALLA kursinstanser och tillhörande data? Detta går inte att ångra.'
          )
        )
          return
        try {
          await client.delete('/course-instances/all')
          await loadInstances()
          toast.success('Alla kursinstanser och tillhörande data har raderats.')
        } catch (error) {
          console.error('Error deleting all course instances:', error)
          toast.error('Ett fel uppstod när alla kursinstanser skulle tas bort.')
        }
      }

      const deleteEnrollment = async (enrollmentId) => {
        if (!confirm('Är du säker på att du vill ta bort denna inskrivning?')) return
        try {
          await client.delete(`/enrollments/${enrollmentId}`)
          await viewEnrollments(selectedInstance.value._id)
        } catch (error) {
          console.error('Error deleting enrollment:', error)
          toast.error('Ett fel uppstod när inskrivningen skulle tas bort.')
        }
      }

      const deleteUnknownEnrollments = async () => {
        if (!confirm('Ta bort ALLA okända elever från denna kursinstans?')) return
        try {
          const unknowns = enrollments.value.filter((e) => !e.studentId || !e.studentId._id)
          for (const e of unknowns) {
            await client.delete(`/enrollments/${e._id}`)
          }
          await viewEnrollments(selectedInstance.value._id)
        } catch (error) {
          console.error('Error deleting unknown enrollments:', error)
          toast.error('Ett fel uppstod när okända elever skulle tas bort.')
        }
      }

      onMounted(() => {
        loadCourses()
        loadInstances()
        loadTeachers()
        loadTemplates()
      })

      // Watch instances to update filter options
      watch(instances, (newInstances) => {
        updateInstanceFilterOptions(newInstances)
      }, { immediate: true })

      // Watch for showCreateModal changes to show/hide the modal
      watch(showCreateModal, (newValue) => {
        if (newValue) {
          const modal = new bootstrap.Modal(document.getElementById('instanceModal'))
          modal.show()

          // Listen for modal hidden event to reset showCreateModal
          const modalElement = document.getElementById('instanceModal')
          const handleModalHidden = () => {
            showCreateModal.value = false
            modalElement.removeEventListener('hidden.bs.modal', handleModalHidden)
          }
          modalElement.addEventListener('hidden.bs.modal', handleModalHidden)
        }
      })

      return {
        instances,
        courses,
        teachers,
        enrollments,
        selectedInstance,
        showCreateModal,
        editingInstance,
        isSaving,
        filters,
        instanceForm,
        durationWeeks,
        showAssistantTeacher,
        statistics,
        loadInstances,
        loadTeachers,
        saveInstance,
        editInstance,
        deleteInstance,
        viewEnrollments,
        viewStudentDetails,
        closeModal,
        autoGenerateCourseCode,
        updateEndDateFromDuration,
        handleStartDateChange,
        addAssistantTeacher,
        formatDate,
        getStatusClass,
        getStatusText,
        deleteAllCourseInstances,
        deleteEnrollment,
        deleteUnknownEnrollments,
        openAddStudentModal,
        closeAddStudentModal,
        searchStudents,
        handleStudentSelect,
        addStudentToList,
        removeStudentFromList,
        saveStudentsToInstance,
        selectedInstanceForAddStudent,
        studentSearchQuery,
        studentSearchResults,
        selectedStudentsToAdd,
        isAddingStudents,
        isSearchingStudents,
        selectedStudentForAdd,
        sortKey,
        sortOrder,
        setSort,
        sortedInstances,
        allCourseInstancesForFilter,
        isLoadingInstances,
        instanceSearchQuery,
      }
    },
  }
</script>

<style scoped>
  .course-instances-container {
    padding: 20px;
  }

  .header-section {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 30px;
  }

  .page-title {
    margin: 0;
    color: #2c3e50;
  }

  .breadcrumb {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .breadcrumb-link {
    color: #2c9316;
    text-decoration: none;
    font-weight: 500;
  }

  .breadcrumb-link:hover {
    text-decoration: underline;
  }

  .filters-section {
    display: flex;
    gap: 20px;
    align-items: flex-end;
    margin-bottom: 30px;
    padding: 20px;
    background: #f8f9fa;
    border-radius: 8px;
    flex-wrap: wrap;
  }

  .filter-group {
    display: flex;
    flex-direction: column;
    gap: 5px;
  }

  .filter-group label {
    font-weight: 500;
    font-size: 14px;
  }

  .filter-group input,
  .filter-group select {
    padding: 8px 12px;
    border: 1px solid #ddd;
    border-radius: 4px;
    font-size: 14px;
  }

  .stats-section {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 20px;
    margin-bottom: 30px;
  }

  .stat-card {
    background: white;
    padding: 20px;
    border-radius: 8px;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
    text-align: center;
  }

  .stat-card h4 {
    margin: 0 0 10px 0;
    font-size: 14px;
    color: #666;
  }

  .stat-number {
    margin: 0;
    font-size: 24px;
    font-weight: bold;
    color: #2c9316;
  }

  .table-container {
    background: white;
    border-radius: 8px;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
    overflow: hidden;
  }

  .table {
    margin: 0;
  }

  .table th {
    background: #f8f9fa;
    border-bottom: 2px solid #dee2e6;
    font-weight: 600;
  }

  .enrollment-count {
    font-weight: bold;
    color: #2c9316;
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

  .status-badge {
    padding: 4px 8px;
    border-radius: 12px;
    font-size: 12px;
    font-weight: 500;
  }

  .status-badge.active {
    background: #d4edda;
    color: #155724;
  }

  .status-badge.inactive {
    background: #f8d7da;
    color: #721c24;
  }

  .status-badge.enrolled {
    background: #cce5ff;
    color: #004085;
  }

  .status-badge.completed {
    background: #d1ecf1;
    color: #0c5460;
  }

  .status-badge.dropped {
    background: #f8d7da;
    color: #721c24;
  }

  .status-badge.inactive {
    background: #e2e3e5;
    color: #383d41;
  }

  .status-badge.suspended {
    background: #fff3cd;
    color: #856404;
  }

  .form-group {
    margin-bottom: 15px;
  }

  .form-group label {
    font-weight: 500;
    margin-bottom: 5px;
    display: block;
  }

  .form-control {
    width: 100%;
    padding: 8px 12px;
    border: 1px solid #ddd;
    border-radius: 4px;
    font-size: 14px;
  }

  .form-check {
    margin-top: 15px;
  }

  .btn {
    padding: 8px 16px;
    border-radius: 4px;
    border: none;
    cursor: pointer;
    font-size: 14px;
    display: inline-flex;
    align-items: center;
    gap: 5px;
  }

  .btn-primary {
    background: #2c9316;
    color: white;
  }

  .btn-primary:hover {
    background: #1e6b0f;
  }

  .btn-secondary {
    background: #6c757d;
    color: white;
  }

  .btn-outline-primary {
    background: transparent;
    color: #2c9316;
    border: 1px solid #2c9316;
  }

  .btn-outline-secondary {
    background: transparent;
    color: #6c757d;
    border: 1px solid #6c757d;
  }

  .btn-outline-danger {
    background: transparent;
    color: #dc3545;
    border: 1px solid #dc3545;
  }

  .btn-sm {
    padding: 4px 8px;
    font-size: 12px;
  }

  @media (max-width: 768px) {
    .filters-section {
      flex-direction: column;
      align-items: stretch;
    }

    .stats-section {
      grid-template-columns: 1fr;
    }
  }

  .actions-cell {
    white-space: nowrap;
  }

  .actions-buttons {
    display: flex;
    gap: 4px;
    align-items: center;
  }

  .end-date-header {
    min-width: 120px;
    white-space: nowrap;
  }

  .student-search-results {
    margin-top: 10px;
    max-height: 200px;
    overflow-y: auto;
    border: 1px solid #ddd;
    border-radius: 4px;
  }

  .student-result-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 8px 12px;
    border-bottom: 1px solid #eee;
  }

  .student-result-item:last-child {
    border-bottom: none;
  }

  .selected-students {
    margin-top: 20px;
    padding-top: 15px;
    border-top: 1px solid #ddd;
  }

  .selected-student-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 8px 12px;
    margin-bottom: 8px;
    background: #f8f9fa;
    border-radius: 4px;
  }

  .btn-add-student {
    background: #007bff;
    color: white;
    border: 1px solid #007bff;
  }

  .btn-add-student:hover {
    background: #0056b3;
    border-color: #0056b3;
  }

  .instance-autocomplete {
    min-width: 300px;
  }

  .filter-group .v-autocomplete {
    width: 100%;
  }

  .instance-filter-group {
    align-self: flex-end;
  }

  .create-instance-button {
    align-self: flex-end;
  }
</style>
