<template>
  <div class="scrollable-view">
    <div class="course-stats">
      <h2>📊 Course Statistics ({{ currentMonth }})</h2>

      <label>
        Filter by Municipality:
        <select v-model="selectedMunicipality">
          <option value="">All</option>
          <option v-for="m in availableMunicipalities" :key="m">{{ m }}</option>
        </select>
      </label>

      <button @click="toggleSort">Sort: {{ sortDescending ? 'Most' : 'Least' }} Popular</button>
      <button @click="exportCSV">Export CSV</button>

      <div v-for="(courses, month) in sortedStats" :key="month" class="month-section">
        <h3>{{ month }}</h3>
        <table>
          <thead>
            <tr>
              <th>Course</th>
              <th v-for="grade in gradeOrder" :key="grade">{{ grade }}</th>
              <th>Total</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(grades, course) in courses" :key="course">
              <td>{{ course }}</td>
              <td v-for="grade in gradeOrder" :key="grade">{{ grades[grade] || 0 }}</td>
              <td>{{ totalGrades(grades) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>

<script setup>
  import { ref, computed, onMounted } from 'vue'
  import client from '@/api/client.js'
  import { useToast } from '@/composables/useToast.js'

  const toast = useToast()

  const stats = ref({})
  const sortDescending = ref(true)
  const selectedMunicipality = ref('')

  const gradeOrder = ['A', 'B', 'C', 'D', 'E', 'F', 'STRECK', 'AVBROTT', 'UNKNOWN']

  onMounted(async () => {
    try {
      const res = await client.get('/stats/courses-per-month')
      stats.value = res.data || {}
    } catch (err) {
      console.error('Failed to load stats:', err)
      stats.value = {}
    }
  })

  const currentMonth = new Date().toISOString().slice(0, 7)

  const availableMunicipalities = computed(() => {
    const set = new Set()
    Object.values(stats.value).forEach((monthData) => {
      Object.values(monthData).forEach((courseData) => {
        courseData._municipality?.forEach((m) => set.add(m))
      })
    })
    return Array.from(set).sort()
  })

  const sortedStats = computed(() => {
    const result = {}
    for (const [month, courseData] of Object.entries(stats.value || {})) {
      if (!courseData || typeof courseData !== 'object') continue

      const filteredCourses = Object.entries(courseData)
        .filter(([course, grades]) => {
          if (!course || course.startsWith('_')) return false
          if (selectedMunicipality.value) {
            return grades._municipality?.includes(selectedMunicipality.value)
          }
          return true
        })
        .sort((a, b) => {
          const totalA = totalGrades(a[1])
          const totalB = totalGrades(b[1])
          return sortDescending.value ? totalB - totalA : totalA - totalB
        })

      result[month] = Object.fromEntries(filteredCourses)
    }
    return result
  })

  function toggleSort() {
    sortDescending.value = !sortDescending.value
  }

  function totalGrades(grades) {
    return gradeOrder.reduce((sum, g) => sum + (grades[g] || 0), 0)
  }

  function exportCSV() {
    const rows = [['Month', 'Course', ...gradeOrder, 'Total', 'Municipalities']]
    for (const month in stats.value) {
      for (const course in stats.value[month]) {
        if (course.startsWith('_')) continue
        const g = stats.value[month][course]
        const row = [
          month,
          course,
          ...gradeOrder.map((x) => g[x] || 0),
          totalGrades(g),
          g._municipality?.join(';') || '',
        ]
        rows.push(row)
      }
    }
    const csv = rows.map((r) => r.join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'course_stats.csv'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }
</script>

<style scoped>
  .course-stats {
    max-width: 1000px;
    margin: auto;
    padding: 1rem;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    margin: 1rem 0;
  }
  th,
  td {
    border: 1px solid #ccc;
    padding: 0.4rem;
    text-align: left;
  }
  .month-section {
    margin-bottom: 2rem;
    border-top: 2px solid #999;
    padding-top: 1rem;
  }
</style>
