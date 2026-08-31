<template>
  <div class="summary centered">
    <div class="summary-header">
      <h2>APL Statusöversikt</h2>
      <div class="header-actions">
        <button class="toggle-btn" title="Visa/dölj statusöversikt" @click="summaryExpanded = !summaryExpanded">
          <v-icon size="20">{{ summaryExpanded ? 'mdi-chevron-up' : 'mdi-chevron-down' }}</v-icon>
        </button>
        <button class="refresh-btn" title="Uppdatera data" @click="fetchStudents">
          <v-icon size="20">mdi-refresh</v-icon>
        </button>
      </div>
    </div>
    <div v-show="summaryExpanded" class="summary-content">
      <div style="margin-bottom: 10px">
        <v-btn color="primary" small @click="openAddStudentDialog">Lägg till elev till APL</v-btn>
      </div>
      <table class="table">
        <tbody>
          <tr v-for="status in statusMap" :key="status.key">
            <td>
              <StatusBadge :hue="status.hue" :label="status.label" />
            </td>
            <td>
              <strong class="tnum">{{ statusCounts[status.key] }}</strong>
            </td>
          </tr>
          <tr>
            <td colspan="2" style="padding-top: 6px">
              Totalt antal studenter:
              <strong class="tnum">{{ totalStudents }}</strong>
            </td>
          </tr>
        </tbody>
      </table>
      <div class="comment-order-toggle">
        <label>
          <input v-model="commentAscOrder" type="checkbox" />
          Visa senaste kommentar längst ner
        </label>
      </div>
      <div class="color-filter-section">
        <label>Filtrera efter färg:</label>
        <select v-model="colorFilter" class="color-filter-select">
          <option value="">Alla</option>
          <option v-for="status in allStatusMap" :key="status.key" :value="status.key">{{ status.label }}</option>
        </select>
      </div>
    </div>
  </div>
  <div class="apl-board">
    <div
      v-if="copied"
      class="copied-floating"
      :style="{ top: copiedPosition.y + 'px', left: copiedPosition.x + 'px' }"
    >
      Kopierat
    </div>
    <div
      v-for="status in statusMap"
      :key="status.key"
      class="column"
      :data-hue="status.hue"
      @dragover.prevent
      @drop="handleDrop($event, status.key)"
    >
      <h3 class="tnum">{{ status.label }} ({{ (studentsByStatus[status.key] || []).length }})</h3>
      <div
        v-for="student in studentsByStatus[status.key] || []"
        :key="student._id"
        class="student-card"
        :class="{ 'is-auto-red': student.aplStatusAuto }"
        draggable="true"
        @dragstart="handleDragStart($event, student)"
        @click="openComments(student)"
      >
        <router-link :to="`/student/${student._id}`" @click.stop>{{ student.name }}</router-link>
        <span
          v-if="student.aplStatusAuto"
          class="auto-red-badge"
          title="Auto-röd – APL-perioden slutar snart"
        >AUTO</span>
        <!-- Behind-schedule badge -->
        <span
          v-if="isBehindSchedule(student)"
          class="auto-behind-schedule-badge"
          title="Bak i schema – påbörjad för minst 14 dagar sedan"
        >BAK i schema</span>
        <!-- File uploaded badge -->
        <v-icon
          v-if="hasFiles(student._id)"
          size="16"
          color="green"
          class="ml-1"
          title="Filer uppladdade"
        >
