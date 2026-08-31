<template>
  <div class="scrollable-view">
    <br />
    <h1>Lägg till elev manuellt</h1>
    <br />

    <!-- Bootstrap Flash Alert -->
    <div
      v-if="successMessage"
      class="alert alert-success alert-dismissible fade show"
      role="alert"
      style="position: fixed; top: 16px; left: 50%; transform: translateX(-50%); z-index: 2000"
    >
      {{ successMessage }}
      <button type="button" class="btn-close" @click="successMessage = ''"></button>
    </div>

    <!-- Error Alert -->
    <div
      v-if="errorMessage"
      class="alert alert-danger alert-dismissible fade show"
      role="alert"
      style="position: fixed; top: 16px; left: 50%; transform: translateX(-50%); z-index: 2000"
    >
      {{ errorMessage }}
      <button type="button" class="btn-close" @click="errorMessage = ''"></button>
    </div>

    <!-- Student Form -->
    <form @submit.prevent="submitStudentForm" @keydown.enter="handleEnterKey">
      <!-- Basic Information Section -->
      <div class="form-section">
        <h3>Grundläggande information</h3>

        <!-- Name -->
        <div class="mb-3">
          <label for="name" class="form-label">
            Namn:
            <span class="text-danger">*</span>
          </label>
          <input
            id="name"
            v-model="studentForm.name"
            type="text"
            class="form-control"
            required
            placeholder="Förnamn Efternamn"
          />
        </div>

        <!-- Personal Number (SSN) -->
        <div class="mb-3">
          <label for="personalNumber" class="form-label">
            Personnummer:
            <span class="text-danger">*</span>
          </label>
          <input
            id="personalNumber"
            v-model="studentForm.personalNumber"
            type="text"
            class="form-control"
            required
            placeholder="YYYYMMDD-XXXX"
            pattern="[0-9]{8}-[0-9]{4}"
            title="Format: YYYYMMDD-XXXX"
          />
        </div>

        <!-- Email -->
        <div class="mb-3">
          <label for="email" class="form-label">
            E-post:
            <span class="text-danger">*</span>
          </label>
          <input
            id="email"
            v-model="studentForm.email"
            type="email"
            class="form-control"
            required
            placeholder="exempel@email.com"
          />
        </div>

        <!-- Phone Numbers -->
        <div class="mb-3">
          <label class="form-label">Telefonnummer:</label>
          <div
            v-for="(phone, index) in studentForm.phoneNumbers"
            :key="index"
            class="phone-input-group"
          >
            <div class="input-group">
              <input
                v-model="phone.number"
                type="tel"
                class="form-control"
                :placeholder="`Telefon ${index + 1}`"
              />
              <button
                type="button"
                class="btn btn-outline-danger"
                :disabled="studentForm.phoneNumbers.length === 1"
                @click="removePhoneNumber(index)"
              >
                <v-icon size="16">mdi-delete</v-icon>
              </button>
            </div>
          </div>
          <button type="button" class="btn btn-outline-primary btn-sm mt-2" @click="addPhoneNumber">
            <v-icon size="16">mdi-plus</v-icon>
            Lägg till telefonnummer
          </button>
        </div>
      </div>

      <!-- Education Section -->
      <div class="form-section">
        <h3>Utbildning</h3>
        <div class="alert alert-info mb-3">
          <v-icon size="18" class="me-2">mdi-information-outline</v-icon>
          <strong>Betygssättning:</strong>
          Elever som läggs till här kommer automatiskt att visas i betygsmodulen 1 vecka innan
          kursen slutar för betygsättning.
        </div>
        <div class="alert alert-success mb-3">
          <v-icon size="18" class="me-2">mdi-check-circle-outline</v-icon>
          <strong>APL Integration:</strong>
          Elever med kurspaket kommer automatiskt att visas på APL-listan med status "Ej börjat"
          (GRAY). Enskilda kurser läggs till utan APL-status.
        </div>

        <!-- Program Selection -->
        <div class="mb-3">
          <label for="program" class="form-label">Program:</label>
          <v-select
            v-model="selectedProgram"
            :items="programs"
            item-title="programName"
            item-value="_id"
            placeholder="Välj program"
            class="styled-select"
            :loading="isLoadingPrograms"
            @update:model-value="onProgramChange"
          />
        </div>

        <!-- Course Package Selection -->
        <div v-if="selectedProgram" class="mb-3">
          <label for="coursePackage" class="form-label">Kurspaket:</label>
          <v-select
            v-model="selectedCoursePackage"
            :items="availableCoursePackages"
            item-title="coursePackageName"
            item-value="_id"
            placeholder="Välj kurspaket"
            class="styled-select"
            :loading="isLoadingCoursePackages"
            @update:model-value="onCoursePackageChange"
          />
        </div>

        <!-- Individual Course Selection -->
        <div class="mb-3">
          <label for="individualCourse" class="form-label">Enskild kurs:</label>
          <div class="alert alert-light mb-2">
          <v-icon size="18" class="me-2">mdi-information-outline</v-icon>
          <small>Du kan välja enskilda kurser utan att välja program eller kurspaket.</small>
          </div>
          <div class="course-selection-container">
            <v-select
              v-model="selectedIndividualCourse"
              :items="availableCourses"
              item-title="displayText"
              item-value="_id"
              placeholder="Välj kurs"
              class="styled-select"
              :loading="isLoadingCourses"
            />
            <button
              type="button"
              class="btn btn-primary ms-2"
              :disabled="!selectedIndividualCourse"
              @click="addIndividualCourse"
            >
              Lägg till
            </button>
          </div>
        </div>

        <!-- Added Courses Display -->
        <div v-if="addedCourses.length > 0" class="mb-3">
          <label class="form-label">Tillagda kurser:</label>
          <div class="added-courses-list">
            <!-- Use a composite key to avoid duplicate-key render errors when the same course appears multiple times (e.g., from packages) -->
            <div
              v-for="(course, idx) in addedCourses"
              :key="`${course._id || 'no-id'}-${course.parentPackageId || 'solo'}-${idx}`"
              class="course-item"
            >
              <span class="course-name">
                {{ course.displayText }}
                <span v-if="course.type === 'CoursePackage'" class="badge bg-primary ms-1">
                  Paket
                </span>
                <span v-else-if="course.parentPackageId" class="badge bg-secondary ms-1">
                  Från paket
                </span>
              </span>
            <button
              type="button"
              class="btn btn-sm btn-outline-danger ms-2"
              @click="removeCourse(course._id)"
            >
              <v-icon size="16">mdi-close</v-icon>
            </button>
          </div>
        </div>

        <!-- Package Revision Checklist -->
        <div
          v-if="selectedPackageCourses.length > 0"
          class="mb-3 package-revision"
        >
          <label class="form-label">
            Revidera kurspaket:
          </label>
          <div class="alert alert-warning mb-2 py-2">
          <v-icon size="18" class="me-2">mdi-clipboard-check-outline</v-icon>
            <small>
              Bocka ur de kurser som ska tas bort från paketet. De övriga
              kurserna skapas automatiskt med auto-beräknade datum.
            </small>
          </div>
          <div class="added-courses-list">
            <div
              v-for="course in selectedPackageCourses"
              :key="course._id"
              class="course-item"
            >
              <label class="checkbox-option package-course-check">
                <input
                  v-model="course.included"
                  type="checkbox"
                  class="form-check-input"
                />
                <span
                  class="course-name"
                  :class="{ 'excluded-course': !course.included }"
                >
                  {{ course.displayText }}
                </span>
              </label>
            </div>
          </div>
        </div>
      </div>
      </div>

      <!-- Dates Section -->
      <div class="form-section">
        <h3>Datum</h3>

        <!-- Start Date -->
        <div class="mb-3 position-relative">
          <label for="startDate" class="form-label">
            Startdatum:
            <span class="text-danger">*</span>
          </label>
          <div class="datepicker-container">
            <input
              v-model="studentForm.startDate"
              type="date"
              class="form-control"
              @change="() => { handleStartDateChange(studentForm.startDate); calculateEndDate() }"
            />
          </div>
        </div>

        <!-- Study Pace -->
        <div class="mb-3">
          <label class="form-label">
            Studietakt:
            <span class="text-danger">*</span>
          </label>
          <div class="radio-group">
            <label class="radio-option">
              <input
                v-model="studentForm.studyPace"
                type="radio"
                value="5"
                class="form-check-input"
                required
                @change="calculateEndDate"
              />
              5 v (100%)
            </label>
            <label class="radio-option">
              <input
                v-model="studentForm.studyPace"
                type="radio"
                value="10"
                class="form-check-input"
                required
                @change="calculateEndDate"
              />
              10 v (50%)
            </label>
            <label class="radio-option">
              <input
                v-model="studentForm.studyPace"
                type="radio"
                value="20"
                class="form-check-input"
                required
                @change="calculateEndDate"
              />
              20 v (25%)
            </label>
          </div>
        </div>

        <!-- End Date (calculated) -->
        <div class="mb-3">
          <label class="form-label">Beräknat slutdatum:</label>
          <div class="calculated-date">
            {{
              studentForm.endDate
                ? formatDate(studentForm.endDate)
                : 'Välj startdatum och studietakt'
            }}
          </div>
        </div>
