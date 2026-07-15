<template>
  <div class="scrollable-view analytics-dashboard">
    <v-container fluid>
      <h1 class="mb-4">📊 Rapporter &amp; Analys</h1>

      <!-- Filter bar -->
      <v-card class="mb-4 pa-4" variant="outlined">
        <v-row dense align="center">
          <v-col cols="12" sm="6" md="2">
            <DatePicker
              v-model="filters.startDate"
              format="yyyy-MM-dd"
              model-type="yyyy-MM-dd"
              auto-apply
              :enable-time-picker="false"
              placeholder="Från datum"
              teleport="body"
              prevent-min-max-navigation
            />
          </v-col>
          <v-col cols="12" sm="6" md="2">
            <DatePicker
              v-model="filters.endDate"
              format="yyyy-MM-dd"
              model-type="yyyy-MM-dd"
              auto-apply
              :enable-time-picker="false"
              placeholder="Till datum"
              teleport="body"
              prevent-min-max-navigation
            />
          </v-col>
          <v-col cols="12" sm="6" md="3">
            <v-select
              v-model="filters.municipality"
              :items="filterOptions.municipalities"
              label="Kommun"
              clearable
              variant="outlined"
              density="comfortable"
              hide-details
            />
          </v-col>
          <v-col cols="12" sm="6" md="3">
            <v-select
              v-model="filters.courseId"
              :items="courseItems"
              item-title="name"
              item-value="id"
              label="Kurs"
              clearable
              variant="outlined"
              density="comfortable"
              hide-details
            />
          </v-col>
          <v-col cols="12" sm="6" md="2">
            <v-select
              v-model="filters.teacherId"
              :items="teacherItems"
              item-title="name"
              item-value="id"
              label="Lärare"
              clearable
              variant="outlined"
              density="comfortable"
              hide-details
            />
          </v-col>
        </v-row>
        <v-row dense class="mt-2">
          <v-col cols="12" class="d-flex justify-end">
            <v-btn variant="tonal" class="mr-2" @click="resetFilters">Rensa filter</v-btn>
            <v-btn color="primary" :loading="isActiveTabLoading" @click="loadActiveTab">Uppdatera</v-btn>
          </v-col>
        </v-row>
      </v-card>

      <v-alert v-if="error" type="error" class="mb-4" closable @click:close="error = ''">
        {{ error }}
      </v-alert>

      <v-tabs v-model="activeTab" color="primary" class="mb-4">
        <v-tab value="revenue">Intäkter</v-tab>
        <v-tab value="forecast">Prognoser</v-tab>
        <v-tab value="students">Elever</v-tab>
        <v-tab value="grades">Betygsfördelning</v-tab>
        <v-tab value="popular">Populära kurser</v-tab>
        <v-tab value="dropouts">Avbrott</v-tab>
      </v-tabs>

      <v-window v-model="activeTab">
        <!-- Revenue -->
        <v-window-item value="revenue">
          <v-card class="pa-4">
            <div class="d-flex justify-space-between align-center flex-wrap mb-4">
              <h2>Intäkter per kommun &amp; kurs</h2>
              <div>
                <v-btn size="small" class="mr-2" @click="exportRevenueCSV">Exportera CSV</v-btn>
                <v-btn size="small" @click="exportRevenuePDF">Exportera PDF</v-btn>
              </div>
            </div>

            <v-alert v-if="!loading.revenue && revenue.byMunicipality.length === 0" type="info" variant="tonal">
              Ingen intäktsdata för valda filter.
            </v-alert>

            <template v-else>
              <h3 class="mb-2">Totalt: {{ formatCurrency(revenue.totalRevenue) }}</h3>
              <v-row>
                <v-col cols="12" md="6">
                  <h4 class="mb-2">Per kommun</h4>
                  <Bar v-if="revenue.byMunicipality.length" :data="revenueMunicipalityChart" :options="chartOptions" />
                  <v-table density="compact" class="mt-4">
                    <thead>
                      <tr><th>Kommun</th><th class="text-right">Intäkt</th></tr>
                    </thead>
                    <tbody>
                      <tr v-for="row in revenue.byMunicipality" :key="row.municipality">
                        <td>{{ row.municipality }}</td>
                        <td class="text-right">{{ formatCurrency(row.revenue) }}</td>
                      </tr>
                    </tbody>
                  </v-table>
                </v-col>
                <v-col cols="12" md="6">
                  <h4 class="mb-2">Per kurs</h4>
                  <Bar v-if="revenue.byCourse.length" :data="revenueCourseChart" :options="chartOptions" />
                  <v-table density="compact" class="mt-4">
                    <thead>
                      <tr><th>Kurs</th><th class="text-right">Intäkt</th></tr>
                    </thead>
                    <tbody>
                      <tr v-for="row in revenue.byCourse" :key="row.course">
                        <td>{{ row.course }}</td>
                        <td class="text-right">{{ formatCurrency(row.revenue) }}</td>
                      </tr>
                    </tbody>
                  </v-table>
                </v-col>
              </v-row>
            </template>
          </v-card>
        </v-window-item>

        <!-- Forecast -->
        <v-window-item value="forecast">
          <v-card class="pa-4">
            <div class="d-flex justify-space-between align-center flex-wrap mb-4">
              <h2>Månatliga intäktsprognoser</h2>
              <div class="d-flex align-center">
                <v-select
                  v-model.number="forecastMonths"
                  :items="[1, 2, 3, 6, 12]"
                  label="Prognosmånader"
                  density="compact"
                  hide-details
                  style="max-width: 160px"
                  class="mr-2"
                  @update:model-value="loadForecast"
                />
                <v-btn size="small" class="mr-2" @click="exportForecastCSV">Exportera CSV</v-btn>
                <v-btn size="small" @click="exportForecastPDF">Exportera PDF</v-btn>
              </div>
            </div>

            <v-alert type="info" variant="tonal" class="mb-4">
              Prognosen är en uppskattning baserad på genomsnittet av de senaste registrerade
              månaderna och kommunernas prislista - inte en bokförd siffra.
            </v-alert>

            <v-alert v-if="!loading.forecast && forecast.history.length === 0" type="info" variant="tonal">
              Ingen historisk intäktsdata för valda filter.
            </v-alert>

            <template v-else>
              <Line v-if="forecast.history.length" :data="forecastChart" :options="chartOptions" />
              <v-table density="compact" class="mt-4">
                <thead>
                  <tr><th>Månad</th><th class="text-right">Intäkt</th><th>Typ</th></tr>
                </thead>
                <tbody>
                  <tr v-for="row in [...forecast.history, ...forecast.forecast]" :key="row.month">
                    <td>{{ row.month }}</td>
                    <td class="text-right">{{ formatCurrency(row.revenue) }}</td>
                    <td>{{ row.projected ? 'Prognos' : 'Faktisk' }}</td>
                  </tr>
                </tbody>
              </v-table>
            </template>
          </v-card>
        </v-window-item>

        <!-- Students -->
        <v-window-item value="students">
          <v-card class="pa-4">
            <div class="d-flex justify-space-between align-center flex-wrap mb-4">
              <h2>Elevrapporter</h2>
              <div class="d-flex align-center">
                <v-select
                  v-model="studentGroupBy"
                  :items="[
                    { title: 'Per månad', value: 'month' },
                    { title: 'Per lärare', value: 'teacher' },
                    { title: 'Per kurs', value: 'course' },
                    { title: 'Per termin', value: 'semester' },
                  ]"
                  label="Gruppera"
                  density="compact"
                  hide-details
                  style="max-width: 200px"
                  class="mr-2"
                  @update:model-value="loadStudents"
                />
                <v-btn size="small" class="mr-2" @click="exportStudentsCSV">Exportera CSV</v-btn>
                <v-btn size="small" @click="exportStudentsPDF">Exportera PDF</v-btn>
              </div>
            </div>

            <v-alert v-if="!loading.students && students.length === 0" type="info" variant="tonal">
              Ingen data för valda filter.
            </v-alert>

            <template v-else>
              <Bar v-if="students.length" :data="studentsChart" :options="chartOptions" />
              <v-table density="compact" class="mt-4">
                <thead>
                  <tr>
                    <th>{{ studentGroupLabel }}</th>
                    <th class="text-right">Inskrivningar</th>
                    <th class="text-right">Unika elever</th>
                    <th class="text-right">Aktiva</th>
                    <th class="text-right">Nya</th>
                    <th class="text-right">Klara</th>
                    <th class="text-right">Avbrott</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="row in students" :key="row.label">
                    <td>{{ row.label }}</td>
                    <td class="text-right">{{ row.enrollments }}</td>
                    <td class="text-right">{{ row.uniqueStudents }}</td>
                    <td class="text-right">{{ row.active || 0 }}</td>
                    <td class="text-right">{{ row.new || 0 }}</td>
                    <td class="text-right">{{ row.completions || 0 }}</td>
                    <td class="text-right">{{ row.dropouts || 0 }}</td>
                  </tr>
                </tbody>
              </v-table>
            </template>
          </v-card>
        </v-window-item>

        <!-- Grades -->
        <v-window-item value="grades">
          <v-card class="pa-4">
            <div class="d-flex justify-space-between align-center flex-wrap mb-4">
              <h2>Betygsfördelning</h2>
              <div>
                <v-btn size="small" class="mr-2" @click="exportGradesCSV">Exportera CSV</v-btn>
                <v-btn size="small" @click="exportGradesPDF">Exportera PDF</v-btn>
              </div>
            </div>

            <v-alert v-if="!loading.grades && grades.overall.length === 0" type="info" variant="tonal">
              Ingen betygsdata för valda filter.
            </v-alert>

            <template v-else>
              <v-row>
                <v-col cols="12" md="5">
                  <h4 class="mb-2">Totalt</h4>
                  <Doughnut v-if="grades.overall.length" :data="gradesOverallChart" :options="chartOptions" />
                </v-col>
                <v-col cols="12" md="7">
                  <h4 class="mb-2">Per kurs</h4>
                  <v-table density="compact">
                    <thead>
                      <tr><th>Kurs</th><th>Fördelning</th><th class="text-right">Totalt</th></tr>
                    </thead>
                    <tbody>
                      <tr v-for="row in grades.perCourse" :key="row.course">
                        <td>{{ row.course }}</td>
                        <td>
                          <span v-for="g in row.grades" :key="g.grade" class="mr-2">
                            {{ g.grade }}: {{ g.count }}
                          </span>
                        </td>
                        <td class="text-right">{{ row.total }}</td>
                      </tr>
                    </tbody>
                  </v-table>
                </v-col>
              </v-row>
            </template>
          </v-card>
        </v-window-item>

        <!-- Popular courses -->
        <v-window-item value="popular">
          <v-card class="pa-4">
            <div class="d-flex justify-space-between align-center flex-wrap mb-4">
              <h2>Populära kurser</h2>
              <div>
                <v-btn size="small" class="mr-2" @click="exportPopularCSV">Exportera CSV</v-btn>
                <v-btn size="small" @click="exportPopularPDF">Exportera PDF</v-btn>
              </div>
            </div>

            <v-alert v-if="!loading.popular && popularCourses.length === 0" type="info" variant="tonal">
              Ingen data för valda filter.
            </v-alert>

            <template v-else>
              <Bar v-if="popularCourses.length" :data="popularChart" :options="chartOptions" />
              <v-table density="compact" class="mt-4">
                <thead>
                  <tr><th>Kurs</th><th class="text-right">Inskrivningar</th><th class="text-right">Avslutade</th><th class="text-right">Betygsatta</th></tr>
                </thead>
                <tbody>
                  <tr v-for="row in popularCourses" :key="row.course">
                    <td>{{ row.course }}</td>
                    <td class="text-right">{{ row.enrollments }}</td>
                    <td class="text-right">{{ row.completed }}</td>
                    <td class="text-right">{{ row.graded }}</td>
                  </tr>
                </tbody>
              </v-table>
            </template>
          </v-card>
        </v-window-item>

        <!-- Dropouts -->
        <v-window-item value="dropouts">
          <v-card class="pa-4">
            <div class="d-flex justify-space-between align-center flex-wrap mb-4">
              <h2>Avbrott / Avhopp</h2>
              <div>
                <v-btn size="small" class="mr-2" @click="exportDropoutsCSV">Exportera CSV</v-btn>
                <v-btn size="small" @click="exportDropoutsPDF">Exportera PDF</v-btn>
              </div>
            </div>

            <v-alert v-if="!loading.dropouts && dropouts.byMonth.length === 0" type="info" variant="tonal">
              Ingen data för valda filter.
            </v-alert>

            <template v-else>
              <v-row>
                <v-col cols="12" md="6">
                  <h4 class="mb-2">Per månad</h4>
                  <Line v-if="dropouts.byMonth.length" :data="dropoutsMonthChart" :options="chartOptions" />
                  <v-table density="compact" class="mt-4">
                    <thead>
                      <tr><th>Månad</th><th class="text-right">Avbrott</th><th class="text-right">Totalt</th><th class="text-right">Andel</th></tr>
                    </thead>
                    <tbody>
                      <tr v-for="row in dropouts.byMonth" :key="row.month">
                        <td>{{ row.month }}</td>
                        <td class="text-right">{{ row.dropouts }}</td>
                        <td class="text-right">{{ row.total }}</td>
                        <td class="text-right">{{ row.rate }}%</td>
                      </tr>
                    </tbody>
                  </v-table>
                </v-col>
                <v-col cols="12" md="6">
                  <h4 class="mb-2">Per kurs</h4>
                  <v-table density="compact">
                    <thead>
                      <tr><th>Kurs</th><th class="text-right">Avbrott</th><th class="text-right">Totalt</th><th class="text-right">Andel</th></tr>
                    </thead>
                    <tbody>
                      <tr v-for="row in dropouts.byCourse" :key="row.course">
                        <td>{{ row.course }}</td>
                        <td class="text-right">{{ row.dropouts }}</td>
                        <td class="text-right">{{ row.total }}</td>
                        <td class="text-right">{{ row.rate }}%</td>
                      </tr>
                    </tbody>
                  </v-table>
                </v-col>
              </v-row>
            </template>
          </v-card>
        </v-window-item>
      </v-window>
    </v-container>
  </div>
