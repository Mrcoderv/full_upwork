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
              <div class="course-action-bar">
                <router-link
                  :to="{ name: 'CourseCards', query: { selectedCourse: card.courseInstanceId } }"
                  class="btn btn-sm btn-outline-primary me-2"
                  >
                  <v-icon left>mdi-eye</v-icon>
                  Gå till kurs
                </router-link>
                <span v-if="card.isCurrentlyActive" class="chip chip-partial-exam float-end">
                  Aktiv
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

            <div v-if="card.progress" class="progress-block">
              <span class="progress-label">
                Framsteg: {{ card.progress.completed }}/{{ card.progress.total }}
                ({{ card.progress.percent }}%)
              </span>
              <div class="progress-track">
                <div class="progress-fill" :style="{ width: card.progress.percent + '%' }"></div>
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
                    <span v-if="section.instructions" class="section-instructions">{{ section.instructions }}</span>
                  </li>
                </ul>

                <div
                  v-if="module.assignment && (module.assignment.title || module.assignment.description)"
                  class="assignment-block"
                >
                  <div class="assignment-heading">
                    <strong>{{ module.assignment.title || 'Inlämningsuppgift' }}</strong>
                  </div>
                  <p v-if="module.assignment.description" class="assignment-description">
                    {{ module.assignment.description }}
                  </p>

                  <div v-if="getSubmission(card, module)" class="submission-status">
                    <span class="submission-meta">
                      Inlämnat {{ formatDateTime(getSubmission(card, module).submittedAt) }}
                    </span>
                    <span
                      v-if="getSubmission(card, module).feedback && getSubmission(card, module).feedback.status === 'godkänd'"
                      class="feedback-chip feedback-ok"
                    >Godkänd</span>
                    <span
                      v-else-if="getSubmission(card, module).feedback && getSubmission(card, module).feedback.status === 'komplettera'"
                      class="feedback-chip feedback-rework"
                    >Komplettera</span>
                    <span v-else class="feedback-chip feedback-pending">Väntar på återkoppling</span>
                    <p
                      v-if="getSubmission(card, module).feedback && getSubmission(card, module).feedback.comment"
                      class="feedback-comment"
                    >
                      {{ getSubmission(card, module).feedback.comment }}
                    </p>
                  </div>

                  <div class="submission-form">
                    <textarea
                      v-model="drafts[keyFor(card, module)].text"
                      class="submission-textarea"
                      :placeholder="'Skriv din inlämning för modul ' + module.moduleNumber + '...'"
                      rows="3"
                    ></textarea>
                    <div class="submission-actions">
                      <label class="file-picker">
                        Välj fil
                        <input type="file" class="file-input" @change="onFileChange(card, module, $event)" />
                      </label>
                      <span v-if="drafts[keyFor(card, module)].fileName" class="file-name">
                        {{ drafts[keyFor(card, module)].fileName }}
                      </span>
                      <button
                        class="submit-btn"
                        :disabled="!!submitting[keyFor(card, module)]"
                        @click="submitAssignment(card, module)"
                      >
                        {{ submitting[keyFor(card, module)] ? 'Skickar...' : 'Skicka in' }}
                      </button>
                    </div>
                    <span v-if="submitError[keyFor(card, module)]" class="submit-error">
                      {{ submitError[keyFor(card, module)] }}
                    </span>
                  </div>
                </div>
              </details>
            </div>
          </article>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import client from '@/api/client.js'

const loading = ref(false)
const error = ref('')
const cards = ref([])
const student = ref(null)
const learning = ref({})
const drafts = reactive({})
const submitting = reactive({})
const submitError = reactive({})

const activeCards = computed(() => cards.value.filter((c) => c.isCurrentlyActive).length)

const keyFor = (card, module) => `${card.courseInstanceId}:${module.moduleNumber}`

const initDraft = (card, module) => {
  const key = keyFor(card, module)
  if (!drafts[key]) drafts[key] = { text: '', file: null, fileName: '' }
}

const getSubmission = (card, module) => {
  const entry = learning.value[card.courseInstanceId]
  return entry?.submissions?.[module.moduleNumber] || null
}

const formatDate = (value) => {
  if (!value) return ''
  const date = new Date(value)
  if (isNaN(date.getTime())) return ''
  return date.toISOString().slice(0, 10)
}

const formatDateTime = (value) => {
  if (!value) return ''
  const date = new Date(value)
  if (isNaN(date.getTime())) return ''
  return date.toLocaleString('sv-SE', { dateStyle: 'short', timeStyle: 'short' })
}

