<template>
  <div class="apl-tab-container">
    <div class="apl-header">
      <h2><v-icon left>mdi-folder-library</v-icon>APL Information</h2>
      <div class="apl-header-actions">
        <v-text-field
          v-model="search"
          placeholder="Sök elev..."
          append-icon="mdi-magnify"
          dense
          clearable
          class="search-field"
        />
        <v-btn v-if="isCoordinator" color="primary" size="small" :loading="autoTransitioning" @click="runAutoTransition">
          <v-icon left size="small">mdi-autorenew</v-icon>
          Kör auto-status
        </v-btn>
      </div>
    </div>

    <div v-if="loading" class="loading-state">Laddar APL-data...</div>

    <div v-else class="apl-content">
      <!-- Per-student APL period info -->
      <div v-if="student" class="apl-period-section">
        <div v-if="aplRecord" class="apl-record-details">
          <div class="apl-period-row">
            <h4>APL-period</h4>
            <p v-if="aplRecord.internshipStartDate">Start: {{ formatDate(aplRecord.internshipStartDate) }}</p>
            <p v-else-if="aplRecord.aplStartDate">Start: {{ formatDate(aplRecord.aplStartDate) }}</p>
            <p v-if="aplRecord.internshipEndDate">Slut: {{ formatDate(aplRecord.internshipEndDate) }}</p>
            <p v-else-if="aplRecord.aplEndDate">Slut: {{ formatDate(aplRecord.aplEndDate) }}</p>
            <p v-if="aplRecord.aplWeeksRemaining !== null && aplRecord.aplWeeksRemaining !== undefined">
              {{ aplRecord.aplWeeksRemaining }} veckor kvar
            </p>
          </div>

          <!-- Status Control -->
          <div v-if="isCoordinator" class="apl-status-control">
            <label>APL-status:</label>
            <select v-model="aplRecord.status" :disabled="updatingStatus" class="status-select" @change="handleStatusChange">
              <option v-for="s in statusOptions" :key="s.value" :value="s.value">{{ s.label }}</option>
            </select>
            <span v-if="updatingStatus" class="updating-text">Uppdaterar...</span>
            <span v-if="aplRecord.aplStatusAuto" class="auto-badge">AUTO</span>
          </div>
          <div v-else class="apl-status-display">
            <span class="status-chip" :class="'status-' + (aplRecord.status || 'GRAY').toLowerCase()">
              {{ getStatusLabel(aplRecord.status) }}
            </span>
            <span v-if="aplRecord.aplStatusAuto" class="auto-badge">AUTO</span>
          </div>

          <!-- Auto-RED note -->
          <div v-if="aplRecord.status === 'RED' && aplRecord.aplStatusAuto" class="auto-red-note">
            <v-alert type="warning" density="compact">
              Auto-röd: {{ aplRecord.aplWeeksRemaining }} {{ aplRecord.aplWeeksRemaining === 1 ? 'vecka' : 'veckor' }}
              <span v-if="aplRecord.aplWeeksRemaining <= 2"> — Snart slut</span>
            </v-alert>
          </div>

          <!-- Placement Details (coordinator only) -->
          <div v-if="isCoordinator" class="apl-details-section">
            <h4>Praktikplats</h4>
            <div class="apl-form-grid">
              <div class="form-group">
                <label>Företag/Plats</label>
                <input v-model="editForm.placementCompany" class="form-control" placeholder="Företagsnamn" />
              </div>
              <div class="form-group">
                <label>Kontaktperson</label>
                <input v-model="editForm.placementContact" class="form-control" placeholder="Kontaktperson" />
              </div>
              <div class="form-group">
                <label>Adress</label>
                <input v-model="editForm.placementAddress" class="form-control" placeholder="Adress" />
              </div>
              <div class="form-group">
                <label>Praktikstart</label>
                <input v-model="editForm.internshipStartDate" type="date" class="form-control" />
              </div>
              <div class="form-group">
                <label>Praktikslut</label>
                <input v-model="editForm.internshipEndDate" type="date" class="form-control" />
              </div>
            </div>

            <h4>Anteckningar</h4>
            <textarea v-model="editForm.notes" class="form-control" rows="3" placeholder="Anteckningar om praktiken..."></textarea>

            <h4>Krav</h4>
            <textarea v-model="editForm.requirements" class="form-control" rows="2" placeholder="Särskilda krav..."></textarea>

            <v-btn color="primary" size="small" :loading="savingDetails" class="mt-3" @click="saveRecordDetails">
              Spara detaljer
            </v-btn>
          </div>

          <!-- Read-only placement info (non-coordinator) -->
          <div v-else-if="aplRecord.placementCompany" class="apl-details-section">
            <h4>Praktikplats</h4>
            <p><strong>Företag:</strong> {{ aplRecord.placementCompany }}</p>
            <p v-if="aplRecord.placementContact"><strong>Kontakt:</strong> {{ aplRecord.placementContact }}</p>
            <p v-if="aplRecord.placementAddress"><strong>Adress:</strong> {{ aplRecord.placementAddress }}</p>
          </div>

          <!-- Notes display (read-only) -->
          <div v-if="aplRecord.notes && !isCoordinator" class="apl-details-section">
            <h4>Anteckningar</h4>
            <p>{{ aplRecord.notes }}</p>
          </div>

          <!-- CV Upload -->
          <div class="apl-details-section">
            <h4>CV</h4>
            <div v-if="aplRecord.cvDocId" class="document-info">
              <v-icon size="small" color="green">mdi-file-document</v-icon>
              <span>{{ aplRecord.cvDocId.filename }}</span>
              <span class="doc-date">({{ formatDate(aplRecord.cvDocId.uploadDate) }})</span>
            </div>
            <div v-if="isCoordinator" class="upload-section">
              <input ref="cvFileInput" type="file" accept=".pdf,.doc,.docx" style="display: none" @change="handleCvUpload" />
              <v-btn size="small" variant="outlined" :loading="uploadingCv" @click="cvFileInput?.click()">
                <v-icon left size="small">mdi-upload</v-icon>
                {{ aplRecord.cvDocId ? 'Byt CV' : 'Ladda upp CV' }}
              </v-btn>
            </div>
          </div>

          <!-- APL Contract Upload -->
          <div class="apl-details-section">
            <h4>APL-kontrakt</h4>
            <div v-if="aplRecord.contractDocId" class="document-info">
              <v-icon size="small" color="green">mdi-file-document</v-icon>
              <span>{{ aplRecord.contractDocId.filename }}</span>
              <span class="doc-date">({{ formatDate(aplRecord.contractDocId.uploadDate) }})</span>
            </div>
            <div v-if="isCoordinator" class="upload-section">
              <input ref="contractFileInput" type="file" accept=".pdf" style="display: none" @change="handleContractUpload" />
              <v-btn size="small" variant="outlined" :loading="uploadingContract" @click="contractFileInput?.click()">
                <v-icon left size="small">mdi-upload</v-icon>
                {{ aplRecord.contractDocId ? 'Byt kontrakt' : 'Ladda upp kontrakt' }}
              </v-btn>
            </div>
          </div>

          <!-- Status History -->
          <div v-if="aplRecord.statusHistory?.length" class="apl-details-section">
            <h4>Statushistorik</h4>
            <div class="status-history-list">
              <div v-for="(entry, idx) in aplRecord.statusHistory.slice().reverse()" :key="idx" class="status-history-item">
                <span class="status-chip status-small" :class="'status-' + (entry.status || 'gray').toLowerCase()">
                  {{ getStatusLabel(entry.status) }}
                </span>
                <span class="history-date">{{ formatDate(entry.changedAt) }}</span>
                <span v-if="entry.reason" class="history-reason">{{ entry.reason }}</span>
              </div>
            </div>
          </div>
        </div>
        <div v-else class="no-record">
          <p>Ingen APL-registrering hittades för denna elev.</p>
          <v-btn v-if="isCoordinator" color="primary" size="small" @click="createRecord">
            Skapa APL-registrering
          </v-btn>
        </div>
      </div>

      <!-- Status Overview (when no student prop — global view) -->
      <div v-if="!student" class="apl-status-overview">
        <v-row>
          <v-col v-for="s in statusOptions" :key="s.value" cols="6" sm="4" md="2">
            <v-card
              class="status-summary-card"
              :class="s.value.toLowerCase()"
              :style="activeFilter === s.value ? 'outline: 2px solid #1976d2' : ''"
              style="cursor: pointer"
              @click="toggleFilter(s.value)"
            >
              <v-card-title>{{ s.label }}</v-card-title>
              <v-card-text>{{ statusCounts[s.value] || 0 }} elever</v-card-text>
            </v-card>
          </v-col>
        </v-row>
      </div>

      <!-- APL List (global view) -->
      <div v-if="!student && filteredRecords.length > 0" class="apl-list">
        <v-divider></v-divider>
        <h4>APL-register ({{ filteredRecords.length }})</h4>
        <v-data-table
          :items="filteredRecords"
          :items-per-page="10"
          :search="search"
          no-data-text="Inga APL-insättningar"
        >
          <template #headers>
            <tr>
              <th>Elev</th>
              <th>Status</th>
              <th>Periodstart</th>
              <th>Periodslut</th>
              <th>Veckor kvar</th>
              <th>Praktikplats</th>
              <th>Aktion</th>
            </tr>
          </template>
          <template #item="{ item }">
            <tr>
              <td>{{ item.studentId?.name || '—' }}</td>
              <td>
                <v-chip :color="getStatusColor(item.status)" size="small" label>
                  {{ getStatusLabel(item.status) }}
                </v-chip>
              </td>
              <td>{{ formatDate(item.internshipStartDate || item.aplStartDate) }}</td>
              <td>{{ formatDate(item.internshipEndDate || item.aplEndDate) }}</td>
              <td v-if="item.aplWeeksRemaining !== null && item.aplWeeksRemaining !== undefined">
                <v-chip :color="getWeeksRemainingColor(item.aplWeeksRemaining)" size="small" label>
                  {{ item.aplWeeksRemaining }} veckor
                </v-chip>
              </td>
              <td v-else>—</td>
              <td>{{ item.placementCompany || '—' }}</td>
              <td>
                <v-btn size="small" color="primary" variant="text" @click="viewDetails(item.studentId?._id)">
                  Detaljer
                </v-btn>
              </td>
            </tr>
          </template>
        </v-data-table>
      </div>

      <div v-if="!student && !loading && filteredRecords.length === 0" class="no-students">
        <v-icon size="48" color="grey">mdi-account-circle</v-icon>
        <p>Inga APL-registreringar hittades</p>
      </div>
    </div>
  </div>