</template>

<script setup>
import { ref, reactive, computed, watch, onMounted } from 'vue'
import { api } from '@/store/store'
import { Bar, Line, Doughnut } from 'vue-chartjs'
import {
  Chart as ChartJS,
  Title,
  Tooltip,
  Legend,
  BarElement,
  CategoryScale,
  LinearScale,
  LineElement,
  PointElement,
  ArcElement,
} from 'chart.js'
import { VueDatePicker as DatePicker } from '@vuepic/vue-datepicker'
import '@vuepic/vue-datepicker/dist/main.css'
import { exportToCSV, exportToPDF } from '@/utils/exportUtils'

ChartJS.register(
  Title,
  Tooltip,
  Legend,
  BarElement,
  CategoryScale,
  LinearScale,
  LineElement,
  PointElement,
  ArcElement,
)

const activeTab = ref('revenue')
const error = ref('')

const filters = reactive({
  startDate: '',
  endDate: '',
  municipality: null,
  courseId: null,
  teacherId: null,
})

const filterOptions = ref({ municipalities: [], courses: [], teachers: [] })
const courseItems = computed(() => filterOptions.value.courses || [])
const teacherItems = computed(() => filterOptions.value.teachers || [])

const forecastMonths = ref(3)
const studentGroupBy = ref('month')