mdi-paperclip
</v-icon>
        <v-icon
          v-if="commentStatus(student)"
          :class="['comment-icon', { pulse: commentStatus(student) === 'unseen' }]"
          :color="commentStatus(student) === 'unseen' ? 'blue' : 'green'"
          size="24"
          title="Kommentarstatus"
        >
          {{ commentStatus(student) === 'unseen' ? 'mdi-note-text' : 'mdi-pencil' }}
        </v-icon>
      </div>
      <div
        v-if="(studentsByStatus[status.key] || []).length === 0"
        class="empty-column"
      >
        Inga studenter i denna kolumn
      </div>
    </div>
    <v-dialog v-model="dialog" max-width="600px">
      <v-card v-if="selectedStudent" class="dialog-card">
        <v-btn icon class="dialog-close-btn" @click="closeDialog">
          <v-icon>mdi-close</v-icon>
        </v-btn>
        <v-card-title>
          <span
            :class="{ clickable: true, blinkGreen: blinkedField === 'name' }"
            @click="handleCopy(selectedStudent?.name, 'name', $event)"
          >
            <div>{{ selectedStudent?.name }}</div>
          </span>
        </v-card-title>
        <v-card-subtitle style="margin-top: 0px">
          <div class="contact-info">
            <span
              :class="{ clickable: true }"
              @click="handleCopy(selectedStudent?.email, 'email', $event)"
            >
              {{ selectedStudent?.email }}
            </span>
            <br />
            <span
              :class="{ clickable: true }"
              @click="handleCopy(selectedStudent?.phone, 'phone', $event)"
            >
              <div class="mb-2">{{ selectedStudent?.phone }}</div>
            </span>
          </div>
        </v-card-subtitle>

        <v-card-text v-if="selectedStudent" class="mb-0">
          <div class="education-summary">
            <div class="education-row">
              <strong>Kurspaket:</strong>
              <span>{{ packageNamesDisplay || '–' }}</span>
            </div>
            <div class="education-row">
              <strong>Utbildning:</strong>
              <span>Start: {{ earliestStartDisplay || '–' }}</span>
              <span class="dot-sep">•</span>
              <span>Slut: {{ latestEndDisplay || '–' }}</span>
            </div>
            <div v-if="selectedStudent.aplEndDate" class="education-row">
              <strong>APL-period:</strong>
              <span>{{ formatDateOnly(selectedStudent.aplStartDate) || '–' }} – {{ formatDateOnly(selectedStudent.aplEndDate) || '–' }}</span>
              <span v-if="selectedStudent.aplStatusAuto" class="auto-red-hint">
                Auto-röd ({{ selectedStudent.aplWeeksRemaining }} v kvar)
              </span>
            </div>
          </div>
        </v-card-text>

        <FileUploaderDownloader
          v-if="selectedStudent"
          :student-id="selectedStudent._id"
          :student-name="selectedStudent.name"
        />

        <div ref="commentContainerRef" class="comment-history-scroll">
          <template v-for="(entry, index) in getSortedComments" :key="index">
            <div class="comment-entry">
              <div class="comment-header">
                <div>
                  <strong>{{ entry.author || 'Okänd' }}</strong>
                </div>
                <div class="comment-actions">
                  <span>{{ formatDate(entry.date) }}</span>
                </div>
              </div>
              <div v-if="editingIndex !== index" class="comment-box">
                {{ entry.comment }}
              </div>
              <v-textarea
                v-else
                v-model="editedComment"
                auto-grow
                label="Redigera kommentar"
                rows="2"
                class="mb-2"
              />
              <div class="button-row">
                <v-btn
                  v-if="editingIndex === index"
                  color="green"
                  small
                  @click="saveEditedComment(index)"
                >
                  <v-icon size="x-small" left>mdi-content-save</v-icon>
                  Spara
                </v-btn>
                <v-btn v-if="editingIndex === index" color="grey" small @click="cancelEdit">
                  <v-icon size="x-small" left>mdi-cancel</v-icon>
                  Avbryt
                </v-btn>
                <v-btn
                  v-if="editingIndex !== index"
                  class="ml-1"
                  color="yellow darken-2"
                  icon
                  size="22"
                  @click="editComment(index)"
                >
                  <v-icon size="12">mdi-comment-edit</v-icon>
                </v-btn>
                <v-btn
                  v-if="canDelete(entry)"
                  color="red"
                  class="mr-1 mb-2"
                  size="22"
                  icon
                  @click="confirmDelete(index)"
                >
                  <v-icon size="16">mdi-delete</v-icon>
                </v-btn>
              </div>
            </div>
          </template>

          <div v-if="canComment">
            <v-textarea v-model="newComment" label="Lägg till kommentar" rows="3" auto-grow />
          </div>
        </div>

        <div class="button-row">
          <v-btn class="ml-3 mb-2" small color="green" @click="submitComment">Spara</v-btn>
          <v-btn class="ml-3 mb-2" small color="red" @click="removeFromApl(selectedStudent)">
            Ta bort från APL
          </v-btn>
          <v-btn class="mr-3 mb-2" small color="primary" @click="closeDialog">Stäng</v-btn>
        </div>
      </v-card>
    </v-dialog>

    <!-- Add student to APL dialog -->
    <v-dialog v-model="addStudentDialog" max-width="600px">
      <v-card>
        <v-card-title>Lägg till elev till APL</v-card-title>
        <v-card-text>
          <v-text-field
            v-model="searchQuery"
            label="Sök elev (minst 3 tecken)"
            clearable
            @input="onSearchInput"
          />
          <div v-if="isSearching" class="board-search-status">Söker...</div>
          <div v-if="searchError" class="board-search-error">
            {{ searchError }}
          </div>
          <v-list v-if="showSuggestions && suggestions.length">
            <v-list-item v-for="s in suggestions" :key="s.id" @click="selectSuggestion(s)">
              <v-list-item-title>{{ s.name }}</v-list-item-title>
              <v-list-item-subtitle>{{ s.extra }}</v-list-item-subtitle>
            </v-list-item>
          </v-list>
          <div v-else-if="showSuggestions && !isSearching && !searchError" class="board-search-status">
            Inga träffar
          </div>
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn text @click="closeAddDialog">Stäng</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <ConfirmDialog
      v-model="removeFromAplDialog"
      title="Ta bort från APL"
      :message="`Ta bort ${selectedStudent?.name || 'eleven'} från APL?`"
      confirm-label="Ta bort"
      cancel-label="Avbryt"
      danger
      @confirm="doRemoveFromApl"
    />
    <ConfirmDialog
      v-model="deleteCommentIndex"
      title="Ta bort kommentar"
      message="Är du säker på att du vill ta bort denna kommentar?"
      confirm-label="Ta bort"
      cancel-label="Avbryt"
      danger
      @confirm="doDeleteComment"
    />
  </div>
