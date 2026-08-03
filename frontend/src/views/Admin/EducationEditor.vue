<template>
  <div class="scrollable-view">
    <div class="hierarchy-wrapper">
      <div class="hierarchy-manager">
        <h3 class="title">Education Editor</h3>

        <!-- Flash message -->
        <div
          v-if="successMessage"
          class="alert alert-success alert-dismissible fade show"
          role="alert"
        >
          {{ successMessage }}
          <button type="button" class="btn-close" @click="successMessage = ''"></button>
        </div>

        <!-- All form fields -->
        <div class="form-row">
          <v-select
            v-model="selectedProgram"
            :items="programs"
            item-title="programName"
            item-value="_id"
            placeholder="Select program"
            class="styled-select"
            @update:modelValue="fetchAllCourses"
          />
        </div>

        <div class="form-row">
          <v-select
            v-model="selectedIndividualCourse"
            :items="allCourses"
            item-title="displayText"
            item-value="_id"
            placeholder="Select course"
            class="styled-select"
          />
        </div>

        <div class="form-row">
          <v-autocomplete
            v-model="selectedStudent"
            :items="filteredStudents"
            :search="searchQuery"
            item-title="name"
            item-value="_id"
            label="Select a student"
            return-object
            outlined
            :menu-props="{ closeOnContentClick: false }"
            attach
            :no-data-text="'Please write student name'"
            @update:search="searchQuery = $event"
            class="styled-select"
          />
        </div>

        <div class="form-row">
          <button class="btn btn-primary styled-button" @click="handleAddCourse">
            Add Course to Student
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
  import client from '@/api/client.js'
  import { useToast } from '@/composables/useToast.js'
  import { ref, computed, onMounted } from 'vue'

  export default {
    setup() {
      const toast = useToast()
      const students = ref([])
      const programs = ref([])
      const allCourses = ref([])
      const selectedStudent = ref(null)
      const selectedProgram = ref(null)
      const selectedIndividualCourse = ref(null)
      const searchQuery = ref('')
      const isLoading = ref(false)
      const successMessage = ref('')
      const fetchState = ref(false) // ✅ Prevent multiple fetches

      const fetchInitialData = async () => {
        if (fetchState.value) return
        fetchState.value = true

        try {
          console.log('🔍 Fetching students and programs...')
          const [studentsResponse, programsResponse] = await Promise.all([
            await client.get('/students'),
            await client.get('/all-programs'),
          ])

          students.value = studentsResponse.data
          programs.value = programsResponse.data

          console.log('✅ Students loaded:', students.value)
          console.log('✅ Programs loaded:', programs.value)
        } catch (error) {
          console.error('❌ Error fetching initial data:', error)
        } finally {
          isLoading.value = false
        }
      }

      // ✅ Fetch courses when a program is selected
      const fetchAllCourses = async () => {
        if (!selectedProgram.value) {
          console.warn('⚠️ No program selected.')
          return
        }

        try {
          console.log(`🔍 Fetching courses for Program ID: ${selectedProgram.value}`)
          const response = await client.get(
            `/program/${selectedProgram.value}/courses`
          )

          if (!response.data || !Array.isArray(response.data)) {
            console.error('❌ Invalid response structure:', response)
            toast.error('Invalid course data received.')
            return
          }

          allCourses.value = response.data.map((course) => ({
            ...course,
            displayText: `${course.courseName} (${course.courseCode || 'No Code'})`,
          }))

          console.log('✅ Courses loaded:', allCourses.value)
        } catch (error) {
          console.error('❌ Error fetching courses:', error)
          toast.error('Failed to fetch courses for the selected program.')
        }
      }

      // ✅ Handle adding a course to a student
      const handleAddCourse = async () => {
        console.log('🟢 handleAddCourse() triggered')
        if (!selectedStudent.value || !selectedStudent.value._id) {
          console.error('❌ No student selected')
          return
        }
        if (!selectedIndividualCourse.value) {
          console.error('❌ No course selected')
          return
        }

        try {
          console.log(
            `🔍 Adding course ${selectedIndividualCourse.value} to student ${selectedStudent.value._id}`
          )
          await client.post(
            `/student/${selectedStudent.value._id}/addcourse`,
            { courseId: selectedIndividualCourse.value }
          )
          console.log('✅ Course added successfully')

          // ✅ Show success message
          successMessage.value = `✅ ${selectedStudent.value.name} has been enrolled in "${
            allCourses.value.find((c) => c._id === selectedIndividualCourse.value)?.displayText ||
            'Unknown Course'
          }".`

          selectedIndividualCourse.value = null

          // ✅ Auto-hide the alert after 3 seconds
          setTimeout(() => {
            successMessage.value = ''
          }, 3000)
        } catch (error) {
          console.error('❌ Error adding course:', error)
        }
      }

      // ✅ Computed property for filtering students
      const filteredStudents = computed(() => {
        if (!searchQuery.value.trim()) {
          // Show top 5 alphabetically when no query is typed
          return students.value
            .slice()
            .sort((a, b) => a.name.localeCompare(b.name))
            .slice(0, 5)
        }
        return students.value
          .filter((student) => student.name.toLowerCase().includes(searchQuery.value.toLowerCase()))
          .slice(0, 10)
      })

      // ✅ Fetch data once on mount
      onMounted(fetchInitialData)

      return {
        students,
        programs,
        allCourses,
        selectedStudent,
        selectedProgram,
        selectedIndividualCourse,
        searchQuery,
        fetchAllCourses,
        handleAddCourse,
        successMessage,
        filteredStudents,
        fetchInitialData, // ✅ Make fetchInitialData accessible for testing
      }
    },
  }
</script>

<style scoped>
  .hierarchy-wrapper {
    display: flex;
    justify-content: center;
    align-items: flex-start;
    min-height: 100vh;
    padding-top: 60px;
  }

  .hierarchy-manager {
    text-align: center;
    width: 100%;
    max-width: 600px;
  }

  .title {
    text-align: center;
    font-weight: bold;
    margin-bottom: 40px;
  }

  .form-row {
    display: flex;
    justify-content: center;
    margin-bottom: 20px;
  }

  .styled-select,
  .styled-button {
    width: 100%;
    max-width: 500px;
  }
</style>