const loading = reactive({
  revenue: false,
  forecast: false,
  students: false,
  grades: false,
  popular: false,
  dropouts: false,
})

const revenue = ref({ totalRevenue: 0, byMunicipality: [], byCourse: [] })
const forecast = ref({ history: [], forecast: [] })
const students = ref([])
const grades = ref({ overall: [], perCourse: [] })
const popularCourses = ref([])
const dropouts = ref({ byMonth: [], byCourse: [] })

const isActiveTabLoading = computed(() => !!loading[activeTab.value])

function buildParams(extra = {}) {
  const params = {}
  if (filters.startDate) params.startDate = filters.startDate
  if (filters.endDate) params.endDate = filters.endDate
  if (filters.municipality) params.municipality = filters.municipality
  if (filters.courseId) params.courseId = filters.courseId
  if (filters.teacherId) params.teacherId = filters.teacherId
  return { ...params, ...extra }
}

async function safeGet(path, params) {
  try {
    const res = await api.get(path, { params })
    return res.data
  } catch (err) {
    console.error(`❌ Failed to load ${path}:`, err)
    error.value = 'Kunde inte hämta rapportdata. Försök igen.'
    throw err
  }
}

async function loadFilterOptions() {
  try {
    filterOptions.value = await safeGet('/analytics/filters')
  } catch {
    // error already surfaced via safeGet
  }
}