const loadLearning = async (card) => {
  try {
    const { data } = await client.get(`/learning/instances/${card.courseInstanceId}/modules`)
    learning.value[card.courseInstanceId] = {
      submissions: data.submissions || {},
      enrollmentId: data.enrollmentId || null,
    }
  } catch (e) {
    learning.value[card.courseInstanceId] = { submissions: {}, enrollmentId: null }
  }
}

const onFileChange = (card, module, event) => {
  const file = event.target.files?.[0]
  const key = keyFor(card, module)
  initDraft(card, module)
  if (file) {
    drafts[key].file = file
    drafts[key].fileName = file.name
  }
}

const submitAssignment = async (card, module) => {
  const key = keyFor(card, module)
  initDraft(card, module)
  const text = (drafts[key].text || '').trim()
  let fileId = drafts[key].fileId
  let fileName = drafts[key].fileName || ''
  submitError[key] = ''

  try {
    if (drafts[key].file && !fileId) {
      submitting[key] = true
      const fd = new FormData()
      fd.append('file', drafts[key].file)
      const { data } = await client.post(`/uploads/${student.value._id}`, fd)
      fileId = data.file?._id
      fileName = data.file?.filename || drafts[key].fileName
    }

    if (!text && !fileId) {
      submitError[key] = 'Ange en text eller ladda upp en fil.'
      return
    }

    submitting[key] = true
    const { data } = await client.post(
      `/learning/instances/${card.courseInstanceId}/modules/${module.moduleNumber}/submissions`,
      { submittedText: text, fileId, fileName }
    )
    const entry = learning.value[card.courseInstanceId]
    if (entry) entry.submissions[module.moduleNumber] = data.submission
    drafts[key] = { text: '', file: null, fileName: '' }
  } catch (e) {
    submitError[key] = e?.response?.data?.error || 'Kunde inte skicka inlämningen.'
  } finally {
    submitting[key] = false
  }
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
    for (const card of cards.value) {
      for (const module of card.modules || []) {
        if (module.assignment && (module.assignment.title || module.assignment.description)) {
          initDraft(card, module)
        }
      }
      if (card.courseInstanceId) loadLearning(card)
    }
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

.section-instructions {
  color: #374151;
  white-space: pre-wrap;
  flex: 1;
}

.progress-block {
  margin-top: 0.75rem;
  padding-top: 0.75rem;
  border-top: 1px dashed #e5e7eb;
}

.progress-label {
  font-size: 0.8rem;
  color: #374151;
  font-weight: 600;
}

.progress-track {
  margin-top: 0.3rem;
  height: 0.5rem;
  background: #e5e7eb;
  border-radius: 999px;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background: #16a34a;
  border-radius: 999px;
}

.assignment-block {
  margin: 0.6rem 0 0.2rem 1rem;
  padding: 0.75rem;
  border: 1px solid #e5e7eb;
  border-left: 3px solid #4338ca;
  border-radius: 0.4rem;
  background: #f9fafb;
}

.assignment-heading {
  font-size: 0.9rem;
}

.assignment-description {
  margin: 0.3rem 0 0.5rem;
  font-size: 0.85rem;
  color: #6b7280;
  white-space: pre-wrap;
}

.submission-status {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
  margin-bottom: 0.6rem;
}

.submission-meta {
  font-size: 0.8rem;
  color: #6b7280;
}

.feedback-chip {
  align-self: flex-start;
  font-size: 0.75rem;
  font-weight: 700;
  padding: 0.15rem 0.55rem;
  border-radius: 999px;
}

.feedback-ok {
  background: #dcfce7;
  color: #15803d;
}

.feedback-rework {
  background: #fef3c7;
  color: #b45309;
}

.feedback-pending {
  background: #eff6ff;
  color: #1d4ed8;
}

.feedback-comment {
  margin: 0.2rem 0 0;
  font-size: 0.85rem;
  color: #374151;
  white-space: pre-wrap;
}

.submission-form {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.submission-textarea {
  width: 100%;
  padding: 0.5rem;
  border: 1px solid #d1d5db;
  border-radius: 0.35rem;
  font-family: inherit;
  font-size: 0.85rem;
  resize: vertical;
}

.submission-actions {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  flex-wrap: wrap;
}

.file-picker {
  font-size: 0.8rem;
  font-weight: 600;
  color: #4338ca;
  cursor: pointer;
}

.file-input {
  display: none;
}

.file-name {
  font-size: 0.8rem;
  color: #6b7280;
}

.submit-btn {
  margin-left: auto;
  background: #4338ca;
  color: #fff;
  border: none;
  border-radius: 0.35rem;
  padding: 0.4rem 1rem;
  font-size: 0.85rem;
  font-weight: 600;
  cursor: pointer;
}

.submit-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.submit-error {
  font-size: 0.8rem;
  color: #b91c1c;
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
