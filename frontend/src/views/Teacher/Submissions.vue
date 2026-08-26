<template>
  <div class="submissions-page">
    <div class="page-header">
      <h2>Inlämningar</h2>
      <p class="subtitle">Oklara inlämningsuppgifter från elever — lämna återkoppling.</p>
    </div>

    <div v-if="courses.length > 0" class="filter-row">
      <label class="filter-label" for="course-filter">Kurs:</label>
      <select id="course-filter" v-model="selectedCourseId" class="course-filter">
        <option value="">Alla kurser</option>
        <option v-for="course in courses" :key="course.id" :value="course.id">
          {{ course.label }}
        </option>
      </select>
    </div>

    <div v-if="loading" class="state-block">Laddar inlämningar...</div>
    <div v-else-if="error" class="state-block error-state">{{ error }}</div>
    <div v-else-if="filteredSubmissions.length === 0" class="state-block">
      Inga väntande inlämningar just nu.
    </div>

    <div v-else class="submissions-list">
      <article
        v-for="submission in filteredSubmissions"
        :key="submission._id"
        class="submission-card"
      >
        <div class="submission-header">
          <div class="submission-id">
            <strong>{{ studentName(submission) }}</strong>
            <span class="submission-course">
              {{ courseLabel(submission) }} · Modul {{ submission.moduleNumber }}
            </span>
          </div>
          <span class="submission-date">{{ formatDateTime(submission.submittedAt) }}</span>
        </div>

        <p v-if="submission.submittedText" class="submitted-text">{{ submission.submittedText }}</p>
        <button
          v-if="submission.fileId"
          class="download-btn"
          @click="downloadFile(submission)"
        >
          Ladda ner bifogad fil
        </button>

        <div class="feedback-form">
          <div class="feedback-row">
            <label class="feedback-label" :for="'status-' + submission._id">Status</label>
            <select :id="'status-' + submission._id" v-model="feedbackStatus[submission._id]" class="status-select">
              <option value="">Ingen bedömning</option>
              <option value="godkänd">Godkänd</option>
              <option value="komplettera">Komplettera</option>
            </select>
          </div>
          <textarea
            v-model="feedbackComment[submission._id]"
            class="feedback-comment-input"
            rows="2"
            placeholder="Skriv en kommentar till eleven..."
          ></textarea>
          <div class="feedback-actions">
            <button
              class="save-btn"
              :disabled="!!saving[submission._id]"
              @click="saveFeedback(submission)"
            >
              {{ saving[submission._id] ? 'Sparar...' : 'Spara återkoppling' }}
            </button>
            <span v-if="feedbackError[submission._id]" class="feedback-error">
              {{ feedbackError[submission._id] }}
            </span>
          </div>
        </div>

        <!-- Comment thread -->
        <div v-if="submissionComments[submission._id]?.length > 0" class="comment-thread">
          <h4 class="thread-title">Kommentarer</h4>
          <div v-for="comment in submissionComments[submission._id]" :key="comment.id" class="thread-comment">
            <span class="thread-meta">{{ formatDateTime(comment.at) }}</span>
            <p class="thread-text">{{ comment.text }}</p>
          </div>
        </div>
        <div class="comment-thread-form">
          <input
            v-model="newSubmissionComment[submission._id]"
            class="comment-input"
            placeholder="Lägg till kommentar..."
            @keyup.enter="postSubmissionComment(submission)"
          />
          <button
            class="save-btn save-btn-sm"
            :disabled="!newSubmissionComment[submission._id]?.trim() || !!commentSaving[submission._id]"
            @click="postSubmissionComment(submission)"
          >
            {{ commentSaving[submission._id] ? 'Skickar...' : 'Kommentera' }}
          </button>
        </div>
      </article>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import client from '@/api/client.js'

