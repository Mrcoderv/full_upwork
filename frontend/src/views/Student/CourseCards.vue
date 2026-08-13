<template>
  <div class="course-cards-page">
    <div class="card">
      <div class="card-header">
        <div class="header-column header-left">
          <h3>Mina kurser</h3>
          <p v-if="student" class="student-name">{{ student.name }}</p>
        </div>
        <div class="header-column header-right">
          <span class="stat-item">
            <strong>{{ cards.length }}</strong>
            kurser
          </span>
          <span class="stat-item">
            <strong>{{ activeCards }}</strong>
            pågående
          </span>
        </div>
      </div>

      <div class="card-body">
        <div v-if="loading" class="loading-state">Laddar kurser...</div>
        <div v-else-if="error" class="error-state">{{ error }}</div>
        <div v-else-if="cards.length === 0" class="empty-state">
          Inga kurser ännu. Din studieplan visas här när du har kurser inlagda.
        </div>
        <div v-else class="cards-list">
          <article
            v-for="card in cards"
            :key="card.courseInstanceId || card.enrollmentId"
            class="course-card"
            :class="{ 'card-active': card.isCurrentlyActive }"
          >
            <div class="course-card-top">
              <div class="course-title-row">
                <span class="period-badge">Period {{ card.studyPeriod }}</span>
                <h4 class="course-name">{{ card.courseName }}</h4>
                <span v-if="card.courseCode" class="course-code">{{ card.courseCode }}</span>
                <span class="status-badge" :class="'status-' + (card.status || 'enrolled')">
                  {{ getStatusLabel(card.status || 'enrolled') }}
                </span>
              </div>
              <div class="course-meta">
                <span v-if="card.coursePoints" class="meta-item">
                  Poäng: {{ card.coursePoints }}
                </span>
                <span v-if="card.courseExtent" class="meta-item">
                  Omfattning: {{ card.courseExtent }}
                </span>
                <span class="meta-item">
                  Veckor: {{ card.weeks }}
                </span>
              </div>
            </div>

            <div class="course-card-dates">
              <div class="date-block">
                <span class="date-label">Start</span>
                <strong>{{ formatDate(card.startDate) }}</strong>
              </div>
              <div class="date-arrow">→</div>
              <div class="date-block">
                <span class="date-label">Slut</span>
                <strong>{{ formatDate(card.endDate) }}</strong>
              </div>
              <div v-if="card.responsibleTeacher" class="teacher-block">
                <span class="date-label">Lärare</span>
                <strong>{{ card.responsibleTeacher }}</strong>
              </div>
            </div>

            <div v-if="card.modules && card.modules.length > 0" class="course-card-modules">
              <h5 class="modules-title">Kursupplägg</h5>
              <div class="module-chips">
                <span
                  v-for="module in card.modules"
                  :key="module.moduleNumber"
                  class="module-chip"
                  :class="{
                    'chip-partial-exam': module.isPartialExam,
                    'chip-case-study': module.isCaseStudy,
                  }"
                >
                  <span class="module-number">{{ module.moduleNumber }}.</span>
                  {{ module.title }}
                  <span v-if="module.isPartialExam" class="chip-tag">Delprov</span>
                  <span v-if="module.isCaseStudy" class="chip-tag">Case</span>
                </span>
              </div>
              <details v-for="module in card.modules" :key="'d' + module.moduleNumber" class="module-details">
                <summary>{{ module.title }}</summary>
                <ul class="section-list">
                  <li v-for="(section, i) in module.sections || []" :key="i" class="section-item">
                    <span class="section-title">{{ section.title || 'Sektion ' + (i + 1) }}</span>
                    <span v-if="section.description" class="section-description">{{ section.description }}</span>
                  </li>
                </ul>
              </details>
            </div>
          </article>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import client from '@/api/client.js'

const loading = ref(false)
const error = ref('')
const cards = ref([])
const student = ref(null)

const activeCards = computed(() => cards.value.filter((c) => c.isCurrentlyActive).length)

const formatDate = (value) => {
  if (!value) return ''
  const date = new Date(value)
  if (isNaN(date.getTime())) return ''
  return date.toISOString().slice(0, 10)
}

