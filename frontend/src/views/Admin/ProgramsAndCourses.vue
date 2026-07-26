<script setup>
  import { ref, onMounted } from 'vue'
  import client from '@/api/client.js'
  import { useToast } from '@/composables/useToast.js'

  const toast = useToast()

  const programs = ref([])
  const isLoading = ref(true)
  const error = ref(null)

  const fetchPrograms = async () => {
    try {
      const response = await client.get('/programs')
      programs.value = response.data
    } catch (err) {
      console.error('Error fetching programs:', err)
      error.value = 'Failed to load programs. Please try again.'
    } finally {
      isLoading.value = false
    }
  }

  onMounted(async () => {
    await fetchPrograms()
    window.programs = programs
  })
</script>

<template>
  <div class="scrollable-view">
    <v-container class="no-scroll">
      <v-card class="elevation-2 card-centered">
        <!-- Title Centered -->
        <v-card-title class="text-h5 title-center">Programs and Courses</v-card-title>

        <v-card-text class="table-container">
          <!-- Loading Indicator -->
          <v-progress-linear v-if="isLoading" indeterminate color="blue"></v-progress-linear>

          <!-- Error Alert -->
          <v-alert v-if="error" type="error" class="my-3">
            {{ error }}
          </v-alert>

          <!-- Table Wrapper to Ensure Full Width Without Scrolling -->
          <div class="table-wrapper">
            <v-table class="fixed-table">
              <thead>
                <tr>
                  <th class="program-name-column">Program Name</th>
                  <th class="course-name-column">Course Name</th>
                  <th class="fixed-width">Code</th>
                  <th class="fixed-width">Points</th>
                  <th class="fixed-width">Extent</th>
                </tr>
              </thead>
              <tbody>
                <template v-for="program in programs" :key="program._id">
                  <template v-if="program.programCourses.length">
                    <tr v-for="(course, index) in program.programCourses" :key="course._id">
                      <!-- Display Program Name only once per program using rowspan -->
                      <td
                        v-if="index === 0"
                        :rowspan="program.programCourses.length"
                        class="program-name-column align-top"
                      >
                        <strong>{{ program.programName }}</strong>
                      </td>
                      <td class="course-name-column">
                        {{ course.courseName || 'No coursename found' }}
                      </td>
                      <td class="fixed-width">{{ course.courseCode || 'N/A' }}</td>
                      <td class="fixed-width">{{ course.coursePoints || 'N/A' }}</td>
                      <td class="fixed-width">{{ course.courseExtent || 'N/A' }}</td>
                    </tr>
                  </template>
                </template>
              </tbody>
            </v-table>
          </div>
        </v-card-text>
      </v-card>
    </v-container>
  </div>
</template>

<style scoped>
  /* 1️⃣ Completely Remove Horizontal Scrolling */
  html,
  body {
    overflow-x: hidden !important;
    /* 🔥 Enforce no horizontal scroll */
    margin: 0;
    padding: 0;
    width: 100vw;
  }

  /* 2️⃣ Prevent Any Element from Extending Past Viewport */
  .no-scroll {
    overflow-x: hidden !important;
    max-width: 100vw;
    display: flex;
    justify-content: center;
    align-items: center;
  }

  /* 3️⃣ Center Card & Table */
  .card-centered {
    max-width: 80%;
    margin: 20px auto;
    text-align: center;
  }

  /* 4️⃣ Center Title */
  .title-center {
    text-align: center;
    padding: 16px;
  }

  /* 5️⃣ Table Container Ensuring No Overflow */
  .table-container {
    display: flex;
    justify-content: center;
    align-items: center;
    width: 100%;
  }

  /* 6️⃣ Ensure Table Doesn't Cause Scrolling */
  .table-wrapper {
    width: 100%;
    max-width: 100vw;
    overflow-x: hidden !important;
    /* 🔥 Force No Scroll */
    display: flex;
    justify-content: center;
  }

  /* 7️⃣ Fixed Table Layout */
  .fixed-table {
    width: auto;
    min-width: 100%;
    margin: 0 auto;
    table-layout: fixed;
    border-collapse: collapse;
  }

  /* 8️⃣ Program Name Column - Align to Top */
  .program-name-column {
    width: 250px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    font-weight: bold;
    vertical-align: top !important;
    /* 🔥 Align Top */
  }

  /* 9️⃣ Course Name Column */
  .course-name-column {
    width: 300px;
    white-space: wrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  /* 🔟 Fixed-Width Columns */
  .fixed-width {
    width: 100px;
    text-align: left;
  }

  /* 🔥 Ensure Programs Stack Vertically */
  .program-container {
    display: block;
    width: 100%;
    margin-bottom: 20px;
  }

  /* 🔥 Alternating Row Colors */
  tbody tr:nth-child(even) {
    background: #f9f9f9;
  }
</style>