async function loadRevenue() {
  loading.revenue = true
  try {
    revenue.value = await safeGet('/analytics/revenue', buildParams())
  } catch {
    // handled
  } finally {
    loading.revenue = false
  }
}

async function loadForecast() {
  loading.forecast = true
  try {
    forecast.value = await safeGet(
      '/analytics/forecast',
      buildParams({ forecastMonths: forecastMonths.value }),
    )
  } catch {
    // handled
  } finally {
    loading.forecast = false
  }
}

async function loadStudents() {
  loading.students = true
  try {
    students.value = await safeGet(
      '/analytics/students',
      buildParams({ groupBy: studentGroupBy.value }),
    )
  } catch {
    // handled
  } finally {
    loading.students = false
  }
}

async function loadGrades() {
  loading.grades = true
  try {
    grades.value = await safeGet('/analytics/grades', buildParams())
  } catch {
    // handled
  } finally {
    loading.grades = false
  }
}

async function loadPopular() {
  loading.popular = true
  try {
    popularCourses.value = await safeGet('/analytics/popular-courses', buildParams())
  } catch {
    // handled
  } finally {
    loading.popular = false
  }
}

async function loadDropouts() {
  loading.dropouts = true
  try {
    dropouts.value = await safeGet('/analytics/dropouts', buildParams())
  } catch {
    // handled
  } finally {
    loading.dropouts = false
  }
}

