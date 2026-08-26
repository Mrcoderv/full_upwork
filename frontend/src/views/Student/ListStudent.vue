<template>
  <div class="scrollable-view">
    <v-container>
      <v-form>
        <!-- Dropdown for selecting a student -->
        <v-select
          v-model="selectedStudent"
          :items="students"
          item-title="namn"
          label="Select a student"
          return-object
          outlined
        />

        <v-row v-if="selectedStudent">
          <v-col cols="12" md="6">
            <v-text-field v-model="selectedStudent.namn" label="Full Name" readonly />
          </v-col>
          <v-col cols="12" md="6">
            <v-text-field v-model="selectedStudent.personnummer" label="Personal Number" readonly />
          </v-col>
        </v-row>
      </v-form>
    </v-container>
  </div>
</template>

<script>
  import { ref, onMounted } from 'vue'
  import client from '@/api/client.js'

  export default {
    name: 'ListStudent',
    setup() {
      const students = ref([])
      const selectedStudent = ref(null)

      onMounted(async () => {
        try {
          const { data } = await client.get('/student')
          students.value = data
        } catch (error) {
        }
      })

      return { students, selectedStudent }
    },
  }
</script>

<style scoped>
  /* Custom styles (if necessary) */
</style>
