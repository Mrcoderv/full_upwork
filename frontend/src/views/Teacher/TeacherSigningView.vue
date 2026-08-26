<template>
  <v-container fluid>
    <h1 class="mb-1">Betygssignering</h1>
    <p class="text-body-2 mb-4">
      Betygskataloger som har skickats till dig för digital signering via Scrive.
    </p>

    <v-alert v-if="!loading && catalogs.length === 0" type="info" variant="tonal" class="mb-4">
      Inga betygskataloger väntar på signering.
    </v-alert>

    <v-card v-else>
      <v-card-text>
        <v-table>
          <thead>
            <tr>
              <th>Titel</th>
              <th>Elev</th>
              <th>Kurs</th>
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
              <td>
                <v-chip :color="statusColor(c.status)" size="small">{{ statusLabel(c.status) }}</v-chip>
              </td>
              <td>{{ c.sentAt ? formatDate(c.sentAt) : '–' }}</td>
              <td class="text-end">
                <v-btn size="small" variant="text" @click="downloadCatalog(c)">PDF</v-btn>
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
    const { data } = await client.get('/grade-catalogs/my')
    catalogs.value = data
  } catch (err) {
    toast.error(err.message || 'Kunde inte hämta betygskatalogerna.')
  } finally {
    loading.value = false
  }
}

const canRefresh = (c) => Boolean(c.scriveDocumentId) && c.status !== 'closed'

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