const tabLoaders = {
  revenue: loadRevenue,
  forecast: loadForecast,
  students: loadStudents,
  grades: loadGrades,
  popular: loadPopular,
  dropouts: loadDropouts,
}

async function loadActiveTab() {
  error.value = ''
  await tabLoaders[activeTab.value]?.()
}

watch(activeTab, (tab) => {
  tabLoaders[tab]?.()
})

function resetFilters() {
  filters.startDate = ''
  filters.endDate = ''
  filters.municipality = null
  filters.courseId = null
  filters.teacherId = null
  loadActiveTab()
}

onMounted(async () => {
  error.value = ''
  await loadFilterOptions()
  await Promise.all([
    loadRevenue(),
    loadForecast(),
    loadStudents(),
    loadGrades(),
    loadPopular(),
    loadDropouts(),
  ])
})

function formatCurrency(value) {
  return new Intl.NumberFormat('sv-SE', { style: 'currency', currency: 'SEK', maximumFractionDigits: 0 }).format(
    value || 0,
  )
}

const studentGroupLabel = computed(() => {
  const labels = { month: 'Månad', teacher: 'Lärare', course: 'Kurs', semester: 'Termin' }
  return labels[studentGroupBy.value] || 'Grupp'
})

const chartOptions = { responsive: true, maintainAspectRatio: true, plugins: { legend: { display: true } } }