const loading = ref(false)
const error = ref('')
const submissions = ref([])
const selectedCourseId = ref('')
const feedbackStatus = reactive({})
const feedbackComment = reactive({})
const feedbackError = reactive({})
const saving = reactive({})
const submissionComments = reactive({})
const newSubmissionComment = reactive({})
const commentSaving = reactive({})

const courses = computed(() => {
  const map = new Map()
  for (const submission of submissions.value) {
    const course = submission.courseInstanceId
    if (!course || !course._id) continue
    map.set(course._id, {
      id: course._id,
      label: course.courseName ? `${course.courseName} (${course.courseCode})` : course.courseCode,
    })
  }
  return Array.from(map.values())
})

const filteredSubmissions = computed(() => {
  if (!selectedCourseId.value) return submissions.value
  return submissions.value.filter(
    (submission) => submission.courseInstanceId?._id === selectedCourseId.value
  )
})

const studentName = (submission) => submission.studentId?.name || 'Okänd elev'
const courseLabel = (submission) => {
  const course = submission.courseInstanceId
  return course?.courseName ? `${course.courseName} (${course.courseCode})` : 'Kurs'
}

const formatDateTime = (value) => {
  if (!value) return ''
  const date = new Date(value)
  if (isNaN(date.getTime())) return ''
  return date.toLocaleString('sv-SE', { dateStyle: 'short', timeStyle: 'short' })
}

const downloadFile = async (submission) => {
  try {
    const res = await client.get(`/uploads/download/${submission.fileId}`, {
      responseType: 'blob',
    })
    const blobUrl = window.URL.createObjectURL(res.data)
    const link = document.createElement('a')
    link.href = blobUrl
    link.setAttribute('download', submission.fileName || 'inlamning')
    document.body.appendChild(link)
    link.click()
    link.remove()
    window.URL.revokeObjectURL(blobUrl)
  } catch (e) {
    feedbackError[submission._id] = 'Kunde inte ladda ner filen.'
  }
}

const saveFeedback = async (submission) => {
  const id = submission._id
  const status = feedbackStatus[id] || ''
  const comment = (feedbackComment[id] || '').trim()
  if (!status) {
    feedbackError[id] = 'Välj en status (Godkänd eller Komplettera).'
    return
  }
  feedbackError[id] = ''
  saving[id] = true
  try {
    const { data } = await client.put(`/learning/submissions/${id}/feedback`, {
      comment,
      status,
    })
    const index = submissions.value.findIndex((submission) => submission._id === id)
    if (index !== -1) {
      submissions.value.splice(index, 1)
    }
    delete feedbackStatus[id]
    delete feedbackComment[id]
  } catch (e) {
    feedbackError[id] = e?.response?.data?.error || 'Kunde inte spara återkopplingen.'
  } finally {
    saving[id] = false
  }
}

const loadSubmissions = async () => {
  loading.value = true
  error.value = ''
  try {
    const { data } = await client.get('/learning/submissions/pending')
    submissions.value = data.submissions || []
    for (const submission of submissions.value) {
      feedbackStatus[submission._id] = submission.feedback?.status || ''
      feedbackComment[submission._id] = submission.feedback?.comment || ''
      loadSubmissionComments(submission._id)
    }
  } catch (e) {
    error.value = e?.response?.data?.error || 'Kunde inte hämta inlämningarna.'
  } finally {
    loading.value = false
  }
}

const loadSubmissionComments = async (submissionId) => {
  try {
    const { data } = await client.get(`/learning/submissions/${submissionId}/comments`)
    submissionComments[submissionId] = data.comments || []
  } catch {
    submissionComments[submissionId] = []
  }
}

const postSubmissionComment = async (submission) => {
  const id = submission._id
  const text = (newSubmissionComment[id] || '').trim()
  if (!text) return
  commentSaving[id] = true
  try {
    const { data } = await client.post(`/learning/submissions/${id}/comments`, { text })
    submissionComments[id] = data.comments || []
    newSubmissionComment[id] = ''
  } catch {
    feedbackError[id] = 'Kunde inte lägga till kommentar.'
  } finally {
    commentSaving[id] = false
  }
}