</template>

<script>
import { ref, reactive, onMounted, computed, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useStore } from 'vuex'
import client from '@/api/client.js'
import { useToast } from '@/composables/useToast.js'

export default {
  name: 'AplTab',
  props: {
    student: { type: Object, default: null },
  },
  setup(props) {
    const router = useRouter()
    const store = useStore()
    const toast = useToast()

    const allRecords = ref([])
    const aplRecord = ref(null)
    const loading = ref(false)
    const search = ref('')
    const activeFilter = ref(null)
    const updatingStatus = ref(false)
    const savingDetails = ref(false)
    const uploadingCv = ref(false)
    const uploadingContract = ref(false)
    const autoTransitioning = ref(false)

    const editForm = reactive({
      placementCompany: '',
      placementContact: '',
      placementAddress: '',
      internshipStartDate: '',
      internshipEndDate: '',
      notes: '',
      requirements: '',
    })

    const isCoordinator = computed(() => {
      const role = store.getters.userRole || store.state.user?.role
      return ['admin', 'systemadmin', 'coordinator'].includes(role)
    })

    const statusOptions = [
      { value: 'GRAY', label: 'Grå — Ny elev' },
      { value: 'BLUE', label: 'Blå — Kontaktad' },
      { value: 'YELLOW', label: 'Gul — APL på gång' },
      { value: 'PURPLE', label: 'Lila — Behöver uppföljning' },
      { value: 'RED', label: 'Röd — Snart slut' },
      { value: 'GREEN', label: 'Grön — Klar praktik' },
    ]

    const filteredRecords = computed(() => {
      let records = allRecords.value
      if (activeFilter.value) {
        records = records.filter(r => r.status === activeFilter.value)
      }
      if (search.value) {
        const q = search.value.toLowerCase()
        records = records.filter(r =>
          r.studentId?.name?.toLowerCase().includes(q) ||
          r.placementCompany?.toLowerCase().includes(q)
        )
      }
      return records
    })

    const statusCounts = computed(() => {
      const counts = {}
      for (const r of allRecords.value) {
        counts[r.status] = (counts[r.status] || 0) + 1
      }
      return counts
    })

    function getStatusLabel(status) {
      const labels = { GRAY: 'Grå', BLUE: 'Blå', YELLOW: 'Gul', PURPLE: 'Lila', RED: 'Röd', GREEN: 'Grön' }
      return labels[status] || status
    }

    function getStatusColor(status) {
      const map = { GRAY: 'grey', BLUE: 'blue', YELLOW: 'yellow', PURPLE: 'purple', RED: 'red', GREEN: 'green' }
      return map[status] || 'grey'
    }

    function getWeeksRemainingColor(weeks) {
      if (weeks <= 2) return 'red'
      if (weeks <= 4) return 'orange'
      return 'green'
    }

    function formatDate(dateStr) {
      if (!dateStr) return '—'
      const d = new Date(dateStr)
      if (isNaN(d.getTime())) return '—'
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    }

    function toggleFilter(status) {
      activeFilter.value = activeFilter.value === status ? null : status
    }

    function viewDetails(studentId) {
      if (studentId) router.push(`/student/${studentId}`)
    }

    async function loadRecords() {
      loading.value = true
      try {
        const { data } = await client.get('/apl/records', { params: { includeCompleted: 'true' } })
        allRecords.value = data || []
      } catch {
        allRecords.value = []
      } finally {
        loading.value = false
      }
    }

    async function loadStudentRecord() {
      if (!props.student?._id) return
      loading.value = true
      try {
        const { data } = await client.get(`/apl/records/${props.student._id}`)
        aplRecord.value = data
        editForm.placementCompany = data.placementCompany || ''
        editForm.placementContact = data.placementContact || ''
        editForm.placementAddress = data.placementAddress || ''
        editForm.internshipStartDate = data.internshipStartDate ? data.internshipStartDate.slice(0, 10) : ''
        editForm.internshipEndDate = data.internshipEndDate ? data.internshipEndDate.slice(0, 10) : ''
        editForm.notes = data.notes || ''
        editForm.requirements = data.requirements || ''
      } catch {
        aplRecord.value = null
      } finally {
        loading.value = false
      }
    }

    async function handleStatusChange() {
      if (!aplRecord.value || !props.student?._id) return
      updatingStatus.value = true
      try {
        await client.patch(`/apl/records/${props.student._id}/status`, {
          status: aplRecord.value.status,
        })
        toast.success('APL-status uppdaterad')
        await loadStudentRecord()
      } catch (error) {
        toast.error(error.response?.data?.error || 'Kunde inte uppdatera status')
        await loadStudentRecord()
      } finally {
        updatingStatus.value = false
      }
    }

    async function saveRecordDetails() {
      if (!props.student?._id) return
      savingDetails.value = true
      try {
        await client.put(`/apl/records/${props.student._id}`, {
          placementCompany: editForm.placementCompany,
          placementContact: editForm.placementContact,
          placementAddress: editForm.placementAddress,
          internshipStartDate: editForm.internshipStartDate || null,
          internshipEndDate: editForm.internshipEndDate || null,
          notes: editForm.notes,
          requirements: editForm.requirements,
        })
        toast.success('APL-detaljer sparade')
        await loadStudentRecord()
      } catch (error) {
        toast.error(error.response?.data?.error || 'Kunde inte spara detaljer')
      } finally {
        savingDetails.value = false
      }
    }

    async function handleCvUpload(event) {
      const file = event.target.files[0]
      if (!file || !props.student?._id) return
      uploadingCv.value = true
      try {
        const formData = new FormData()
        formData.append('file', file)
        formData.append('type', 'APL_CV')
        formData.append('studentId', props.student._id)
        const { data } = await client.post('/documents/upload', formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        })
        await client.put(`/apl/records/${props.student._id}`, { cvDocId: data.document?._id || data._id })
        toast.success('CV uppladdat')
        await loadStudentRecord()
      } catch (error) {
        toast.error(error.response?.data?.error || 'Kunde inte ladda upp CV')
      } finally {
        uploadingCv.value = false
        event.target.value = ''
      }
    }

    async function handleContractUpload(event) {
      const file = event.target.files[0]
      if (!file || !props.student?._id) return
      uploadingContract.value = true
      try {
        const formData = new FormData()
        formData.append('file', file)
        formData.append('type', 'APL_CONTRACT')
        formData.append('studentId', props.student._id)
        const { data } = await client.post('/documents/upload', formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        })
        await client.put(`/apl/records/${props.student._id}`, { contractDocId: data.document?._id || data._id })
        toast.success('Kontrakt uppladdat')
        await loadStudentRecord()
      } catch (error) {
        toast.error(error.response?.data?.error || 'Kunde inte ladda upp kontrakt')
      } finally {
        uploadingContract.value = false
        event.target.value = ''
      }
    }

    async function createRecord() {
      if (!props.student?._id) return
      try {
        await client.put(`/apl/records/${props.student._id}`, {})
        toast.success('APL-registrering skapad')
        await loadStudentRecord()
      } catch (error) {
        toast.error(error.response?.data?.error || 'Kunde inte skapa APL-registrering')
      }
    }

    async function runAutoTransition() {
      autoTransitioning.value = true
      try {
        const { data } = await client.post('/apl/auto-transition')
        toast.success(`${data.transitions.length} automatisk(a) övergång(ar)`)
        if (props.student?._id) {
          await loadStudentRecord()
        } else {
          await loadRecords()
        }
      } catch (error) {
        toast.error(error.response?.data?.error || 'Kunde inte köra auto-status')
      } finally {
        autoTransitioning.value = false
      }
    }

    onMounted(() => {
      if (props.student?._id) {
        loadStudentRecord()
      } else {
        loadRecords()
      }
    })

    watch(() => props.student, (newStudent) => {
      if (newStudent?._id) loadStudentRecord()
    })

    const cvFileInput = ref(null)
    const contractFileInput = ref(null)

    return {
      allRecords, aplRecord, loading, search, activeFilter,
      updatingStatus, savingDetails, uploadingCv, uploadingContract,
      autoTransitioning, editForm, isCoordinator, statusOptions,
      filteredRecords, statusCounts,
      getStatusLabel, getStatusColor, getWeeksRemainingColor,
      formatDate, toggleFilter, viewDetails,
      handleStatusChange, saveRecordDetails,
      handleCvUpload, handleContractUpload,
      createRecord, runAutoTransition,
      cvFileInput, contractFileInput,
    }
  },
}
</script>