const chartPalette = ['#3f51b5', '#00acc1', '#ff9800', '#8bc34a', '#e91e63', '#9c27b0', '#607d8b', '#f44336']

const revenueMunicipalityChart = computed(() => ({
  labels: revenue.value.byMunicipality.map((r) => r.municipality),
  datasets: [
    {
      label: 'Intäkt (kr)',
      backgroundColor: chartPalette[0],
      data: revenue.value.byMunicipality.map((r) => r.revenue),
    },
  ],
}))

const revenueCourseChart = computed(() => ({
  labels: revenue.value.byCourse.map((r) => r.course),
  datasets: [
    {
      label: 'Intäkt (kr)',
      backgroundColor: chartPalette[1],
      data: revenue.value.byCourse.map((r) => r.revenue),
    },
  ],
}))

const forecastChart = computed(() => {
  const combined = [...forecast.value.history, ...forecast.value.forecast]
  return {
    labels: combined.map((r) => r.month),
    datasets: [
      {
        label: 'Intäkt (kr)',
        borderColor: chartPalette[0],
        backgroundColor: 'rgba(63,81,181,0.2)',
        data: combined.map((r) => r.revenue),
        segment: {
          borderDash: (ctx) => (combined[ctx.p1DataIndex]?.projected ? [6, 6] : undefined),
        },
      },
    ],
  }
})

const studentsChart = computed(() => ({
  labels: students.value.map((r) => r.label),
  datasets: [
    {
      label: 'Inskrivningar',
      backgroundColor: chartPalette[2],
      data: students.value.map((r) => r.enrollments),
    },
    {
      label: 'Unika elever',
      backgroundColor: chartPalette[3],
      data: students.value.map((r) => r.uniqueStudents),
    },
  ],
}))

const gradesOverallChart = computed(() => ({
  labels: grades.value.overall.map((g) => g.grade),
  datasets: [
    {
      backgroundColor: chartPalette,
      data: grades.value.overall.map((g) => g.count),
    },
  ],
}))

const popularChart = computed(() => ({
  labels: popularCourses.value.map((r) => r.course),
  datasets: [
    {
      label: 'Inskrivningar',
      backgroundColor: chartPalette[4],
      data: popularCourses.value.map((r) => r.enrollments),
    },
  ],
}))

const dropoutsMonthChart = computed(() => ({
  labels: dropouts.value.byMonth.map((r) => r.month),
  datasets: [
    {
      label: 'Avbrottsandel (%)',
      borderColor: chartPalette[5],
      backgroundColor: 'rgba(156,39,176,0.2)',
      data: dropouts.value.byMonth.map((r) => r.rate),
    },
  ],
}))

// --- Export handlers ---
function exportRevenueCSV() {
  exportToCSV(
    'intakter-per-kommun-och-kurs.csv',
    ['Kommun', 'Intäkt'],
    revenue.value.byMunicipality.map((r) => [r.municipality, r.revenue]),
  )
}
function exportRevenuePDF() {
  exportToPDF(
    'intakter-per-kommun.pdf',
    'Intäkter per kommun',
    ['Kommun', 'Intäkt'],
    revenue.value.byMunicipality.map((r) => [r.municipality, formatCurrency(r.revenue)]),
  )
}

function exportForecastCSV() {
  exportToCSV(
    'intaktsprognos.csv',
    ['Månad', 'Intäkt', 'Typ'],
    [...forecast.value.history, ...forecast.value.forecast].map((r) => [
      r.month,
      r.revenue,
      r.projected ? 'Prognos' : 'Faktisk',
    ]),
  )
}
function exportForecastPDF() {
  exportToPDF(
    'intaktsprognos.pdf',
    'Intäktsprognos',
    ['Månad', 'Intäkt', 'Typ'],
    [...forecast.value.history, ...forecast.value.forecast].map((r) => [
      r.month,
      formatCurrency(r.revenue),
      r.projected ? 'Prognos' : 'Faktisk',
    ]),
  )
}