onMounted(loadSubmissions)
</script>

<style scoped>
.submissions-page {
  padding: 1.5rem;
}

.page-header {
  margin-bottom: 1rem;
}

.page-header h2 {
  margin: 0;
}

.subtitle {
  margin: 0.25rem 0 0;
  color: #6b7280;
  font-size: 0.9rem;
}

.filter-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 1rem;
}

.filter-label {
  font-size: 0.85rem;
  color: #374151;
}

.course-filter {
  padding: 0.35rem 0.5rem;
  border: 1px solid #d1d5db;
  border-radius: 0.35rem;
  font-family: inherit;
}

.state-block {
  padding: 2rem;
  text-align: center;
  color: #6b7280;
}

.error-state {
  color: #b91c1c;
}

.submissions-list {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.submission-card {
  border: 1px solid #e5e7eb;
  border-left: 4px solid #4338ca;
  border-radius: 0.5rem;
  padding: 1rem 1.25rem;
  background: #fff;
}

.submission-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
}

.submission-id {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
}

.submission-course {
  font-size: 0.85rem;
  color: #6b7280;
}

.submission-date {
  font-size: 0.8rem;
  color: #9ca3af;
  white-space: nowrap;
}

.submitted-text {
  margin: 0.75rem 0 0;
  padding: 0.6rem;
  background: #f9fafb;
  border-radius: 0.35rem;
  font-size: 0.85rem;
  white-space: pre-wrap;
  color: #374151;
}

.download-btn {
  margin-top: 0.6rem;
  background: none;
  border: none;
  padding: 0;
  font-size: 0.85rem;
  font-weight: 600;
  color: #4338ca;
  cursor: pointer;
}

.feedback-form {
  margin-top: 0.9rem;
  padding-top: 0.9rem;
  border-top: 1px dashed #e5e7eb;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.feedback-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.feedback-label {
  font-size: 0.85rem;
  color: #374151;
}

.status-select {
  padding: 0.35rem 0.5rem;
  border: 1px solid #d1d5db;
  border-radius: 0.35rem;
  font-family: inherit;
}

.feedback-comment-input {
  width: 100%;
  padding: 0.5rem;
  border: 1px solid #d1d5db;
  border-radius: 0.35rem;
  font-family: inherit;
  font-size: 0.85rem;
  resize: vertical;
}

.feedback-actions {
  display: flex;
  align-items: center;
  gap: 0.6rem;
}

.save-btn {
  background: #16a34a;
  color: #fff;
  border: none;
  border-radius: 0.35rem;
  padding: 0.4rem 1rem;
  font-size: 0.85rem;
  font-weight: 600;
  cursor: pointer;
}

.save-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.feedback-error {
  font-size: 0.8rem;
  color: #b91c1c;
}

.comment-thread {
  margin-top: 0.75rem;
  padding-top: 0.75rem;
  border-top: 1px dashed #e5e7eb;
}

.thread-title {
  font-size: 0.85rem;
  font-weight: 600;
  color: #374151;
  margin: 0 0 0.5rem;
}

.thread-comment {
  padding: 0.4rem 0;
}

.thread-meta {
  font-size: 0.75rem;
  color: #9ca3af;
}

.thread-text {
  margin: 0.15rem 0 0;
  font-size: 0.85rem;
  color: #374151;
}

.comment-thread-form {
  display: flex;
  gap: 0.5rem;
  margin-top: 0.5rem;
}

.comment-input {
  flex: 1;
  padding: 0.4rem 0.5rem;
  border: 1px solid #d1d5db;
  border-radius: 0.35rem;
  font-size: 0.85rem;
  font-family: inherit;
}

.save-btn-sm {
  padding: 0.35rem 0.75rem;
  font-size: 0.8rem;
}
</style>