</div>

      <!-- Location and Additional Info Section -->
      <div class="form-section">
        <h3>Plats och övrig information</h3>

        <!-- Municipality -->
        <div class="mb-3">
          <label for="municipality" class="form-label">Kommun:</label>
          <v-select
            v-model="studentForm.municipality"
            :items="municipalities"
            placeholder="Välj kommun"
            class="styled-select"
          />
        </div>

        <!-- Exam Mode (auto-set from municipality, admin can still override) -->
        <div class="mb-3">
          <label class="form-label">
            Examinationsform:
          </label>
          <div class="radio-group">
            <label class="radio-option">
              <input
                v-model="studentForm.examMode"
                type="radio"
                value="on-site"
                class="form-check-input"
              />
              Plats
            </label>
            <label class="radio-option">
              <input
                v-model="studentForm.examMode"
                type="radio"
                value="remote"
                class="form-check-input"
              />
              Distans
            </label>
          </div>
          <small class="text-muted">
            Sätts automatiskt till Distans för Upplands Bro, annars Plats. Du kan ändra värdet manuellt om det behövs.
          </small>
        </div>

        <!-- Teacher Selection -->
        <div class="mb-3">
          <label for="teacher" class="form-label">Lärare:</label>
          <v-select
            v-model="selectedTeacher"
            :items="teachersWithDisplayText"
            item-title="displayText"
            item-value="_id"
            placeholder="Välj lärare"
            class="styled-select"
            :loading="isLoadingTeachers"
          />
        </div>

        <!-- Additional Information -->
        <div class="mb-3">
          <label for="additionalInfo" class="form-label">Övrig information:</label>
          <textarea
            id="additionalInfo"
            v-model="studentForm.additionalInfo"
            class="form-control"
            rows="3"
            placeholder="Ytterligare information om eleven..."
          ></textarea>
        </div>

        <!-- Status Options -->
        <div class="mb-3">
          <label class="form-label">Status:</label>
          <div class="checkbox-group">
            <label class="checkbox-option">
              <input v-model="studentForm.dropout" type="checkbox" class="form-check-input" />
              Har hoppat av
            </label>
            <label class="checkbox-option">
              <input v-model="studentForm.attendedExam" type="checkbox" class="form-check-input" />
              Har deltagit i prov
            </label>
            <label class="checkbox-option">
              <input v-model="studentForm.paidExamFee" type="checkbox" class="form-check-input" />
              Har betalat provavgift
            </label>
          </div>
        </div>
      </div>

      <!-- Prior APL (tidigare praktik) Section -->
      <div class="form-section">
        <h3>Tidigare praktik</h3>
        <div class="checkbox-group">
          <label class="checkbox-option">
            <input
              v-model="studentForm.priorAplCompleted"
              type="checkbox"
              class="form-check-input"
            />
            Eleven har redan utfört praktik via annan skola
          </label>
        </div>
        <div v-if="studentForm.priorAplCompleted" class="mt-3">
          <label class="form-label">Intyg:</label>
          <input
            ref="aplIntygInput"
            type="file"
            class="form-control"
            accept=".pdf,.png,.jpg,.jpeg,.doc,.docx"
            @change="handleAplIntygChange"
          />
          <small class="text-muted">
            Ladda upp intyget. Dokumentet visas i elevens Filarkiv-flik.
          </small>
        </div>
      </div>

      <!-- Submit Button -->
      <div class="form-section">
        <button type="submit" class="btn btn-success btn-lg w-100" :disabled="isSubmitting">
          <v-icon v-if="isSubmitting" size="18" class="mdi-spin me-2">mdi-loading</v-icon>
          {{ isSubmitting ? 'Lägger till elev...' : 'Lägg till elev' }}
        </button>
      </div>
    </form>
  </div>
