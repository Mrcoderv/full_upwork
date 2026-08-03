<template>
  <div class="scrollable-view">
    <v-container class="py-5">
      <!-- Title -->
      <v-card class="pa-5 text-center">
        <v-card-title class="text-h4 font-weight-bold">Programs and Course Packages</v-card-title>
      </v-card>

      <!-- Loading State -->
      <v-progress-linear
        v-if="loading"
        indeterminate
        color="primary"
        class="my-5"
      ></v-progress-linear>

      <v-container v-else>
        <v-card v-for="program in programs" :key="program._id" class="mb-6 elevation-2">
          <v-card-title class="text-h5 font-weight-bold text-primary">
            {{ program.programName }}
          </v-card-title>
          <v-card-text>
            <v-table dense class="unified-table">
              <thead>
                <tr>
                  <th class="text-left w-30">Course Package</th>
                  <th class="text-left w-10">Code</th>
                  <th class="text-left w-5">Extent</th>
                  <th class="text-left w-65">Courses</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="coursePackage in program.programCoursePackages" :key="coursePackage._id">
                  <td>
                    <strong>{{ coursePackage.coursePackageName }}</strong>
                  </td>
                  <td>{{ coursePackage.coursePackageCode }}</td>
                  <td>{{ coursePackage.coursePackageExtent }}</td>
                  <td>
                    <v-table dense class="nested-table">
                      <thead>
                        <tr>
                          <th class="text-left w-50">Course Name</th>
                          <th class="text-left w-25">Course Code</th>
                          <th class="text-left w-25">Extent</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr v-for="course in coursePackage.coursePackageCourses" :key="course._id">
                          <td>{{ course.courseName }}</td>
                          <td>{{ course.courseCode }}</td>
                          <td>{{ course.courseExtent }}</td>
                        </tr>
                      </tbody>
                    </v-table>
                  </td>
                </tr>
              </tbody>
            </v-table>
          </v-card-text>
        </v-card>
      </v-container>
    </v-container>
  </div>
</template>

<script>
  import client from '@/api/client.js'

  export default {
    data() {
      return {
        programs: [],
        loading: true,
      }
    },
    async mounted() {
      try {
        const response = await client.get('/programs')

        let fetchedPrograms = response.data

        this.programs = fetchedPrograms.filter(
          (program) =>
            Array.isArray(program.programCoursePackages) && program.programCoursePackages.length > 0
        )
      } catch (error) {
        console.error('Error fetching data:', error)
      } finally {
        this.loading = false
      }
    },
  }
</script>

<style scoped>
  /* Ensure Full-Width Consistency */
  .unified-table {
    width: 100%;
    border-collapse: collapse;
    table-layout: fixed;
  }

  .nested-table {
    width: 100%;
    table-layout: fixed;
  }

  /* Column Width Consistency */
  .w-10 {
    width: 10%;
  }
  .w-5 {
    width: 5%;
  }
  .w-30 {
    width: 30%;
  }
  .w-65 {
    width: 65%;
  }

  /* Styling for Table Headers */
  .v-table thead {
    background: #1e1e1e;
    color: black;
  }

  /* Ensure Inner Tables Fit */
  .v-table tbody td {
    vertical-align: top;
    padding: 8px;
  }
</style>