</template>

<script setup>
  import { ref, computed, onMounted, nextTick, watch } from 'vue'
  import client from '@/api/client.js'
  import { useStore } from 'vuex'
  import { useToast } from '@/composables/useToast.js'
  import FileUploaderDownloader from '../components/FileUploaderDownloader.vue'
  import ConfirmDialog from './base/ConfirmDialog.vue'
  import StatusBadge from './base/StatusBadge.vue'
  import { APL_STATUS, APL_STATUS_ORDER } from '@/utils/statusSystem.js'

  const toast = useToast()
  const props = defineProps({
    students: {
      type: Array,
      required: true,
    },
    filterType: {
      type: String,
      default: 'active', // 'active' or 'completed'
    },
  })

  const emit = defineEmits(['student-updated'])

  const store = useStore()
  const currentUser = computed(() => store.state.user)
  const currentUserId = computed(() => store.state.user?.userId?.toString() || '')
  const totalStudents = computed(() => filteredStudents.value.length)
  const fileCounts = ref({})

  const fetchFileCounts = async () => {
    const studentIds = (props.students || []).map(s => s._id).join(',')
    if (!studentIds) return
    try {
      const { data } = await client.get('/uploads/file-counts', { params: { studentIds } })
      fileCounts.value = data
    } catch {}
  }

  const hasFiles = (studentId) => {
    return (fileCounts.value[studentId] || 0) > 0
  }