const getStatusLabel = (status) => {
  const labels = {
    enrolled: 'Antagen',
    active: 'Pågående',
    completed: 'Betygsatt',
    dropped: 'Avbrott',
    inactive: 'Ej påbörjad',
    suspended: 'Vilande',
    reviderad: 'Reviderad',
  }
  return labels[status] || status
}

const loadCourseCards = async () => {
  loading.value = true
  error.value = ''
  try {
    const { data } = await client.get('/course-cards/mine')
    cards.value = data.cards || []
    student.value = data.student || null
  } catch (e) {
    error.value = e?.response?.data?.error || 'Kunde inte hämta kurserna.'
  } finally {
    loading.value = false
  }
}

onMounted(loadCourseCards)
</script>

<style scoped>
.course-cards-page {
  padding: 1.5rem;
}

.card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.student-name {
  margin: 0.25rem 0 0;
  color: #6b7280;
  font-size: 0.9rem;
}

.stat-item {
  margin-left: 1rem;
}

.stat-item strong {
  font-size: 1.25rem;
}

.cards-list {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.course-card {
  border: 1px solid #e5e7eb;
  border-left: 4px solid #9ca3af;
  border-radius: 0.5rem;
  padding: 1rem 1.25rem;
  background: #fff;
}

.course-card.card-active {
  border-left-color: #16a34a;
}

.course-title-row {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  flex-wrap: wrap;
}

.course-name {
  margin: 0;
  font-size: 1.1rem;
  font-weight: 600;
}

.course-code {
  color: #6b7280;
  font-size: 0.85rem;
}

.period-badge,
.status-badge {
  font-size: 0.75rem;
  padding: 0.15rem 0.55rem;
  border-radius: 999px;
  font-weight: 600;
}

.period-badge {
  background: #eef2ff;
  color: #4338ca;
}

.status-badge.status-enrolled {
  background: #eff6ff;
  color: #1d4ed8;
}
.status-badge.status-active {
  background: #dcfce7;
  color: #15803d;
}
.status-badge.status-completed {
  background: #e2e8f0;
  color: #334155;
}
.status-badge.status-dropped,
.status-badge.status-inactive {
  background: #fee2e2;
  color: #b91c1c;
}
.status-badge.status-suspended {
  background: #fef3c7;
  color: #b45309;
}
.status-badge.status-reviderad {
  background: #f3e8ff;
  color: #7e22ce;
}

.course-meta {
  display: flex;
  gap: 1rem;
  margin-top: 0.4rem;
  color: #6b7280;
  font-size: 0.85rem;
}

.course-card-dates {
  display: flex;
  align-items: center;
  gap: 1rem;
  margin-top: 0.75rem;
  padding-top: 0.75rem;
  border-top: 1px dashed #e5e7eb;
}

.date-block {
  display: flex;
  flex-direction: column;
}

.date-label {
  font-size: 0.72rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: #9ca3af;
}

.date-arrow {
  color: #9ca3af;
}

.teacher-block {
  margin-left: auto;
  text-align: right;
}

.course-card-modules {
  margin-top: 0.9rem;
}

.modules-title {
  margin: 0 0 0.5rem;
  font-size: 0.85rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: #6b7280;
}

.module-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
}

.module-chip {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  border: 1px solid #e5e7eb;
  border-radius: 999px;
  padding: 0.25rem 0.7rem;
  font-size: 0.8rem;
  background: #f9fafb;
}

.chip-partial-exam {
  border-color: #fca5a5;
  background: #fef2f2;
}

.chip-case-study {
  border-color: #f0abfc;
  background: #fdf4ff;
}

.chip-tag {
  font-size: 0.68rem;
  font-weight: 700;
  color: #6b7280;
}

.module-details {
  margin-top: 0.5rem;
}

.module-details summary {
  cursor: pointer;
  font-weight: 600;
  font-size: 0.85rem;
  color: #374151;
}

.section-list {
  margin: 0.4rem 0 0 1rem;
  padding: 0;
  list-style: none;
}

.section-item {
  display: flex;
  gap: 0.5rem;
  font-size: 0.85rem;
  padding: 0.2rem 0;
}

.section-title {
  font-weight: 600;
  color: #374151;
  min-width: 6rem;
}

.section-description {
  color: #6b7280;
}

.loading-state,
.error-state,
.empty-state {
  padding: 2rem;
  text-align: center;
  color: #6b7280;
}

.error-state {
  color: #b91c1c;
}
</style>
