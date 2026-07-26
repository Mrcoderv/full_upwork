<template>
  <div class="scrollable-view">
    <br />
    <h1>Lägg till ny elev</h1>
    <br />

    <!-- Bootstrap Flash Alert -->
    <div
      v-if="successMessage"
      class="alert alert-success alert-dismissible fade show"
      role="alert"
      style="position: absolute; top: 60px; left: 50%; transform: translateX(-50%); z-index: 1050"
    >
      {{ successMessage }}
      <button type="button" class="btn-close" @click="successMessage = ''"></button>
    </div>

    <!-- Kurs Form -->
    <form @submit.prevent="submitKursForm" @keydown.enter="handleEnterKey">
      <!-- Name -->
      <div class="mb-3">
        <label for="name" class="form-label">Namn:</label>
        <input type="text" id="name" v-model="studentForm.namn" class="form-control" required />
      </div>

      <!-- Personnummer -->
      <div class="mb-3">
        <label for="personnummer" class="form-label">Personnummer:</label>
        <input
          type="text"
          id="personnummer"
          v-model="studentForm.personnummer"
          class="form-control"
          required
        />
      </div>
      <br />

      <div>
        <p>Välj utbildning:</p>
        <!-- Program Selection -->
        <div class="mt-3 ml-3 mr-3 mb-3">
          <v-select
            v-model="selectedProgram"
            :items="programs"
            item-title="programName"
            item-value="_id"
            placeholder="Select program"
            @update:modelValue="fetchAllCourses"
            class="styled-select"
          />

          <!-- Add Individual Course to Student -->
          <v-select
            v-model="selectedIndividualCourse"
            :items="allCourses"
            item-title="displayText"
            item-value="_id"
            placeholder="Select course"
            class="styled-select"
          />

          <button
            class="btn"
            style="background-color: #007dc3ff; color: white"
            type="button"
            @click="handleAddCourse"
          >
            Lägg till
          </button>
        </div>
      </div>

      <br />
      <!-- Show Added Courses -->
      <div class="mb-3">
        <label class="form-label">Tillagda kurser:</label>
        <ul v-if="addedCourses.length">
          <li v-for="course in addedCourses" :key="course._id">
            <strong>{{ course.displayText }}</strong>
          </li>
        </ul>
        <p v-else class="font-weight-bold">Inga kurser tillagda ännu.</p>
      </div>

      <!-- Startdatum -->
      <div class="mb-3 position-relative">
        <label for="startDatum" class="form-label">Startdatum:</label>
        <div class="datepicker-container">
          <Datepicker
            v-model="studentForm.startDatum"
            :text-input="textInputOptions"
            :format="'yyyy-MM-dd'"
            class="form-control-datepicker"
            placeholder="yyyy-mm-dd"
            :teleport="false"
            :position="'bottom-start'"
            :enable-time-picker="false"
            ref="startDatepickerRef"
            @keydown.enter.prevent="handleDatepickerEnter"
            @input="calculateEndDate"
          />
          <span class="calendar-icon" @click="openDatepicker('startDatepickerRef')">🗓️</span>
        </div>
      </div>

      <!-- Duration -->
      <label class="form-label">Studietakt:</label>
      <div class="mb-3">
        <label>
          <input
            type="radio"
            value="5"
            v-model="studentForm.duration"
            class="form-check-input"
            @change="calculateEndDate"
            required
          />
          5 v (100%)
        </label>
        <br />
        <label>
          <input
            type="radio"
            value="10"
            v-model="studentForm.duration"
            class="form-check-input"
            @change="calculateEndDate"
            required
          />
          10 v (50%)
        </label>
        <br />
        <label>
          <input
            type="radio"
            value="20"
            v-model="studentForm.duration"
            class="form-check-input"
            @change="calculateEndDate"
            required
          />
          20 v (25%)
        </label>
      </div>

      <!-- End Date -->
      <div class="mb-3">
        <p>Slutdatum: {{ studentForm.slutDatum.split('T')[0] }}</p>
      </div>

      <!-- Municipality -->
      <div class="mb-3">
        <label for="kommun" class="form-label">Kommun:</label>
        <v-select
          v-model="studentForm.kommun"
          :items="municipalities"
          placeholder="Välj kommun"
          class="styled-select"
          required
        />
      </div>

      <!-- Phone Number -->
      <div class="mb-3">
        <label for="telefon" class="form-label">Tel:</label>
        <input
          type="text"
          id="telefon"
          v-model="studentForm.telefon"
          class="form-control"
          required
        />
      </div>

      <!-- Email -->
      <div class="mb-3">
        <label for="mail" class="form-label">Email:</label>
        <input type="email" id="mail" v-model="studentForm.mail" class="form-control" required />
      </div>

      <!-- Exam -->
      <div class="mb-3">
        <label for="prov" class="form-label">Prov:</label>
        <input type="text" id="prov" v-model="studentForm.prov" class="form-control" />
      </div>

      <!-- Other Details -->
      <div class="mb-3">
        <label for="ovrigt" class="form-label">Annat:</label>
        <textarea id="ovrigt" v-model="studentForm.ovrigt" class="form-control"></textarea>
      </div>

      <!-- Teacher -->
      <div class="mb-3">
        <label for="teacher" class="form-label">Lärare:</label>
        <input type="text" id="teacher" v-model="studentForm.teacher" class="form-control" />
      </div>

      <!-- Submit Button -->
      <button type="submit" class="btn btn-primary" style="width: 100%; background-color: green">
        Lägg till elev
      </button>
    </form>
  </div>