// Behind-schedule detection: computes whether student's APL period has been active
// for at least 14 days based on the APL start date from education entries
const isBehindSchedule = (student) => {
  if (!student.aplStartDate) return false
  const startDate = new Date(student.aplStartDate)
  const now = new Date()
  const daysSinceStart = Math.round((now.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24))
  return daysSinceStart >= 14
}

  const commentAscOrder = ref(true)
  const summaryExpanded = ref(false)
  const colorFilter = ref('')
  const copied = ref(false)
  const blinkedField = ref('')
  const copiedPosition = ref({ x: 0, y: 0 })
  const dialog = ref(false)
  const selectedStudent = ref(null)
  const newComment = ref('')
  const editingIndex = ref(null)
  const editedComment = ref('')
  const draggedStudent = ref(null)
  const commentContainerRef = ref(null)

  const addStudentDialog = ref(false)
  const searchQuery = ref('')
  const suggestions = ref([])
  const isSearching = ref(false)
  const showSuggestions = ref(false)
  const searchError = ref('')
  const manualAplIds = ref(new Set())
  const excludedAplIds = ref(new Set())
  const removeFromAplDialog = ref(false)
  const deleteCommentIndex = ref(null)

  const loadManualAplIds = () => {
    try {
      const raw = localStorage.getItem('manualAplIds')
      if (raw) {
        const arr = JSON.parse(raw)
        manualAplIds.value = new Set(Array.isArray(arr) ? arr : [])
      }
    } catch {}
  }
  const saveManualAplIds = () => {
    try {
      localStorage.setItem('manualAplIds', JSON.stringify(Array.from(manualAplIds.value)))
      window.dispatchEvent(new CustomEvent('manualAplIdsUpdated'))
    } catch {}
  }
  const loadExcludedAplIds = () => {
    try {
      const raw = localStorage.getItem('excludedAplIds')
      if (raw) {
        const arr = JSON.parse(raw)
        excludedAplIds.value = new Set(Array.isArray(arr) ? arr : [])
      }
    } catch {}
  }
  const saveExcludedAplIds = () => {
    try {
      localStorage.setItem('excludedAplIds', JSON.stringify(Array.from(excludedAplIds.value)))
    } catch {}
  }

  const allStatusMap = computed(() => {
    return APL_STATUS_ORDER.map((key) => ({ key, ...APL_STATUS[key] }))
  })

  const statusMap = computed(() => {
    const allStatuses = allStatusMap.value
    if (props.filterType === 'completed') {
      return allStatuses.filter((s) => s.key === 'GREEN')
    }
    if (colorFilter.value) {
      return allStatuses.filter((s) => s.key === colorFilter.value)
    }
    return allStatuses
  })

  const filteredStudents = computed(() => {
    const baseFiltered = (props.students || []).filter((student) => {
      const studentId = String(student._id)
      if (student.dropout) return false
      if (excludedAplIds.value.has(studentId)) return false
      if (manualAplIds.value.has(studentId)) return true
      if (!Array.isArray(student.education)) return false
      return student.education.some((edu) => edu.type === 'CoursePackage')
    })

    if (props.filterType === 'completed') {
      // In "Avslutad" tab, only show GREEN students
      return baseFiltered.filter((s) => s.aplStatus === 'GREEN')
    }
    // In "Pågående" tab, show all students including GREEN (as redundancy)
    return baseFiltered
  })

  const studentsByStatus = computed(() => {
    if (!Array.isArray(filteredStudents.value)) {
      return {}
    }
    return statusMap.value.reduce((acc, status) => {
      acc[status.key] = filteredStudents.value.filter((s) => s.aplStatus === status.key)
      return acc
    }, {})
  })

  const statusCounts = computed(() => {
    return statusMap.value.reduce((acc, status) => {
      acc[status.key] = filteredStudents.value.filter((s) => s.aplStatus === status.key).length
      return acc
    }, {})
  })

  const roleRank = {
    guest: 0,
    user: 1,
    student: 2,
    coordinator: 3,
    specped: 4,
    syv: 5,
    teacher: 6,
    admin: 7,
    systemadmin: 8,
  }

  const commentStatus = (student) => {
    const history = student.commentHistory || []
    const userId = currentUserId.value
    if (!history.length) return null
    const hasUnseen = history.some(
      (c) => !(c.seenBy || []).map((id) => id.toString()).includes(userId)
    )
    return hasUnseen ? 'unseen' : 'seen'
  }

  const handleCopy = async (text, field, event) => {
    try {
      if (!text) return
      await navigator.clipboard.writeText(text)
      copied.value = true
      blinkedField.value = field
      copiedPosition.value = { x: event.clientX + 12, y: event.clientY + 12 }
      setTimeout(() => {
        copied.value = false
        blinkedField.value = ''
      }, 600)
    } catch (err) {
      console.error('❌ Failed to copy to clipboard:', err)
    }
  }

  const fetchStudents = () => {
    emit('student-updated')
  }

  onMounted(() => {
    loadManualAplIds()
    loadExcludedAplIds()
    fetchFileCounts()
  })

  watch(() => props.students, () => {
    fetchFileCounts()
  }, { deep: true })

  watch(manualAplIds, saveManualAplIds, { deep: false })
  watch(excludedAplIds, saveExcludedAplIds, { deep: false })

  const handleDragStart = (e, student) => {
    draggedStudent.value = student
  }

  const handleDrop = async (e, newStatus) => {
    if (!draggedStudent.value || draggedStudent.value.aplStatus === newStatus) return
    try {
      await client.patch(
        `/students/${draggedStudent.value._id}`,
        { aplStatus: newStatus }
      )
      fetchStudents()
      draggedStudent.value = null
    } catch (err) {
      console.error('❌ Failed to update student APL status', err)
    }
  }

  const openComments = async (student) => {
    selectedStudent.value = student
    newComment.value = ''
    dialog.value = true
    await nextTick()
    scrollToLatest()

    try {
      await client.post(
        `/students/${student._id}/mark-comments-seen`,
        {}
      )
      fetchStudents()
    } catch (err) {
      console.error('⚠️ Failed to mark comments as seen:', err)
    }
  }

  let searchDebounceTimer = null

  const onSearchInput = async () => {
    const q = searchQuery.value.trim()
    searchError.value = ''
    
    if (q.length < 3) {
      showSuggestions.value = false
      suggestions.value = []
      if (searchDebounceTimer) {
        clearTimeout(searchDebounceTimer)
        searchDebounceTimer = null
      }
      return
    }
    
    if (searchDebounceTimer) {
      clearTimeout(searchDebounceTimer)
    }
    
    searchDebounceTimer = setTimeout(async () => {
      showSuggestions.value = false
      suggestions.value = []
      isSearching.value = true
      
      try {
        const { data } = await client.get('/search', {
          params: { q, type: 'Användare' },
        })
        
        const studentResults = (data || []).filter((r) => r.type === 'Elev')
        suggestions.value = studentResults
        showSuggestions.value = true
      } catch (e) {
        if (e.status === 429) {
          searchError.value = 'För många förfrågningar. Vänta lite och försök igen.'
        } else {
          searchError.value = `Sökfel: ${e.message || 'Okänt fel'}`
        }
        showSuggestions.value = false
        suggestions.value = []
      } finally {
        isSearching.value = false
        searchDebounceTimer = null
      }
    }, 500)
  }

  const selectSuggestion = (s) => {
    if (!s?.id) return
    const studentId = String(s.id)
    manualAplIds.value.add(studentId)
    saveManualAplIds()
    
    fetchStudents()
    
    searchQuery.value = ''
    suggestions.value = []
    showSuggestions.value = false
    searchError.value = ''
    addStudentDialog.value = false
  }

  const openAddStudentDialog = () => {
    addStudentDialog.value = true
    searchQuery.value = ''
    suggestions.value = []
    showSuggestions.value = false
    searchError.value = ''
    isSearching.value = false
  }

  const closeAddDialog = () => {
    addStudentDialog.value = false
    searchQuery.value = ''
    suggestions.value = []
    showSuggestions.value = false
    searchError.value = ''
    isSearching.value = false
  }

  const removeFromApl = (student) => {
    if (!student?._id) return
    removeFromAplDialog.value = true
  }

  const doRemoveFromApl = () => {
    const student = selectedStudent.value
    if (!student?._id) return
    const studentId = String(student._id)
    if (manualAplIds.value.has(studentId)) {
      manualAplIds.value.delete(studentId)
      saveManualAplIds()
    }
    excludedAplIds.value.add(studentId)
    saveExcludedAplIds()
    removeFromAplDialog.value = false
    dialog.value = false
  }

  const getSortedComments = computed(() => {
    if (!selectedStudent.value) return []
    const comments = [...(selectedStudent.value.commentHistory || [])]
    return comments.sort((a, b) =>
      commentAscOrder.value
        ? new Date(a.date) - new Date(b.date)
        : new Date(b.date) - new Date(a.date)
    )
  })

  const shouldShowDateSeparator = (index) => {
    const sorted = getSortedComments.value
    if (index === 0) return true
    const current = new Date(sorted[index].date).toDateString()
    const prev = new Date(sorted[index - 1].date).toDateString()
    return current !== prev
  }

  const formatDate = (date) => {
    const d = new Date(date)
    return (
      d.toLocaleDateString() +
      ' ' +
      d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    )
  }

  const formatDateOnly = (date) => {
    if (!date) return ''
    const d = new Date(date)
    if (isNaN(d.getTime())) return ''
    return d.toLocaleDateString('sv-SE')
  }

  const packageNamesDisplay = computed(() => {
    const edu = selectedStudent.value?.education || []
    const names = edu
      .filter((e) => e && e.type === 'CoursePackage')
      .map((e) => e.name || e.refId?.coursePackageName)
      .filter(Boolean)
    const unique = Array.from(new Set(names))
    return unique.join(', ')
  })

  const earliestStartDisplay = computed(() => {
    const edu = selectedStudent.value?.education || []
    const starts = edu
      .map((e) => (e && e.startDate ? new Date(e.startDate).getTime() : NaN))
      .filter((n) => !isNaN(n))
    if (!starts.length) return ''
    return formatDateOnly(new Date(Math.min(...starts)))
  })

  const latestEndDisplay = computed(() => {
    const edu = selectedStudent.value?.education || []
    const ends = edu
      .map((e) => (e && e.endDate ? new Date(e.endDate).getTime() : NaN))
      .filter((n) => !isNaN(n))
    if (!ends.length) return ''
    return formatDateOnly(new Date(Math.max(...ends)))
  })

  const scrollToLatest = () => {
    const el = commentContainerRef.value
    if (el) el.scrollTop = el.scrollHeight
  }

  const canComment = computed(() => roleRank[currentUser.value?.role] >= roleRank['coordinator'])
  const closeDialog = () => {
    dialog.value = false
    setTimeout(() => {
      selectedStudent.value = null
    }, 99)
  }

  const submitComment = async () => {
    if (!newComment.value) return
    try {
      await client.post(
        `/students/${selectedStudent.value._id}/comment`,
        { comment: newComment.value }
      )
      newComment.value = ''
      fetchStudents()
    } catch (err) {
      console.error('❌ Failed to save comment:', err)
    }
  }

  const deleteComment = async (index) => {
    try {
      await client.delete(
        `/students/${selectedStudent.value._id}/comment`,
        { data: { index } }
      )
      fetchStudents()
    } catch (err) {
      console.error('❌ Failed to delete comment', err)
    }
  }
  const canDelete = (entry) => {
    return (
      entry.author?.toString() === currentUser.value?.name ||
      roleRank[currentUser.value?.role] >= roleRank['admin']
    )
  }

  const confirmDelete = (index) => {
    deleteCommentIndex.value = index
  }

  const doDeleteComment = async () => {
    const index = deleteCommentIndex.value
    if (index === null || index === false) return
    await deleteComment(index)
    deleteCommentIndex.value = null
  }
  const editComment = (index) => {
    editingIndex.value = index
    editedComment.value = getSortedComments.value[index].comment
  }

  const cancelEdit = () => {
    editingIndex.value = null
    editedComment.value = ''
  }

  const saveEditedComment = async (index) => {
    try {
      const updatedEntry = {
        ...getSortedComments.value[index],
        comment: editedComment.value,
      }
      await client.put(
        `/students/${selectedStudent.value._id}/comment`,
        { index, updatedEntry }
      )
      editingIndex.value = null
      editedComment.value = ''
      fetchStudents()
    } catch (err) {
      console.error('❌ Failed to update comment', err)
    }
  }
