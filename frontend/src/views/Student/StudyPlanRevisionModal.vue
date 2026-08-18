<template>
  <v-dialog :model-value="modelValue" max-width="680" @update:model-value="v => $emit('update:modelValue', v)">
    <v-card class="revision-modal">
      <v-card-title class="revision-modal__title">
        <v-icon size="20" color="warning" class="revision-modal__title-icon">mdi-file-document-edit</v-icon>
        Revidera studieplan
      </v-card-title>

      <v-card-text class="revision-modal__body">
        <!-- Step 1: Reason -->
        <div class="revision-section">
          <label class="revision-label">Anledning till revidering *</label>
          <select v-model="form.reason" class="revision-select">
            <option value="">— Välj anledning —</option>
            <option v-for="r in reasons" :key="r.value" :value="r.value">{{ r.label }}</option>
          </select>
        </div>

        <!-- Step 2: Description -->
        <div class="revision-section">
          <label class="revision-label">Beskrivning (valfritt)</label>
          <textarea
            v-model="form.description"
            class="revision-textarea"
            rows="2"
            placeholder="Kort beskrivning av ändringen..."
          />
        </div>

        <!-- Step 3: Changes -->
        <div class="revision-section">
          <label class="revision-label">Ändringar</label>

          <!-- Pace change -->
          <div v-if="form.reason === 'pace_change'" class="revision-change-block">
            <label class="revision-sublabel">Ny studietakt</label>
            <select v-model="form.newTempo" class="revision-select">
              <option :value="5">5 veckor (100%)</option>
              <option :value="10">10 veckor (50%)</option>
              <option :value="20">20 veckor (25%)</option>
            </select>
            <p class="revision-hint">
              Framtida kurser kommer att ändras till {{ form.newTempo }} veckor per kurs.
            </p>
          </div>

          <!-- Remove courses -->
          <div v-if="form.reason === 'course_removed'" class="revision-change-block">
            <label class="revision-sublabel">Välj kurser att ta bort</label>
            <div class="revision-course-list">
              <label
                v-for="enrollment in activeEnrollments"
                :key="enrollment.enrollmentId"
                class="revision-course-option"
              >
                <input
                  type="checkbox"
                  :value="enrollment.enrollmentId"
                  v-model="form.removeEnrollmentIds"
                />
                <span class="revision-course-info">
                  <span class="revision-course-name">{{ enrollment.name }}</span>
                  <span class="revision-course-dates">
                    {{ formatDate(enrollment.startDate) }} – {{ formatDate(enrollment.endDate) }}
                  </span>
                </span>
              </label>
            </div>
          </div>

          <!-- Date adjustment -->
          <div v-if="form.reason === 'date_adjustment'" class="revision-change-block">
            <label class="revision-sublabel">Justera datum för kurser</label>
            <div class="revision-course-list">
              <div
                v-for="enrollment in activeEnrollments"
                :key="enrollment.enrollmentId"
                class="revision-date-row"
              >
                <span class="revision-course-name">{{ enrollment.name }}</span>
                <div class="revision-date-inputs">
                  <label>Ny start:</label>
                  <input
                    type="date"
                    :value="getAdjustmentDate(enrollment.enrollmentId, 'startDate')"
                    @input="setAdjustmentDate(enrollment.enrollmentId, 'startDate', $event.target.value)"
                    class="revision-date-input"
                  />
                  <label>Ny slut:</label>
                  <input
                    type="date"
                    :value="getAdjustmentDate(enrollment.enrollmentId, 'endDate')"
                    @input="setAdjustmentDate(enrollment.enrollmentId, 'endDate', $event.target.value)"
                    class="revision-date-input"
                  />
                </div>
              </div>
            </div>
          </div>

          <!-- Other / general -->
          <div v-if="['course_added', 'package_swap', 'other'].includes(form.reason)" class="revision-change-block">
            <p class="revision-hint">
              Denna typ av revidering kräver manuell hantering. Kontakta systemadmin för assistance.
            </p>
          </div>
        </div>

        <!-- Preview -->
        <div v-if="hasChanges" class="revision-section revision-preview">
          <label class="revision-label">Sammanfattning</label>
          <ul class="revision-summary">
            <li v-if="form.reason === 'pace_change'">
              Tempo ändras från {{ currentTempo }}v till {{ form.newTempo }}v för framtida kurser
            </li>
            <li v-if="form.reason === 'course_removed' && form.removeEnrollmentIds.length > 0">
              {{ form.removeEnrollmentIds.length }} kurs{{ form.removeEnrollmentIds.length > 1 ? 'er' : '' }} tas bort
            </li>
            <li v-if="form.reason === 'date_adjustment' && Object.keys(form.dateAdjustments).length > 0">
              Datum justeras för {{ Object.keys(form.dateAdjustments).length }} kurs{{ Object.keys(form.dateAdjustments).length > 1 ? 'er' : '' }}
            </li>
          </ul>
        </div>
      </v-card-text>

      <v-card-actions class="revision-modal__actions">
        <v-spacer />
        <v-btn variant="text" :disabled="submitting" @click="$emit('update:modelValue', false)">
          Avbryt
        </v-btn>
        <v-btn
          color="primary"
          :loading="submitting"
          :disabled="!form.reason || !hasChanges"
          @click="handleSubmit"
        >
          Tillämpa revidering
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script setup>
import { ref, reactive, computed, watch } from 'vue'
import client from '@/api/client.js'
import { useToast } from '@/composables/useToast.js'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  student: { type: Object, required: true },
  activeEnrollments: { type: Array, default: () => [] },
  currentTempo: { type: Number, default: 5 },
})

