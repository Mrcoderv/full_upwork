<template>
  <v-container fluid>
    <h1 class="mb-1">Betygsrapporter</h1>
    <p class="text-body-2 mb-4">
      Ladda upp betygskataloger (PDF) en i taget och skicka dem för digital signering via Scrive.
    </p>

    <v-card class="mb-6" variant="tonal">
      <v-card-title>Ladda upp betygskatalog</v-card-title>
      <v-card-text>
        <v-form @submit.prevent="uploadCatalog">
          <v-row>
            <v-col cols="12" md="4">
              <v-file-input
                v-model="uploadFile"
                label="PDF"
                accept="application/pdf,.pdf"
                :disabled="uploading"
                show-size
                required
              />
            </v-col>
            <v-col cols="12" md="4">
              <v-autocomplete
                v-model="upload.studentId"
                label="Elev (valfritt)"
                :items="studentOptions"
                item-title="name"
                item-value="id"
                clearable
                :loading="searchingStudents"
                no-data-text="Sök minst 3 tecken"
                @update:search="onStudentSearch"
              />
            </v-col>
            <v-col cols="12" md="4">
              <v-text-field v-model="upload.courseName" label="Kurs (valfritt)" />
            </v-col>
            <v-col cols="12" md="4">
              <v-text-field
                v-model="upload.teacherEmail"
                label="Lärarens e-post (valfritt – hämtas från eleven annars)"
              />
            </v-col>
            <v-col cols="12" md="4">
              <v-text-field v-model="upload.teacherName" label="Lärarens namn (valfritt)" />
            </v-col>
            <v-col cols="12">
              <v-btn type="submit" color="primary" :loading="uploading" :disabled="!uploadFile">
                Ladda upp
              </v-btn>
            </v-col>
          </v-row>
        </v-form>
      </v-card-text>
    </v-card>

    <v-card>
      <v-card-title>Uppladdade betygskataloger</v-card-title>
      <v-card-text>
        <v-table>
          <thead>
            <tr>
              <th>Titel</th>
              <th>Elev</th>
              <th>Kurs</th>
              <th>Lärare</th>
              <th>Status</th>
              <th>Skickad</th>
              <th class="text-end">Åtgärder</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="c in catalogs" :key="c._id">
              <td>{{ c.title }}</td>
              <td>{{ c.studentName || '–' }}</td>
              <td>{{ c.courseName || '–' }}</td>
              <td>{{ c.teacherName || c.teacherEmail || '–' }}</td>
              <td>
                <v-chip :color="statusColor(c.status)" size="small">{{ statusLabel(c.status) }}</v-chip>
              </td>
              <td>{{ c.sentAt ? formatDate(c.sentAt) : '–' }}</td>
              <td class="text-end">
                <v-btn size="small" variant="text" @click="downloadCatalog(c)">PDF</v-btn>
                <v-btn
                  v-if="canSend(c)"
                  size="small"
                  color="primary"
                  variant="outlined"
                  :loading="isAction(c._id, 'send')"
                  @click="sendForSigning(c)"
                >
                  Skicka för signering
                </v-btn>
                <v-btn
                  v-if="canRefresh(c)"
                  size="small"
                  variant="text"
                  :loading="isAction(c._id, 'refresh')"
                  @click="refreshStatus(c)"
                >
                  Uppdatera status
                </v-btn>
              </td>
            </tr>
            <tr v-if="catalogs.length === 0 && !loading">
              <td colspan="7" class="text-center text-grey">Inga betygskataloger ännu.</td>
            </tr>
          </tbody>
        </v-table>
      </v-card-text>
    </v-card>
  </v-container>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import client from '@/api/client.js'
import { useToast } from '@/composables/useToast.js'

const toast = useToast()

const catalogs = ref([])
const loading = ref(false)
const uploading = ref(false)
const uploadFile = ref(null)
const upload = ref({ studentId: null, courseName: '', teacherEmail: '', teacherName: '' })
const studentOptions = ref([])
const searchingStudents = ref(false)
const actionId = ref(null)
const actionName = ref('')

const STATUS_LABELS = {
  uploaded: 'Uppladdad',
  sending: 'Skickas…',
  pending: 'Väntar på signering',
  closed: 'Signerad (låst)',
  canceled: 'Avbruten',
  timedout: 'Tidsutgången',
  rejected: 'Avvisad',
  document_error: 'Dokumentfel',
  failed: 'Misslyckad',
}