</script>

<style scoped>
  .apl-board {
    width: 100%;
    min-height: 600px;
    height: auto;
    overflow: auto;
    display: flex;
    flex-direction: row;
    gap: 16px;
    box-sizing: border-box;
    padding: 20px;
  }

  /* Board columns use the shared status hue families (tokens.css) */
  .column[data-hue='neutral'] { --hue: var(--status-neutral); --hue-tint: var(--status-neutral-tint); --hue-ink: var(--status-neutral-ink); }
  .column[data-hue='info']    { --hue: var(--status-info);    --hue-tint: var(--status-info-tint);    --hue-ink: var(--status-info-ink); }
  .column[data-hue='warning'] { --hue: var(--status-warning); --hue-tint: var(--status-warning-tint); --hue-ink: var(--status-warning-ink); }
  .column[data-hue='danger']  { --hue: var(--status-danger);  --hue-tint: var(--status-danger-tint);  --hue-ink: var(--status-danger-ink); }
  .column[data-hue='success'] { --hue: var(--status-success); --hue-tint: var(--status-success-tint); --hue-ink: var(--status-success-ink); }
  .column[data-hue='violet']  { --hue: var(--status-violet);  --hue-tint: var(--status-violet-tint);  --hue-ink: var(--status-violet-ink); }

  .column {
    min-width: 300px;
    flex: 1 1 0;
    overflow-y: auto;
    max-height: 80vh;
    padding: 12px;
    border-radius: var(--radius-card);
    min-height: 400px;
    background-color: var(--color-surface);
    border: 1px solid var(--color-border);
    border-top: 3px solid var(--hue);
    box-shadow: none;
  }

  .column h3 {
    background: var(--hue-tint);
    color: var(--hue-ink);
    margin: -12px -12px 10px;
    padding: 10px 15px;
    font-family: var(--font-heading);
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-semibold);
    border-bottom: 1px solid var(--color-border);
  }

  .tight-title {
    margin-bottom: 0;
    padding-bottom: 0;
    line-height: 0;
  }

  .student-card {
    position: relative;
    /* ✅ required for absolute positioning of icon */
    background: var(--color-surface);
    padding: 8px;
    margin: 6px 0;
    border-radius: var(--radius-card);
    border: 1px solid transparent;
    cursor: grab;
  }

  .student-card.is-auto-red {
    border: 1px dashed var(--color-danger);
  }

  .auto-red-badge {
    display: inline-block;
    margin-left: 6px;
    padding: 1px 6px;
    background: var(--color-danger);
    color: var(--color-surface);
    border-radius: var(--radius-pill);
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.5px;
    vertical-align: middle;
  }

  .auto-behind-schedule-badge {
    display: inline-block;
    margin-left: 6px;
    padding: 1px 6px;
    background: var(--color-warning);
    color: var(--color-surface);
    border-radius: var(--radius-pill);
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.5px;
    vertical-align: middle;
  }

  .auto-red-hint {
    margin-left: 8px;
    color: var(--color-danger);
    font-weight: 600;
  }

  .empty-column {
    color: var(--color-ink-muted);
    font-style: italic;
    text-align: center;
    padding: 20px;
  }

  .comment-entry {
    margin-bottom: 16px;
    border: 1px solid var(--color-border);
    overflow: hidden;
    background-color: var(--color-surface);
  }

  .comment-header {
    background: var(--color-bg-secondary);
    padding: 8px 12px;
    font-size: var(--font-size-sm);
    border-bottom: 1px solid var(--color-border);
    display: flex;
    justify-content: space-between;
    color: var(--color-ink-secondary);
  }

  .comment-box {
    border: 1px solid var(--color-border);
    padding: 10px 12px;
    font-size: var(--font-size-sm);
  }

  .comment-actions {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .edit-btn {
    flex: 1;
    text-align: left;
  }

  .delete-btn {
    flex: 1;
    text-align: right;
  }

  .comment-icon {
    position: absolute;
    top: 8px;
    right: 10px;
    transition: transform var(--motion-duration) var(--motion-ease);
  }

  .pulse {
    animation: pulse 1.5s infinite;
  }

  @keyframes pulse {
    0% {
      transform: scale(1);
    }

    50% {
      transform: scale(1.3);
    }

    100% {
      transform: scale(1);
    }
  }

  .copied-floating {
    position: fixed;
    z-index: 9999;
    background: var(--color-success);
    font-weight: bold;
    padding: 4px 10px;
    border-radius: var(--radius-control);
    pointer-events: none;
    font-size: 13px;
    color: var(--color-surface);
    box-shadow: var(--shadow-md);
    animation: fadeAway 1s;
  }

  @keyframes fadeAway {
    0% {
      opacity: 0;
      transform: scale(0.9);
    }

    50% {
      opacity: 1;
      transform: scale(1);
    }

    100% {
      opacity: 0;
      transform: scale(0.95);
    }
  }

  .clickable {
    cursor: pointer;
    text-decoration: underline;
    color: var(--color-primary);
    transition: all var(--motion-duration) var(--motion-ease);
  }

  .clickable:hover {
    color: var(--color-success);
  }

  .blinkGreen {
    animation: flash-green 0.6s;
  }

  @keyframes fade-green-reverse {
    0% {
      background-color: #c8e6c9;
      color: #2e7d32;
    }

    100% {
      background-color: transparent;
      color: inherit;
    }
  }

  @keyframes flash-green {
    0% {
      background-color: #c8e6c9;
      color: #2e7d32;
    }

    100% {
      background-color: transparent;
      color: inherit;
    }
  }

  .contact-info {
    margin-top: 0px;
  }

  .comment-dot {
    position: absolute;
    top: 6px;
    right: 6px;
    width: 10px;
    height: 10px;
    border-radius: 50%;
  }

  .comment-dot.green {
    background-color: #4caf50;
  }

  .comment-dot.yellow {
    background-color: #ffeb3b;
  }

  .comment-dot-blue {
    background-color: #009688;
  }

  .comment-dot.purple {
    background-color: #74016a;
  }

  .btn .no-margin-title {
    margin-bottom: 0;
    display: inline-block;
  }

  .button-row {
    display: flex;
    justify-content: space-between;
    margin-top: 8px;
  }

  .right {
    float: right;
    width: 300px;
    border: 3px solid #73ad21;
    padding: 10px;
  }

  .dialog-card {
    position: relative;
  }

  .dialog-close-btn {
    position: absolute;
    top: 8px;
    right: 8px;
    z-index: 10;
    background-color: transparent;
    color: var(--color-ink-muted);
  }

  .dialog-close-btn:hover {
    color: var(--color-text);
  }

  .education-summary {
    margin: 8px 0 4px;
    padding: 10px 12px;
    background: var(--color-bg);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-card);
  }
  .education-row {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 4px;
    flex-wrap: wrap;
  }
  .education-row:last-child {
    margin-bottom: 0;
  }
  .education-row strong {
    min-width: 90px;
  }
  .dot-sep {
    opacity: 0.5;
  }

  .comment-history-scroll {
    max-height: 500px;
    overflow-y: auto;
    padding-right: 6px;
    /* give space for scrollbar */
  }

  .comment-history-scroll::-webkit-scrollbar {
    width: 6px;
  }

  .comment-history-scroll::-webkit-scrollbar-thumb {
    background-color: var(--color-border-strong);
    border-radius: 3px;
  }
  .date-separator {
    text-align: center;
    font-size: 0.9rem;
    font-weight: bold;
    color: var(--color-ink-secondary);
    margin: 10px 0 4px;
  }
  .jump-button {
    display: flex;
    justify-content: center;
    margin-top: 10px;
  }
  .comment-order-toggle {
    margin: 10px 16px;
    font-size: 0.95rem;
  }

  .board-search-status {
    font-size: 0.9rem;
    color: var(--color-ink-muted);
  }

  .board-search-error {
    font-size: 0.9rem;
    color: var(--color-error);
    margin-top: 8px;
  }
  .centered {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    margin-bottom: 16px;
    text-align: center;
  }

  .summary-header {
    display: flex;
    justify-content: center;
    align-items: center;
    gap: 15px;
    margin-bottom: 15px;
  }

  .header-actions {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .toggle-btn {
    background: var(--color-neutral);
    color: var(--color-surface);
    border: none;
    border-radius: 50%;
    width: var(--control-height);
    height: var(--control-height);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: background-color var(--motion-duration) var(--motion-ease);
  }

  .toggle-btn:hover {
    background: var(--status-neutral-ink);
  }

  .summary-content {
    animation: slideDown var(--motion-duration) var(--motion-ease);
  }

  @keyframes slideDown {
    from {
      opacity: 0;
      max-height: 0;
    }
    to {
      opacity: 1;
      max-height: 1000px;
    }
  }

  .refresh-btn {
    background: var(--color-primary);
    color: var(--color-surface);
    border: none;
    border-radius: 50%;
    width: var(--control-height);
    height: var(--control-height);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: background-color var(--motion-duration) var(--motion-ease);
  }

  .refresh-btn:hover {
    background: var(--color-primary-hover);
  }

  .refresh-btn i {
    font-size: 16px;
  }

  .color-filter-section {
    margin-top: 10px;
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 13px;
  }

  .color-filter-section label {
    font-weight: 500;
    color: var(--color-ink-secondary);
  }

  .color-filter-select {
    padding: 4px 8px;
    border: 1px solid #dee2e6;
    border-radius: 4px;
    font-size: 13px;
  }
</style>