const emit = defineEmits(['update:modelValue', 'revised'])

const toast = useToast()
const submitting = ref(false)

const reasons = [
  { value: 'pace_change', label: 'Tempoändring' },
  { value: 'course_removed', label: 'Borttagning av kurs' },
  { value: 'course_added', label: 'Tillägg av kurs' },
  { value: 'date_adjustment', label: 'Datumjustering' },
  { value: 'package_swap', label: 'Paketbyte' },
  { value: 'other', label: 'Övrigt' },
]

const form = reactive({
  reason: '',
  description: '',
  newTempo: props.currentTempo,
  removeEnrollmentIds: [],
  dateAdjustments: {},
})

const hasChanges = computed(() => {
  if (form.reason === 'pace_change') return form.newTempo !== props.currentTempo
  if (form.reason === 'course_removed') return form.removeEnrollmentIds.length > 0
  if (form.reason === 'date_adjustment') return Object.keys(form.dateAdjustments).length > 0
  return false
})

function formatDate(dateString) {
  if (!dateString) return ''
  return new Date(dateString).toLocaleDateString('sv-SE')
}

function getAdjustmentDate(enrollmentId, field) {
  return form.dateAdjustments[enrollmentId]?.[field] || ''
}

function setAdjustmentDate(enrollmentId, field, value) {
  if (!form.dateAdjustments[enrollmentId]) {
    form.dateAdjustments[enrollmentId] = {}
  }
  form.dateAdjustments[enrollmentId][field] = value
}

function buildChanges() {
  const changes = {}
  if (form.reason === 'pace_change' && form.newTempo !== props.currentTempo) {
    changes.tempoWeeks = form.newTempo
  }
  if (form.reason === 'course_removed' && form.removeEnrollmentIds.length > 0) {
    changes.removeEnrollmentIds = form.removeEnrollmentIds
  }
  if (form.reason === 'date_adjustment' && Object.keys(form.dateAdjustments).length > 0) {
    changes.dateAdjustments = Object.entries(form.dateAdjustments).map(([enrollmentId, dates]) => ({
      enrollmentId,
      ...dates,
    }))
  }
  return changes
}

async function handleSubmit() {
  if (!form.reason) return
  submitting.value = true
  try {
    const changes = buildChanges()
    await client.post(`/student-details/${props.student._id}/revise-studyplan`, {
      revisionReason: form.reason,
      description: form.description,
      changes,
    })
    toast.success('Studieplanen har reviderats!')
    emit('revised')
    emit('update:modelValue', false)
    resetForm()
  } catch (error) {
    toast.error(error.response?.data?.error || 'Kunde inte revidera studieplanen')
  } finally {
    submitting.value = false
  }
}

function resetForm() {
  form.reason = ''
  form.description = ''
  form.newTempo = props.currentTempo
  form.removeEnrollmentIds = []
  form.dateAdjustments = {}
}

watch(() => props.modelValue, (open) => {
  if (open) resetForm()
})
</script>

<style scoped>
.revision-modal {
  border-radius: 12px;
}
.revision-modal__title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-family: var(--font-heading);
  font-weight: var(--font-weight-semibold);
  padding: 16px 20px 8px;
}
.revision-modal__body {
  padding: 8px 20px 16px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.revision-section {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.revision-label {
  font-weight: 600;
  font-size: 14px;
  color: #2c3e50;
}
.revision-sublabel {
  font-weight: 500;
  font-size: 13px;
  color: #495057;
  margin-bottom: 4px;
}
.revision-select,
.revision-textarea,
.revision-date-input {
  padding: 8px 10px;
  border: 1px solid #dee2e6;
  border-radius: 4px;
  font-size: 14px;
  font-family: inherit;
}
.revision-textarea {
  resize: vertical;
}
.revision-hint {
  font-size: 13px;
  color: #6c757d;
  margin: 4px 0 0;
}
.revision-change-block {
  padding: 12px;
  border: 1px solid #e9ecef;
  border-radius: 6px;
  background: #f8f9fa;
}
.revision-course-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-height: 200px;
  overflow-y: auto;
}
.revision-course-option {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  border: 1px solid #dee2e6;
  border-radius: 4px;
  cursor: pointer;
  transition: background 0.15s;
}
.revision-course-option:hover {
  background: #f0f7ff;
}
.revision-course-option input[type="checkbox"] {
  margin: 0;
}
.revision-course-info {
  display: flex;
  flex-direction: column;
  font-size: 13px;
}
.revision-course-name {
  font-weight: 500;
  color: #2c3e50;
}
.revision-course-dates {
  color: #6c757d;
  font-size: 12px;
}
.revision-date-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 6px 8px;
  border: 1px solid #dee2e6;
  border-radius: 4px;
}
.revision-date-inputs {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: #6c757d;
}
.revision-date-input {
  padding: 4px 6px;
  font-size: 12px;
}
.revision-preview {
  background: #f0f7ff;
  padding: 12px;
  border-radius: 6px;
  border: 1px solid #b8daff;
}
.revision-summary {
  margin: 0;
  padding-left: 20px;
  font-size: 13px;
  color: #2c3e50;
}
.revision-summary li {
  margin-bottom: 4px;
}
.revision-modal__actions {
  padding: 0 20px 16px;
}
</style>