const STATUS_COLORS = {
  uploaded: 'grey',
  sending: 'blue',
  pending: 'warning',
  closed: 'success',
  canceled: 'error',
  timedout: 'error',
  rejected: 'error',
  document_error: 'error',
  failed: 'error',
}

const statusLabel = (status) => STATUS_LABELS[status] || status
const statusColor = (status) => STATUS_COLORS[status] || 'grey'

const formatDate = (value) =>
  new Date(value).toLocaleString('sv-SE', { dateStyle: 'short', timeStyle: 'short' })

const isAction = (id, name) => actionId.value === id && actionName.value === name

const loadCatalogs = async () => {
  loading.value = true
  try {
    const { data } = await client.get('/grade-catalogs')
    catalogs.value = data
  } catch (err) {
    toast.error(err.message || 'Kunde inte hämta betygskatalogerna.')
  } finally {
    loading.value = false
  }
}

const onStudentSearch = async (query) => {
  if (!query || query.trim().length < 3) {
    studentOptions.value = []
    return
  }
  searchingStudents.value = true
  try {
    const { data } = await client.get(`/search?q=${encodeURIComponent(query.trim())}&type=Användare`)
    studentOptions.value = (data || []).filter((r) => r.type === 'Elev')
  } catch (err) {
    studentOptions.value = []
  } finally {
    searchingStudents.value = false
  }
}

const uploadCatalog = async () => {
  if (!uploadFile.value) return
  uploading.value = true
  try {
    const form = new FormData()
    form.append('file', uploadFile.value)
    if (upload.value.studentId) form.append('studentId', upload.value.studentId)
    if (upload.value.courseName) form.append('courseName', upload.value.courseName)
    if (upload.value.teacherEmail) form.append('teacherEmail', upload.value.teacherEmail)
    if (upload.value.teacherName) form.append('teacherName', upload.value.teacherName)

    await client.post('/grade-catalogs', form)
    toast.success('Betygskatalogen laddades upp.')
    uploadFile.value = null
    upload.value = { studentId: null, courseName: '', teacherEmail: '', teacherName: '' }
    await loadCatalogs()
  } catch (err) {
    toast.error(err.message || 'Kunde inte ladda upp betygskatalogen.')
  } finally {
    uploading.value = false
  }
}

const canSend = (c) => ['uploaded', 'failed'].includes(c.status)
const canRefresh = (c) => Boolean(c.scriveDocumentId) && c.status !== 'closed'

const sendForSigning = async (c) => {
  actionId.value = c._id
  actionName.value = 'send'
  try {
    const { data } = await client.post(`/grade-catalogs/${c._id}/send`)
    toast.success(`Skickad för signering till ${data.teacherEmail || 'läraren'}.`)
    await loadCatalogs()
  } catch (err) {
    toast.error(err.message || 'Kunde inte skicka för signering.')
  } finally {
    actionId.value = null
    actionName.value = ''
  }
}

const refreshStatus = async (c) => {
  actionId.value = c._id
  actionName.value = 'refresh'
  try {
    const { data } = await client.post(`/grade-catalogs/${c._id}/refresh`)
    if (data.status === 'closed') {
      toast.success('Katalogen är signerad och låst.')
    } else {
      toast.info(`Status: ${statusLabel(data.status)}`)
    }
    await loadCatalogs()
  } catch (err) {
    toast.error(err.message || 'Kunde inte uppdatera status.')
  } finally {
    actionId.value = null
    actionName.value = ''
  }
}

const downloadCatalog = async (c) => {
  try {
    let catalog = c
    if (!c.pdfData) {
      const { data } = await client.get(`/grade-catalogs/${c._id}`)
      catalog = data
    }
    if (!catalog.pdfData) {
      toast.error('Katalogen har ingen PDF.')
      return
    }
    const bytes = atob(catalog.pdfData)
    const arr = new Uint8Array(bytes.length)
    for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i)
    const blob = new Blob([arr], { type: 'application/pdf' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = catalog.filename || `${catalog.title}.pdf`
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  } catch (err) {
    toast.error(err.message || 'Kunde inte ladda ner katalogen.')
  }
}

onMounted(loadCatalogs)
</script>
