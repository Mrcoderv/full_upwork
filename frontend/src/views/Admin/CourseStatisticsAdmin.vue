<template>
  <div class="scrollable-view">
    <v-container class="py-5">
      <v-card class="pa-5 mb-5">
        <v-card-title class="text-h4 font-weight-bold pa-0">Kursstatistik</v-card-title>
        <p class="text-body-2 text-grey mt-2">
          Översiktlig statistik över kursinstanser och betyg.
        </p>
      </v-card>

      <v-card class="pa-5 mb-5">
        <div class="d-flex align-center justify-space-between">
          <v-card-title class="text-h5 pa-0">Statistik</v-card-title>
          <v-btn size="small" variant="tonal" prepend-icon="mdi-refresh" :loading="statsLoading" @click="loadStats">
            Ladda
          </v-btn>
        </div>

        <v-progress-linear v-if="statsLoading" indeterminate color="primary" class="my-4" />
        <v-alert v-else-if="statsError" type="error" class="my-3">{{ statsError }}</v-alert>

        <v-table v-else-if="stats.length > 0" dense class="mt-3">
          <thead>
            <tr>
              <th class="text-left">Kurs</th>
              <th class="text-left">Kurskod</th>
              <th class="text-left">Instanser</th>
              <th class="text-left">Totalt antal elever</th>
              <th class="text-left">Genomsnittsbetyg</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(row, idx) in stats" :key="idx">
              <td>{{ row.courseName || '–' }}</td>
              <td>{{ row.courseCode || '–' }}</td>
              <td>{{ row.instanceCount ?? '–' }}</td>
              <td>{{ row.totalStudents ?? '–' }}</td>
              <td>{{ row.averageGrade ?? '–' }}</td>
            </tr>
          </tbody>
        </v-table>

        <v-alert v-else-if="!statsLoading" type="info" class="my-3">Inga statistikdata tillgängliga.</v-alert>
      </v-card>
    </v-container>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import client from '@/api/client.js'
import { useToast } from '@/composables/useToast.js'

const toast = useToast()

const stats = ref([])
const statsLoading = ref(true)
const statsError = ref(null)

const loadStats = async () => {
  statsLoading.value = true
  statsError.value = null
  try {
    const { data } = await client.get('/course-statistics')
    stats.value = Array.isArray(data) ? data : data.stats || data.courses || []
  } catch (err) {
    statsError.value = 'Kunde inte hämta kursstatistik.'
    toast.error(statsError.value)
  } finally {
    statsLoading.value = false
  }
}

onMounted(loadStats)
</script>