<style scoped>
.apl-tab-container {
  padding: 24px;
  max-width: 1200px;
  margin: 0 auto;
}
.apl-header {
  margin-bottom: 24px;
  padding-bottom: 16px;
  border-bottom: 1px solid #e0e0e0;
}
.apl-header-actions {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 8px;
}
.search-field {
  max-width: 400px;
}
.apl-record-details {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.apl-period-section {
  margin-bottom: 16px;
}
.apl-period-row {
  background: #f5f5f5;
  padding: 12px 16px;
  border-radius: 8px;
}
.apl-period-row h4 { margin: 0 0 4px 0; }
.apl-period-row p { margin: 2px 0; font-size: 14px; }
.auto-red-note { margin-top: 8px; }
.apl-status-control {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 16px;
  background: #f8f9fa;
  border-radius: 8px;
}
.apl-status-control label { font-weight: 600; }
.status-select {
  padding: 6px 10px;
  border: 1px solid #dee2e6;
  border-radius: 4px;
  font-size: 14px;
  min-width: 200px;
}
.updating-text { color: #666; font-size: 13px; font-style: italic; }
.auto-badge {
  background: #dc3545;
  color: white;
  padding: 2px 8px;
  border-radius: 12px;
  font-size: 10px;
  font-weight: 700;
}
.apl-status-display {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 16px;
  background: #f8f9fa;
  border-radius: 8px;
}
.status-chip {
  padding: 4px 12px;
  border-radius: 16px;
  font-size: 13px;
  font-weight: 500;
  color: white;
}
.status-chip.status-gray { background: #78909c; }
.status-chip.status-blue { background: #3f51b5; }
.status-chip.status-yellow { background: #fdd835; color: #333; }
.status-chip.status-purple { background: #9c27b0; }
.status-chip.status-red { background: #f44336; }
.status-chip.status-green { background: #4caf50; }
.status-small { font-size: 11px; padding: 2px 8px; }
.apl-details-section {
  padding: 12px 16px;
  background: #fafafa;
  border-radius: 8px;
  border: 1px solid #e9ecef;
}
.apl-details-section h4 { margin: 0 0 8px 0; font-size: 14px; color: #495057; }
.apl-form-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  margin-bottom: 12px;
}
.apl-form-grid .form-group { display: flex; flex-direction: column; gap: 4px; }
.apl-form-grid label { font-size: 13px; font-weight: 500; color: #495057; }
.form-control {
  padding: 6px 10px;
  border: 1px solid #dee2e6;
  border-radius: 4px;
  font-size: 14px;
  font-family: inherit;
}
textarea.form-control { resize: vertical; }
.document-info {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px;
  background: #e8f5e9;
  border-radius: 4px;
  font-size: 13px;
}
.doc-date { color: #666; font-size: 12px; }
.upload-section { margin-top: 8px; }
.status-history-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-height: 200px;
  overflow-y: auto;
}
.status-history-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 8px;
  border-radius: 4px;
  background: #f5f5f5;
  font-size: 13px;
}
.history-date { color: #666; }
.history-reason { color: #495057; font-style: italic; }
.no-record {
  text-align: center;
  padding: 40px;
  color: #666;
}
.apl-status-overview { margin-bottom: 24px; }
.status-summary-card {
  background: white;
  border-radius: 8px;
  padding: 16px;
  text-align: center;
  box-shadow: 0 1px 3px rgba(0,0,0,0.1);
  min-height: 80px;
  transition: outline 0.15s;
}
.status-summary-card.gray { border-top: 4px solid #78909c; }
.status-summary-card.blue { border-top: 4px solid #3f51b5; }
.status-summary-card.yellow { border-top: 4px solid #fdd835; }
.status-summary-card.purple { border-top: 4px solid #9c27b0; }
.status-summary-card.red { border-top: 4px solid #f44336; }
.status-summary-card.green { border-top: 4px solid #4caf50; }
.apl-list { margin-top: 20px; }
.no-students { text-align: center; padding: 40px; color: #666; }
</style>