</template>

<script setup>
  import client from '@/api/client.js'
  import { ref, reactive, watch, onMounted, computed, nextTick } from 'vue'
  import { useToast } from '@/composables/useToast.js'

  const toast = useToast()

  // Reactive data
  const programs = ref([])
  const availableCourses = ref([])
  const availableCoursePackages = ref([])
  const teachers = ref([])
  const selectedProgram = ref(null)
  const selectedCoursePackage = ref(null)
  const selectedIndividualCourse = ref(null)
  const selectedTeacher = ref(null)
  const addedCourses = ref([])
  const isLoadingPrograms = ref(false)
  const isLoadingCourses = ref(false)
  const isLoadingCoursePackages = ref(false)
  const isLoadingTeachers = ref(false)
  const isSubmitting = ref(false)
  const successMessage = ref('')
  const errorMessage = ref('')
  const fetchState = ref(false)
  const courseSchedules = ref({})
  const selectedPackageCourses = ref([])
  const aplIntygFile = ref(null)

  // Form data
  const studentForm = reactive({
    name: '',
    personalNumber: '',
    email: '',
    phoneNumbers: [{ number: '' }],
    startDate: '',
    studyPace: null,
    endDate: '',
    municipality: '',
    examMode: 'on-site',
    additionalInfo: '',
    dropout: false,
    attendedExam: false,
    paidExamFee: false,
    priorAplCompleted: false,
  })

  // Options
  const textInputOptions = { enterSubmit: true, tabSubmit: true, openMenu: true }

  const municipalities = [
    'Botkyrka',
    'Danderyd',
    'Huddinge',
    'Järfälla',
    'KCNO',
    'Lidingö',
    'Norrtälje',
    'Nykvarn',
    'Privat kunder',
    'Salem',
    'Sigtuna',
    'Sollentuna',
    'Solna',
    'Sundbyberg',
    'Södertälje',
    'Täby',
    'Upplands Bro',
    'Upplands Väsby',
    'Vallentuna',
    'Vaxholm',
    'Växjö',
    'Österåker',
  ]

  // Computed properties
  const teachersWithDisplayText = computed(() => {
    return teachers.value.map((teacher) => ({
      ...teacher,
      displayText: `${teacher.userId?.username || 'Okänd'} (${teacher.subject || 'Övrigt'})`,
    }))
  })

  // Methods
  const fetchInitialData = async () => {
    if (fetchState.value) return
    fetchState.value = true

    try {
      await Promise.all([
        fetchPrograms(),
        fetchTeachers(),
        fetchAllCourses(), // Load all courses initially for individual selection
      ])
    } catch (error) {
      console.error('Error fetching initial data:', error)
      errorMessage.value = 'Kunde inte ladda grunddata. Försök igen.'
    } finally {
      isLoadingPrograms.value = false
      isLoadingTeachers.value = false
      isLoadingCourses.value = false
    }
  }

  const fetchPrograms = async () => {
    try {
      isLoadingPrograms.value = true
      const res = await client.get('/programs')
      programs.value = res.data
    } catch (error) {
      console.error('Error fetching programs:', error)
      errorMessage.value = 'Kunde inte ladda program.'
    }
  }

  const fetchTeachers = async () => {
    try {
      isLoadingTeachers.value = true
      const res = await client.get('/teachers')
      teachers.value = res.data.filter((t) => t.userId && t.userId.username)
    } catch (error) {
      console.error('Error fetching teachers:', error)
      errorMessage.value = 'Kunde inte ladda lärare.'
    }
  }

  const fetchCoursesForProgram = async (programId) => {
    if (!programId) return

    try {
      isLoadingCourses.value = true
      const res = await client.get(
        `/program/${programId}/courses`
      )
      availableCourses.value = uniqueById(res.data).map((c) => ({
        ...c,
        displayText: `${c.courseName} (${c.courseCode || 'Ingen kod'})`,
      }))
    } catch (error) {
      console.error('Error fetching courses:', error)
      errorMessage.value = 'Kunde inte ladda kurser för programmet.'
    } finally {
      isLoadingCourses.value = false
    }
  }

  const fetchAllCourses = async () => {
    try {
      isLoadingCourses.value = true
      const res = await client.get('/courses')
      availableCourses.value = uniqueById(res.data).map((c) => ({
        ...c,
        displayText: `${c.courseName} (${c.courseCode || 'Ingen kod'})`,
      }))
    } catch (error) {
      console.error('Error fetching all courses:', error)
      errorMessage.value = 'Kunde inte ladda kurser.'
    } finally {
      isLoadingCourses.value = false
    }
  }

  const fetchCoursePackagesForProgram = async (programId) => {
    if (!programId) return

    try {
      isLoadingCoursePackages.value = true
      const program = programs.value.find((p) => p._id === programId)
      if (program && program.programCoursePackages) {
        availableCoursePackages.value = uniqueById(program.programCoursePackages).map((pkg) => ({
          ...pkg,
          displayText: `${pkg.coursePackageName} (${pkg.coursePackageCode || 'Ingen kod'})`,
        }))
      }
    } catch (error) {
      console.error('Error fetching course packages:', error)
      errorMessage.value = 'Kunde inte ladda kurspaket för programmet.'
    } finally {
      isLoadingCoursePackages.value = false
    }
  }

  const onProgramChange = (programId) => {
    selectedCoursePackage.value = null
    selectedIndividualCourse.value = null
    addedCourses.value = []
    selectedPackageCourses.value = []

    if (programId) {
      fetchCoursesForProgram(programId)
      fetchCoursePackagesForProgram(programId)
    } else {
      // When no program is selected, fetch all available courses for individual selection
      fetchAllCourses()
      availableCoursePackages.value = []
    }
  }

  const onCoursePackageChange = (packageId) => {
    if (packageId) {
      // Clear individual courses when package is selected
      selectedIndividualCourse.value = null
      addedCourses.value = []
      selectedPackageCourses.value = []

      const selectedPackage = availableCoursePackages.value.find((pkg) => pkg._id === packageId)
      if (selectedPackage) {
        // Add the course package itself with its courses stored for removal logic
        addedCourses.value.push({
          _id: selectedPackage._id,
          courseName: selectedPackage.coursePackageName,
          courseCode: selectedPackage.coursePackageCode,
          displayText: `${selectedPackage.coursePackageName} (${
            selectedPackage.coursePackageCode || 'Ingen kod'
          })`,
          type: 'CoursePackage',
          coursePackageCourses: selectedPackage.coursePackageCourses, // Store for removal logic
        })

        // Add all individual courses from the package
        const individualCourses = uniqueById(selectedPackage.coursePackageCourses).map((course) => ({
          ...course,
          displayText: `${course.courseName} (${course.courseCode || 'Ingen kod'})`,
          type: 'Course',
          parentPackageId: selectedPackage._id, // Track which package this course belongs to
        }))

        addedCourses.value.push(...individualCourses)

        // Build the revision checklist (all included by default; admin can uncheck to remove)
        selectedPackageCourses.value = individualCourses.map((course) => ({
          _id: course._id,
          displayText: course.displayText,
          included: true,
        }))

        successMessage.value = `✅ Kurspaket "${selectedPackage.coursePackageName}" har lagts till med ${selectedPackage.coursePackageCourses.length} individuella kurser.`
        setTimeout(() => {
          successMessage.value = ''
        }, 5000)

        // Recalculate end date based on added courses
        calculateEndDate()
      }
    }
  }

  /**
   * Deduplicate array items by their _id (or id) to avoid Vue key collisions.
   */
  const uniqueById = (items) => {
    const seen = new Set()
    return items.filter((item) => {
      const id = item?._id || item?.id
      if (!id) return true
      if (seen.has(id)) return false
      seen.add(id)
      return true
    })
  }

  const addIndividualCourse = () => {
    if (!selectedIndividualCourse.value) {
      errorMessage.value = 'Välj en kurs först.'
      return
    }

    const course = availableCourses.value.find((c) => c._id === selectedIndividualCourse.value)
    if (!course) {
      errorMessage.value = 'Kursinformation hittades inte.'
      return
    }

    // Check if course is already added
    if (addedCourses.value.some((c) => c._id === course._id)) {
      errorMessage.value = 'Kursen är redan tillagd.'
      return
    }

    addedCourses.value.push({
      ...course,
      type: 'Course',
    })

    successMessage.value = `✅ Kursen "${course.displayText}" har lagts till.`
    setTimeout(() => {
      successMessage.value = ''
    }, 3000)

    selectedIndividualCourse.value = null

    // Recalculate as list changed
    calculateEndDate()
  }

  const removeCourse = (courseId) => {
    const courseToRemove = addedCourses.value.find((course) => course._id === courseId)

    if (courseToRemove && courseToRemove.type === 'CoursePackage') {
      // If removing a course package, remove both the package and all its individual courses
      const packageCourses = courseToRemove.coursePackageCourses || []
      const packageCourseIds = packageCourses.map((course) => course._id)

      addedCourses.value = addedCourses.value.filter(
        (course) => course._id !== courseId && !packageCourseIds.includes(course._id)
      )
      selectedPackageCourses.value = []
    } else if (courseToRemove && courseToRemove.parentPackageId) {
      // If removing an individual course that belongs to a package, remove the entire package
      const packageId = courseToRemove.parentPackageId
      const packageEntry = addedCourses.value.find(
        (course) => course._id === packageId && course.type === 'CoursePackage'
      )
      const packageCourseIds = packageEntry?.coursePackageCourses?.map((course) => course._id) || []

      addedCourses.value = addedCourses.value.filter(
        (course) => course._id !== packageId && !packageCourseIds.includes(course._id)
      )
      selectedPackageCourses.value = []
    } else {
      // If removing an individual course that doesn't belong to a package, just remove that course
      addedCourses.value = addedCourses.value.filter((course) => course._id !== courseId)
    }
    // Recalculate as list changed
    calculateEndDate()
  }

  const addPhoneNumber = () => {
    studentForm.phoneNumbers.push({ number: '' })
  }

  const removePhoneNumber = (index) => {
    if (studentForm.phoneNumbers.length > 1) {
      studentForm.phoneNumbers.splice(index, 1)
    }
  }

  const calculateEndDate = () => {
    courseSchedules.value = {}
    if (!studentForm.startDate || !studentForm.studyPace) {
      studentForm.endDate = ''
      return
    }

    const durationDays = parseInt(studentForm.studyPace) * 7
    // Include ALL courses (both standalone and from packages) for scheduling
    // This ensures the date range calculation includes all courses
    const courseEntries = addedCourses.value.filter((c) => c.type === 'Course')

    // If no specific courses selected yet, fall back to single span
    if (courseEntries.length === 0) {
      const baseStart = new Date(studentForm.startDate)
      const baseEnd = new Date(baseStart)
      baseEnd.setDate(baseStart.getDate() + durationDays - 3)
      studentForm.endDate = baseEnd.toISOString()
      return
    }

    let pointer = new Date(studentForm.startDate)
    let lastEnd = null
    for (const course of courseEntries) {
      const start = new Date(pointer)
      const end = new Date(start)
      end.setDate(start.getDate() + durationDays - 3)

      courseSchedules.value[course._id] = {
        startDate: start.toISOString(),
        endDate: end.toISOString(),
      }

      // Advance pointer to the next day after this course ends
      pointer = new Date(end)
      pointer.setDate(pointer.getDate() + 1)
      lastEnd = end
    }

    studentForm.endDate = lastEnd ? lastEnd.toISOString() : ''
  }

  const formatDate = (dateString) => {
    if (!dateString) return ''
    return new Date(dateString).toLocaleDateString('sv-SE')
  }

  const formatStartDate = (date) => {
    if (!date) return ''
    const d = new Date(date)
    const yyyy = d.getFullYear()
    const mm = String(d.getMonth() + 1).padStart(2, '0')
    const dd = String(d.getDate()).padStart(2, '0')
    return `${yyyy}-${mm}-${dd}`
  }

  const handleStartDateChange = (val) => {
    if (!val) {
      studentForm.startDate = ''
      return
    }
    if (typeof val === 'string') {
      // Already formatted by model-type; strip any time part just in case
      studentForm.startDate = val.split('T')[0]
      return
    }
    const d = new Date(val)
    // Normalize to yyyy-MM-dd (local)
    const yyyy = d.getFullYear()
    const mm = String(d.getMonth() + 1).padStart(2, '0')
    const dd = String(d.getDate()).padStart(2, '0')
    studentForm.startDate = `${yyyy}-${mm}-${dd}`
  }

  const normalizeDateOnly = (val) => {
    if (!val) return ''
    if (typeof val === 'string') return val.split('T')[0]
    const d = new Date(val)
    const yyyy = d.getFullYear()
    const mm = String(d.getMonth() + 1).padStart(2, '0')
    const dd = String(d.getDate()).padStart(2, '0')
    return `${yyyy}-${mm}-${dd}`
  }

  const handleEnterKey = (e) => {
    if (!e.target.closest('.dp__input')) e.preventDefault()
  }

  const handleAplIntygChange = (e) => {
    aplIntygFile.value = e.target.files?.[0] || null
  }

  const getDefaultExamMode = (municipality) => {
    const normalized = municipality
      ? String(municipality)
          .trim()
          .toLowerCase()
          .replace(/[\s-]+/g, '')
      : ''
    return normalized === 'upplandsbro' ? 'remote' : 'on-site'
  }

  const resetForm = () => {
    Object.assign(studentForm, {
      name: '',
      personalNumber: '',
      email: '',
      phoneNumbers: [{ number: '' }],
      startDate: '',
      studyPace: null,
      endDate: '',
      municipality: '',
      examMode: 'on-site',
      additionalInfo: '',
      dropout: false,
      attendedExam: false,
      paidExamFee: false,
      priorAplCompleted: false,
    })

    selectedProgram.value = null
    selectedCoursePackage.value = null
    selectedIndividualCourse.value = null
    selectedTeacher.value = null
    addedCourses.value = []
    selectedPackageCourses.value = []
    aplIntygFile.value = null
    availableCourses.value = []
    availableCoursePackages.value = []
  }

  const submitStudentForm = async () => {
    // Validation
    if (
      !studentForm.name ||
      !studentForm.personalNumber ||
      !studentForm.email ||
      !studentForm.startDate ||
      !studentForm.studyPace
    ) {
      errorMessage.value = 'Vänligen fyll i alla obligatoriska fält!'
      return
    }

    if (addedCourses.value.length === 0) {
      errorMessage.value = 'Välj minst en kurs eller kurspaket!'
      return
    }

    isSubmitting.value = true
    errorMessage.value = ''

    try {
      // Force date-only string for startDate and endDate before building schedules
      studentForm.startDate = normalizeDateOnly(studentForm.startDate)
      studentForm.endDate = normalizeDateOnly(studentForm.endDate)

      // Prepare phone numbers (filter out empty ones)
      const phoneNumbers = studentForm.phoneNumbers
        .map((phone) => phone.number.trim())
        .filter((number) => number.length > 0)

      // Prepare education entries with per-course dates
      // IMPORTANT: Exclude courses that belong to a package (parentPackageId) to avoid duplicates
      // The backend will expand CoursePackage entries into individual course enrollments
      const courseEntries = addedCourses.value.filter(
        (c) => c.type === 'Course' && !c.parentPackageId
      )
      const packageEntries = addedCourses.value.filter((c) => c.type === 'CoursePackage')

      // Ensure schedules are up-to-date
      calculateEndDate()

      const education = []
      // Add individual course entries with their scheduled dates (only standalone courses, not from packages)
      for (const c of courseEntries) {
        const sched = courseSchedules.value[c._id]
        education.push({
          type: 'Course',
          refId: c._id,
          name: c.courseCode || c.courseName,
          startDate: sched?.startDate || studentForm.startDate,
          endDate: sched?.endDate || studentForm.endDate,
        })
      }
      // For course packages, calculate envelope from ALL courses (including package courses) for date range
      // But only send the package entry - backend will expand it
      if (packageEntries.length > 0) {
        // Get all course schedules (including package courses) for date range calculation
        const allCourseSchedules = Object.values(courseSchedules.value)
        const times = allCourseSchedules
          .map((s) => [new Date(s.startDate).getTime(), new Date(s.endDate).getTime()])
          .flat()
          .filter((n) => !isNaN(n))
        const minStart = times.length > 0 ? Math.min(...times) : null
        const maxEnd = times.length > 0 ? Math.max(...times) : null
        
        for (const pkg of packageEntries) {
          const excludedCourseIds = selectedPackageCourses.value
            .filter((course) => !course.included)
            .map((course) => course._id)
          education.push({
            type: 'CoursePackage',
            refId: pkg._id,
            name: pkg.coursePackageCode || pkg.coursePackageName || pkg.courseName,
            startDate: isFinite(minStart) ? new Date(minStart).toISOString() : studentForm.startDate,
            endDate: isFinite(maxEnd) ? new Date(maxEnd).toISOString() : studentForm.endDate,
            excludedCourseIds,
          })
        }
      }

      // Deduplicate education entries to avoid doubles (type + refId + start + end)
      const dedupedEducation = []
      const seenEdu = new Set()
      for (const edu of education) {
        const key = [
          edu.type || '',
          edu.refId || '',
          normalizeDateOnly(edu.startDate),
          normalizeDateOnly(edu.endDate),
        ].join('|')
        if (seenEdu.has(key)) continue
        seenEdu.add(key)
        dedupedEducation.push({
          ...edu,
          startDate: normalizeDateOnly(edu.startDate),
          endDate: normalizeDateOnly(edu.endDate),
        })
      }

      const payload = {
        name: studentForm.name.trim(),
        personalNumber: studentForm.personalNumber.trim(),
        email: studentForm.email.trim(),
        phone: phoneNumbers.length > 0 ? phoneNumbers[0] : '', // Primary phone
        phoneNumbers: phoneNumbers, // All phone numbers
        startDate: normalizeDateOnly(studentForm.startDate),
        endDate: normalizeDateOnly(studentForm.endDate),
        municipality: studentForm.municipality ? { type: studentForm.municipality } : undefined,
        examMode: studentForm.examMode,
        additionalInfo: studentForm.additionalInfo.trim(),
        teacher: selectedTeacher.value
          ? teachers.value.find((t) => t._id === selectedTeacher.value)?.userId?.username
          : '',
        teacherId: selectedTeacher.value || undefined,
        dropout: studentForm.dropout,
        attendedExam: studentForm.attendedExam,
        paidExamFee: studentForm.paidExamFee,
        priorAplCompleted: studentForm.priorAplCompleted,
        program: selectedProgram.value,
        education: dedupedEducation,
      }

      const response = await client.post('/student', payload)

      // Re-registration: the backend found an existing student (by personalNumber
      // or email) and auto-filled their record with the submitted details.
      const reRegistered = response.data.alreadyExists === true

      console.log(
        reRegistered
          ? '✅ Student re-registered (existing record auto-filled):'
          : '✅ Student created successfully:',
        response.data
      )
      console.log('📋 Education entries:', response.data.education)

      // Upload prior-APL intyg after the student exists, then link it to the
      // student so the certificate is traceable in the Filarkiv-fliken.
      if (studentForm.priorAplCompleted && aplIntygFile.value) {
        try {
          const formData = new FormData()
          formData.append('file', aplIntygFile.value)
          formData.append('studentId', response.data._id)
          formData.append('type', 'GENERAL')
          const docResponse = await client.post('/documents/upload', formData, {
            headers: { 'Content-Type': 'multipart/form-data' },
          })
          await client.put(`/student/${response.data._id}`, {
            priorAplIntygDocId: docResponse.data._id,
          })
          console.log('📄 Prior-APL intyg uploaded:', docResponse.data)
        } catch (uploadError) {
          console.error('❌ Prior-APL intyg upload failed:', uploadError)
          errorMessage.value =
            'Eleven skapades, men intyget kunde inte laddas upp. Ladda upp det i Filarkiv-fliken istället.'
        }
      }

      successMessage.value = reRegistered
        ? '✅ Eleven fanns redan — uppgifterna är uppdaterade och nya kurser har registrerats.'
        : '✅ Eleven har lagts till framgångsrikt!'

      // Re-enable button immediately after successful completion
      isSubmitting.value = false

      // Reset form after Vue has finished processing updates to avoid rendering errors
      await nextTick()
      resetForm()

      // Keep user on the page; auto-hide message after a short delay
      setTimeout(() => {
        successMessage.value = ''
      }, 2500)
    } catch (error) {
      console.error('❌ Backend error:', error)
      errorMessage.value =
        error.message || 'Kunde inte lägga till elev. Något gick fel. Försök igen.'
    } finally {
      // Ensure not stuck loading on any exit path
      isSubmitting.value = false
    }
  }

  // Lifecycle
  onMounted(fetchInitialData)

  // Keep end-date in sync when base inputs change
  watch(
    () => [studentForm.startDate, studentForm.studyPace],
    () => calculateEndDate(),
    { deep: false }
  )
  watch(
    () => addedCourses.value.length,
    () => calculateEndDate()
  )

  // Auto-set exam mode (plats/distans) from the selected municipality;
  // the admin can still override the value manually afterwards.
  watch(
    () => studentForm.municipality,
    (municipality) => {
      studentForm.examMode = getDefaultExamMode(municipality)
    }
  )