function exportStudentsCSV() {
  exportToCSV(
    'elevrapport.csv',
    [studentGroupLabel.value, 'Inskrivningar', 'Unika elever', 'Aktiva', 'Nya', 'Klara', 'Avbrott'],
    students.value.map((r) => [r.label, r.enrollments, r.uniqueStudents, r.active || 0, r.new || 0, r.completions || 0, r.dropouts || 0]),
  )
}
function exportStudentsPDF() {
  exportToPDF(
    'elevrapport.pdf',
    'Elevrapport',
    [studentGroupLabel.value, 'Inskrivningar', 'Unika elever', 'Aktiva', 'Nya', 'Klara', 'Avbrott'],
    students.value.map((r) => [r.label, r.enrollments, r.uniqueStudents, r.active || 0, r.new || 0, r.completions || 0, r.dropouts || 0]),
  )
}

function exportGradesCSV() {
  exportToCSV(
    'betygsfordelning.csv',
    ['Kurs', 'Betyg', 'Antal'],
    grades.value.perCourse.flatMap((row) => row.grades.map((g) => [row.course, g.grade, g.count])),
  )
}
function exportGradesPDF() {
  exportToPDF(
    'betygsfordelning.pdf',
    'Betygsfördelning per kurs',
    ['Kurs', 'Betyg', 'Antal'],
    grades.value.perCourse.flatMap((row) => row.grades.map((g) => [row.course, g.grade, g.count])),
  )
}

function exportPopularCSV() {
  exportToCSV(
    'populara-kurser.csv',
    ['Kurs', 'Inskrivningar', 'Avslutade', 'Betygsatta'],
    popularCourses.value.map((r) => [r.course, r.enrollments, r.completed, r.graded]),
  )
}
function exportPopularPDF() {
  exportToPDF(
    'populara-kurser.pdf',
    'Populära kurser',
    ['Kurs', 'Inskrivningar', 'Avslutade', 'Betygsatta'],
    popularCourses.value.map((r) => [r.course, r.enrollments, r.completed, r.graded]),
  )
}

function exportDropoutsCSV() {
  exportToCSV(
    'avbrottsrapport.csv',
    ['Månad', 'Avbrott', 'Totalt', 'Andel (%)'],
    dropouts.value.byMonth.map((r) => [r.month, r.dropouts, r.total, r.rate]),
  )
}
function exportDropoutsPDF() {
  exportToPDF(
    'avbrottsrapport.pdf',
    'Avbrottsrapport per månad',
    ['Månad', 'Avbrott', 'Totalt', 'Andel (%)'],
    dropouts.value.byMonth.map((r) => [r.month, r.dropouts, r.total, `${r.rate}%`]),
  )
}
</script>

<style scoped>
.analytics-dashboard {
  max-width: 1200px;
  margin: 0 auto;
  padding: 1rem;
}

.analytics-dashboard :deep(.dp__input) {
  height: 40px;
  border-radius: 4px;
  font-size: 14px;
  padding: 0 12px;
}

.analytics-dashboard :deep(.dp__input:focus) {
  border-color: rgb(var(--v-theme-primary));
  box-shadow: 0 0 0 1px rgb(var(--v-theme-primary));
}

.analytics-dashboard :deep(.dp__main) {
  font-family: inherit;
}

.analytics-dashboard :deep(.dp__input::placeholder) {
  color: rgba(0, 0, 0, 0.6);
  opacity: 1;
}

.analytics-dashboard :deep(.v-field) {
  min-height: 40px;
}

.analytics-dashboard :deep(.v-field__input) {
  min-height: 40px;
  padding-top: 4px;
}
</style>