</template>

<script setup>
  import client from '@/api/client.js'
  import { VueDatePicker as Datepicker } from '@vuepic/vue-datepicker'
  import '@vuepic/vue-datepicker/dist/main.css'
  import { ref, reactive, watch, onMounted } from 'vue'
  import { useToast } from '@/composables/useToast.js'

  const toast = useToast()

  const programs = ref([])
  const allCourses = ref([])
  const selectedProgram = ref(null)
  const selectedIndividualCourse = ref(null)
  const educationCourses = ref([])
  const addedCourses = ref([])
  const isLoading = ref(false)
  const successMessage = ref('')
  const fetchState = ref(false)

  const startDatepickerRef = ref(null)

  const studentForm = reactive({
    namn: '',
    personnummer: '',
    startDatum: '',
    duration: null,
    slutDatum: '',
    kommun: '',
    telefon: '',
    mail: '',
    prov: '',
    ovrigt: '',
    slutprovDatum: '',
    dropout: false,
    teacher: '',
  })

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

  const fetchInitialData = async () => {
    if (fetchState.value) return
    fetchState.value = true
    try {
      const res = await client.get('/all-programs')
      programs.value = res.data
    } catch (e) {
      console.error('Error fetching programs:', e)
    } finally {
      isLoading.value = false
    }
  }

  const fetchAllCourses = async () => {
    if (!selectedProgram.value) return
    try {
      const res = await client.get(
        `/program/${selectedProgram.value}/courses`
      )
      allCourses.value = res.data.map((c) => ({
        ...c,
        displayText: `${c.courseName} (${c.courseCode || 'No Code'})`,
      }))
    } catch (e) {
      console.error('Error fetching courses:', e)
    }
  }

  function handleAddCourse() {
    if (!selectedIndividualCourse.value) return toast.error('Välj en kurs först.')
    if (educationCourses.value.includes(selectedIndividualCourse.value))
      return toast.error('Kursen är redan tillagd.')

    const course = allCourses.value.find((c) => c._id === selectedIndividualCourse.value)
    if (!course) return toast.error('Kursinformation hittades inte.')

    educationCourses.value.push(course._id)
    addedCourses.value.push(course)

    successMessage.value = `✅ Kursen "${course.displayText}" har lagts till.`
    setTimeout(() => {
      successMessage.value = ''
    }, 3000)

    selectedIndividualCourse.value = null
  }

  async function submitKursForm() {
    if (
      !studentForm.namn ||
      !studentForm.personnummer ||
      !studentForm.startDatum ||
      !studentForm.mail
    ) {
      return toast.error('Please fill in all required fields!')
    }
    const payload = {
      name: studentForm.namn,
      personalNumber: studentForm.personnummer,
      email: studentForm.mail,
      startDate: studentForm.startDatum,
      endDate: studentForm.slutDatum,
      finalExamDate: studentForm.slutprovDatum,
      municipality: { type: studentForm.kommun },
      phone: studentForm.telefon,
      exam: studentForm.prov,
      additionalInfo: studentForm.ovrigt,
      teacher: studentForm.teacher,
      dropout: studentForm.dropout || false,
      program: selectedProgram.value,
      education: addedCourses.value.map((course) => ({
        type: 'Course',
        refId: course._id,
        name: course.courseName,
      })),
    }
    try {
      await client.post('/student', payload)
      toast.success('Eleven blev tillagd!')
      Object.assign(studentForm, {
        namn: '',
        personnummer: '',
        startDatum: '',
        duration: null,
        slutDatum: '',
        kommun: '',
        telefon: '',
        mail: '',
        prov: '',
        ovrigt: '',
        slutprovDatum: '',
        dropout: false,
        teacher: '',
      })

      educationCourses.value = []
      addedCourses.value = []
    } catch (error) {
      console.error('❌ Backend error:', error)
      toast.error('Kunde inte lägga till Elev. Något gick fel. Försök igen.')
    }
  }

  function calculateEndDate() {
    if (!studentForm.startDatum || isNaN(new Date(studentForm.startDatum).getTime())) {
      studentForm.slutDatum = ''
      return
    }
    if (!studentForm.duration) return
    const startDate = new Date(studentForm.startDatum)
    const durationDays = studentForm.duration * 7
    const endDate = new Date(startDate)
    endDate.setDate(startDate.getDate() + durationDays - 3)
    studentForm.slutDatum = endDate.toISOString()
  }

  function openDatepicker(refName) {
    if (refName === 'startDatepickerRef' && startDatepickerRef.value) {
      startDatepickerRef.value.openMenu()
    }
  }

  function handleEnterKey(e) {
    if (!e.target.closest('.dp__input')) e.preventDefault()
  }

  function handleDatepickerEnter(e) {
    e.stopPropagation()
    e.preventDefault()
  }

  onMounted(fetchInitialData)
</script>

<style scoped>
  form {
    max-width: 400px;
    margin: 0 auto;
  }
  .form-control,
  .form-control-datepicker {
    max-width: 400px;
    width: 100%;
  }
  .datepicker-container {
    position: relative;
    display: flex;
    align-items: center;
    width: 100%;
    max-width: 400px;
  }
  .calendar-icon {
    position: absolute;
    right: 10px;
    cursor: pointer;
    font-size: 1.2rem;
  }
</style>