</script>

<style scoped>
  .scrollable-view {
    max-width: 800px;
    margin: 0 auto;
    padding: 20px;
  }

  .form-section {
    background: #f8f9fa;
    border-radius: 8px;
    padding: 20px;
    margin-bottom: 20px;
    border-left: 4px solid #007dc3;
  }

  .form-section h3 {
    color: #007dc3;
    margin-bottom: 20px;
    font-size: 1.2rem;
    font-weight: 600;
  }

  .form-control,
  .form-control-datepicker {
    max-width: 100%;
    width: 100%;
  }

  .datepicker-container {
    position: relative;
    display: flex;
    align-items: center;
    width: 100%;
  }

  .calendar-icon {
    position: absolute;
    right: 10px;
    cursor: pointer;
    font-size: 1.2rem;
    z-index: 10;
  }

  .radio-group {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .radio-option {
    display: flex;
    align-items: center;
    gap: 8px;
    cursor: pointer;
  }

  .checkbox-group {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .checkbox-option {
    display: flex;
    align-items: center;
    gap: 8px;
    cursor: pointer;
  }

  .calculated-date {
    padding: 8px 12px;
    background: #e9ecef;
    border-radius: 4px;
    font-weight: 500;
    color: #495057;
  }

  .phone-input-group {
    margin-bottom: 8px;
  }

  .course-selection-container {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .added-courses-list {
    background: #fff;
    border: 1px solid #dee2e6;
    border-radius: 4px;
    padding: 12px;
  }

  .course-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px 0;
    border-bottom: 1px solid #f1f3f4;
  }

  .course-item:last-child {
    border-bottom: none;
  }

  .course-name {
    font-weight: 500;
    color: #495057;
  }

  .excluded-course {
    text-decoration: line-through;
    color: #dc3545;
    opacity: 0.7;
  }

  .package-revision {
    margin-top: 12px;
  }

  .package-course-check {
    width: 100%;
    cursor: pointer;
  }

  .badge {
    font-size: 0.75em;
    padding: 0.25em 0.5em;
    border-radius: 0.375rem;
  }

  .bg-primary {
    background-color: #007dc3;
    color: white;
  }

  .bg-secondary {
    background-color: #6c757d;
    color: white;
  }

  .styled-select {
    width: 100%;
  }

  .text-danger {
    color: #dc3545;
  }

  .btn-success {
    background-color: #28a745;
    border-color: #28a745;
  }

  .btn-success:hover {
    background-color: #218838;
    border-color: #1e7e34;
  }

  .alert {
    max-width: 500px;
    margin: 0 auto;
  }

  .alert-info {
    background-color: #d1ecf1;
    border-color: #bee5eb;
    color: #0c5460;
  }

  .alert-info .fas {
    color: #0c5460;
  }

  .alert-success {
    background-color: #d4edda;
    border-color: #c3e6cb;
    color: #155724;
  }

  .alert-success .fas {
    color: #155724;
  }


  @media (max-width: 768px) {
    .scrollable-view {
      padding: 10px;
    }

    .form-section {
      padding: 15px;
    }

    .course-selection-container {
      flex-direction: column;
      align-items: stretch;
    }

    .course-selection-container .btn {
      margin-top: 8px;
    }
  }
</style>
