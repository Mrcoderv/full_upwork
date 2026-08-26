<template>
  <div class="content-grid">
    <!-- Basic Information Card -->
    <div class="card">
      <div class="card-header">
        <h3>Grundläggande Information</h3>
        <button
          v-if="isAdmin"
          @click="toggleEditMode"
          class="btn btn-sm"
          :class="editMode ? 'btn-secondary' : 'btn-primary'"
        >
          {{ editMode ? 'Avbryt' : 'Redigera' }}
        </button>
      </div>
      <div class="card-body">
        <div class="info-grid">
          <div class="info-item">
            <label>APL-status:</label>
            <select
              v-if="editMode && isAdmin"
              v-model="editData.aplStatus"
              class="form-control"
            >
              <option value="GRAY">Grå - Ny Elev</option>
              <option value="BLUE">Blå - Kontaktad</option>
              <option value="YELLOW">Gul - APL på gång</option>
              <option value="PURPLE">Lila - Behöver uppföljning</option>
              <option value="RED">Röd - Snart slut</option>
              <option value="GREEN">Grön - Klar praktik</option>
            </select>
            <span v-else>{{ getAplStatusLabel(student.aplStatus) || 'Ej angivet' }}</span>
          </div>
          <div class="info-item">
            <label>Namn:</label>
            <input
              v-if="editMode && isAdmin"
              v-model="editData.name"
              type="text"
              class="form-control"
            />
            <span v-else>{{ student.name || 'Ej angivet' }}</span>
          </div>

          <div class="info-item">
            <label>Personnummer:</label>
            <input
              v-if="editMode && isAdmin"
              v-model="editData.personalNumber"
              type="text"
              class="form-control"
            />
            <span v-else>{{ student.personalNumber || 'Ej angivet' }}</span>
          </div>

          <div class="info-item">
            <label>Telefon:</label>
            <input
              v-if="editMode && isAdmin"
              v-model="editData.phone"
              type="text"
              class="form-control"
            />
            <span v-else>{{ student.phone || 'Ej angivet' }}</span>
          </div>

          <div class="info-item">
            <label>E-post:</label>
            <input
              v-if="editMode && isAdmin"
              v-model="editData.email"
              type="email"
              class="form-control"
            />
            <span v-else>{{ student.email || 'Ej angivet' }}</span>
          </div>

          <div v-if="isAdmin && student.user" class="info-item">
            <label>Lösenord:</label>
            <div class="password-display" style="display: flex; align-items: center; gap: 10px;">
              <code v-if="studentPassword" style="background: #f8f9fa; padding: 4px 8px; border-radius: 4px; font-family: monospace;">{{ studentPassword }}</code>
              <span v-else class="password-placeholder" style="color: #6c757d;">••••••••</span>
              <button
                @click="resetPassword"
                class="btn btn-sm btn-outline-primary"
                :disabled="resettingPassword"
              >
                {{ resettingPassword ? 'Återställer...' : studentPassword ? 'Återställ lösenord' : 'Visa/Återställ lösenord' }}
              </button>
            </div>
          </div>

          <div class="info-item">
            <label>Kommun:</label>
            <select
              v-if="editMode && isAdmin"
              v-model="editData.municipality.type"
              class="form-control"
            >
              <option value="">Välj kommun</option>
              <option
                v-for="municipality in municipalities"
                :key="municipality"
                :value="municipality"
              >
                {{ municipality }}
              </option>
            </select>
            <span v-else>{{ student.municipality?.type || 'Ej angivet' }}</span>
          </div>
        </div>

        <div v-if="editMode && isAdmin" class="edit-actions">
          <button @click="saveChanges" class="btn btn-success" :disabled="saving">
            {{ saving ? 'Sparar...' : 'Spara ändringar' }}
          </button>
          <button @click="cancelEdit" class="btn btn-secondary">Avbryt</button>
        </div>
      </div>
    </div>

    <!-- Status Card -->
    <div class="card">
      <div class="card-header">
        <h3>Status</h3>
      </div>
      <div class="card-body">
        <div class="info-grid">
          <div class="info-item">
            <label>Startdatum:</label>
            <input
              v-if="editMode && isAdmin"
              v-model="editData.startDate"
              type="date"
              class="form-control"
            />
            <span v-else>{{ formatDate(student.startDate) || 'Ej angivet' }}</span>
          </div>

          <div class="info-item">
            <label>Slutdatum:</label>
            <input
              v-if="editMode && isAdmin"
              v-model="editData.endDate"
              type="date"
              class="form-control"
            />
            <span v-else>{{ formatDate(student.endDate) || 'Ej angivet' }}</span>
          </div>

          <div class="info-item">
            <label>Provstatus:</label>
            <input
              v-if="editMode && isAdmin"
              v-model="editData.exam"
              type="text"
              class="form-control"
            />
            <span v-else>{{ student.exam || 'Ej angivet' }}</span>
          </div>

          <div class="info-item">
            <label>Övrigt:</label>
            <textarea
              v-if="editMode && isAdmin"
              v-model="editData.additionalInfo"
              class="form-control"
              rows="3"
            ></textarea>
            <span v-else>{{ student.additionalInfo || 'Ej angivet' }}</span>
          </div>

          <div class="info-item">
            <label>Specialbehov:</label>
            <textarea
              v-if="editMode && isAdmin"
              v-model="editData.specialNeeds"
              class="form-control"
              rows="3"
              placeholder="Beskriv eventuella särskilda behov eller anpassningar"
            ></textarea>
            <span v-else>{{ student.specialNeeds || 'Ej angivet' }}</span>
          </div>

          <div class="info-item">
            <label>Provlokal-anpassningar:
              <button
                v-if="isSpecped && !editMode && !specpedAccommodationMode"
                @click="enterSpecpedAccommodationMode"
                class="btn btn-sm btn-outline-primary ms-2"
              >Redigera</button>
            </label>
            <div v-if="(editMode && isAdmin) || specpedAccommodationMode" class="checkbox-group">
              <label class="checkbox-label">
                <input type="checkbox" v-model="editData.examAccommodations.extraTime" />
                Extra skrivtid
              </label>
              <label class="checkbox-label">
                <input type="checkbox" v-model="editData.examAccommodations.computer" />
                Dator
              </label>
              <label class="checkbox-label">
                <input type="checkbox" v-model="editData.examAccommodations.separateRoom" />
                Sitter ensam
              </label>
              <input
                v-model="editData.examAccommodations.notes"
                type="text"
                class="form-control mt-2"
                placeholder="Anteckningar om anpassningar"
              />
              <div v-if="specpedAccommodationMode" class="mt-2 d-flex gap-2">
                <button @click="saveAccommodations" class="btn btn-sm btn-success" :disabled="saving">
                  {{ saving ? 'Sparar...' : 'Spara' }}
                </button>
                <button @click="cancelSpecpedAccommodationMode" class="btn btn-sm btn-secondary">Avbryt</button>
              </div>
            </div>
            <div v-else>
              <span v-if="student.examAccommodations?.extraTime" class="badge bg-info me-1">Extra skrivtid</span>
              <span v-if="student.examAccommodations?.computer" class="badge bg-info me-1">Dator</span>
              <span v-if="student.examAccommodations?.separateRoom" class="badge bg-info me-1">Sitter ensam</span>
              <span v-if="student.examAccommodations?.notes" class="text-muted d-block mt-1">{{ student.examAccommodations.notes }}</span>
              <span v-if="!student.examAccommodations?.extraTime && !student.examAccommodations?.computer && !student.examAccommodations?.separateRoom">Inga anpassningar</span>
            </div>
          </div>

          <div class="info-item" v-if="isAdmin">
            <label>Avbrott (Inaktiv):</label>
            <div style="display: flex; align-items: center; gap: 10px;">
              <input
                type="checkbox"
                :checked="localStudent.dropout"
                @change="handleDropoutChange"
                :disabled="processingDropout"
                id="dropout-checkbox"
              />
              <label for="dropout-checkbox" style="margin: 0; font-weight: normal;">
                {{ localStudent.dropout ? 'Ta bort avbrott-status' : 'Markera som avbrott' }}
              </label>
              <span v-if="processingDropout" style="color: #666; font-size: 0.9rem;">Bearbetar...</span>
            </div>
            <p v-if="localStudent.dropout" style="color: #dc3545; font-weight: bold; margin-top: 8px; font-size: 1.1rem;">
              ⚠️ INAKTIV
            </p>
          </div>
        </div>
      </div>
    </div>

    <!-- Support Contacts Card -->
    <div class="card">
      <div class="card-header">
        <h3>Stödkontakter</h3>
        <button
          v-if="isAdmin"
          @click="showSupportModal = true"
          class="btn btn-primary btn-sm"
        >
          {{ supportInfo.length > 0 ? 'Redigera' : 'Lägg till' }}
        </button>
      </div>
      <div class="card-body">
        <div v-if="supportInfo.length > 0" class="support-list">
          <div v-for="(contact, idx) in supportInfo" :key="idx" class="support-item">
            <div class="support-name">{{ contact.contactName }}</div>
            <div v-if="contact.contactRole" class="support-role">{{ contact.contactRole }}</div>
            <div class="support-details">
              <span v-if="contact.contactPhone">Tel: {{ contact.contactPhone }}</span>
              <span v-if="contact.contactEmail"> | E-post: {{ contact.contactEmail }}</span>
            </div>
            <div v-if="contact.supportType" class="support-type">
              <span class="badge bg-info">{{ contact.supportType }}</span>
            </div>
            <div v-if="contact.notes" class="support-notes">{{ contact.notes }}</div>
          </div>
        </div>
        <div v-else class="empty-state">Inga stödkontakter registrerade</div>
      </div>
    </div>

    <!-- Deviations Card -->
    <div class="card">
      <div class="card-header">
        <h3>Avvikelser & Undantag</h3>
        <button
          v-if="canCreateDeviation"
          @click="showDeviationModal = true"
          class="btn btn-primary btn-sm"
        >
          + Ny avvikelse
        </button>
      </div>
      <div class="card-body">
        <div v-if="loadingDeviations" class="loading-small">
          <span>Laddar avvikelser...</span>
        </div>
        <div v-else-if="deviations.length > 0" class="deviations-list">
          <div
            v-for="dev in deviations"
            :key="dev._id"
            class="deviation-item"
            :class="'deviation-' + dev.status"
          >
            <div class="deviation-header">
              <span class="deviation-type-badge" :class="'type-' + dev.type">{{ getDeviationTypeLabel(dev.type) }}</span>
              <span class="deviation-status-badge" :class="'status-' + dev.status">{{ getDeviationStatusLabel(dev.status) }}</span>
            </div>
            <div class="deviation-title">{{ dev.title }}</div>
            <div v-if="dev.description" class="deviation-description">{{ dev.description }}</div>
            <div class="deviation-meta">
              <span v-if="dev.requestedByName">Ansökt av: {{ dev.requestedByName }}</span>
              <span v-if="dev.createdAt"> | {{ formatDate(dev.createdAt) }}</span>
            </div>
          </div>
        </div>
        <div v-else class="empty-state">Inga avvikelser registrerade</div>
      </div>
    </div>

    <!-- Comments Card -->
    <div class="card">
      <div class="card-header">
        <h3>Kommentarer</h3>
        <button
          v-if="canComment"
          @click="showCommentModal = true"
          class="btn btn-primary btn-sm"
        >
          Lägg till kommentar
        </button>
      </div>
      <div class="card-body">
        <div
          v-if="student.commentHistory && student.commentHistory.length > 0"
          class="comments-list"
        >
          <div
            v-for="(comment) in activeComments"
            :key="comment._id"
            class="comment-item"
            :class="{ deleted: comment.isDeleted }"
          >
            <div class="comment-header">
              <span class="comment-author">{{ comment.author }}</span>
              <span class="comment-date">{{ formatDate(comment.date) }}</span>
              <span class="comment-role">{{ comment.authorRole }}</span>
            </div>

            <div class="comment-content">
              <span v-if="comment.isDeleted" class="deleted-text">[RADERAD]</span>
              <span v-else>{{ comment.comment }}</span>
            </div>

            <div v-if="comment.editedAt" class="comment-edited">
              Redigerad {{ formatDate(comment.editedAt) }}
            </div>

            <div class="comment-actions">
              <button
                v-if="canEditComment(comment)"
                @click="editComment(comment)"
                class="btn btn-sm btn-outline-primary"
              >
                Redigera
              </button>
              <button
                v-if="canDeleteComment(comment)"
                @click="deleteComment(comment._id)"
                class="btn btn-sm btn-outline-danger"
              >
                Radera
              </button>
            </div>
          </div>
        </div>
        <div v-else class="no-comments">Inga kommentarer än</div>
      </div>
    </div>

    <!-- Change History Card (Admin only) -->
    <div v-if="isAdmin" class="card">
      <div class="card-header">
        <h3>Ändringshistorik</h3>
      </div>
      <div class="card-body">
        <div v-if="changeHistory && changeHistory.length > 0" class="history-list">
          <div v-for="(change, index) in changeHistory" :key="index" class="history-item">
            <div class="history-header">
              <div class="history-meta">
                <span class="history-date">{{ formatDateTime(change.timestamp) }}</span>
                <span class="history-user">{{ formatRole(change.changedByRole) }}</span>
              </div>
            </div>
            <div class="history-changes">
              <div v-for="field in change.changes" :key="field" class="change-item">
                <div class="change-field-label">{{ getFieldLabel(field) }}</div>
                <div class="change-values">
                  <div class="change-value old">
                    <span class="change-label">Före:</span>
                    <span class="change-content">{{ formatChangeValue(change.previousValues[field]) }}</span>
                  </div>
                  <div class="change-arrow">→</div>
                  <div class="change-value new">
                    <span class="change-label">Efter:</span>
                    <span class="change-content">{{ formatChangeValue(change.newValues[field]) }}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div v-else class="no-history">Ingen ändringshistorik</div>
      </div>
    </div>

    <!-- Comment Modal -->
    <div v-if="showCommentModal" class="modal-overlay" @click="showCommentModal = false">
      <div class="modal-content" @click.stop>
        <div class="modal-header">
          <h3>Lägg till kommentar</h3>
          <button @click="showCommentModal = false" class="close-btn">&times;</button>
        </div>
        <div class="modal-body">
          <textarea
            v-model="newComment"
            class="form-control"
            rows="4"
            placeholder="Skriv din kommentar här..."
          ></textarea>
        </div>
        <div class="modal-footer">
          <button @click="addComment" class="btn btn-primary" :disabled="!newComment.trim()">
            Lägg till
          </button>
          <button @click="showCommentModal = false" class="btn btn-secondary">Avbryt</button>
        </div>
      </div>
    </div>

    <!-- Edit Comment Modal -->
    <div v-if="showEditModal" class="modal-overlay" @click="showEditModal = false">
      <div class="modal-content" @click.stop>
        <div class="modal-header">
          <h3>Redigera kommentar</h3>
          <button @click="showEditModal = false" class="close-btn">&times;</button>
        </div>
        <div class="modal-body">
          <textarea v-model="editingComment.comment" class="form-control" rows="4"></textarea>
        </div>
        <div class="modal-footer">
          <button @click="saveEditedComment" class="btn btn-primary">Spara</button>
          <button @click="showEditModal = false" class="btn btn-secondary">Avbryt</button>
        </div>
      </div>
    </div>

    <!-- Support Contacts Modal -->
    <div v-if="showSupportModal" class="modal-overlay" @click="showSupportModal = false">
      <div class="modal-content modal-wide" @click.stop>
        <div class="modal-header">
          <h3>Stödkontakter</h3>
          <button @click="showSupportModal = false" class="close-btn">&times;</button>
        </div>
        <div class="modal-body">
          <div v-for="(contact, idx) in supportEditData" :key="idx" class="support-edit-item">
            <div class="support-edit-row">
              <input v-model="contact.contactName" class="form-control" placeholder="Namn" />
              <input v-model="contact.contactRole" class="form-control" placeholder="Roll" />
              <input v-model="contact.contactPhone" class="form-control" placeholder="Telefon" />
              <input v-model="contact.contactEmail" class="form-control" placeholder="E-post" />
            </div>
            <div class="support-edit-row">
              <input v-model="contact.supportType" class="form-control" placeholder="Stödtyp (t.ex. kurator, Biståndshandläggare)" />
              <input v-model="contact.notes" class="form-control" placeholder="Anteckningar" />
              <button @click="removeSupportContact(idx)" class="btn btn-sm btn-outline-danger">Ta bort</button>
            </div>
          </div>
          <button @click="addSupportContact" class="btn btn-sm btn-outline-primary mt-2">+ Lägg till kontakt</button>
        </div>
        <div class="modal-footer">
          <button @click="saveSupportInfo" class="btn btn-primary" :disabled="savingSupport">
            {{ savingSupport ? 'Sparar...' : 'Spara' }}
          </button>
          <button @click="showSupportModal = false" class="btn btn-secondary">Avbryt</button>
        </div>
      </div>
    </div>

    <!-- Deviation Modal -->
    <div v-if="showDeviationModal" class="modal-overlay" @click="showDeviationModal = false">
      <div class="modal-content" @click.stop>
        <div class="modal-header">
          <h3>Ny avvikelse</h3>
          <button @click="showDeviationModal = false" class="close-btn">&times;</button>
        </div>
        <div class="modal-body">
          <div class="form-group">
            <label>Typ</label>
            <select v-model="deviationForm.type" class="form-control">
              <option value="deviation">Avvikelse</option>
              <option value="exception">Undantag</option>
              <option value="revision">Revidering</option>
            </select>
          </div>
          <div class="form-group">
            <label>Titel *</label>
            <input v-model="deviationForm.title" class="form-control" placeholder="Kort beskrivning" />
          </div>
          <div class="form-group">
            <label>Beskrivning</label>
            <textarea v-model="deviationForm.description" class="form-control" rows="3"></textarea>
          </div>
          <div class="form-group">
            <label>Orsak</label>
            <textarea v-model="deviationForm.reason" class="form-control" rows="2"></textarea>
          </div>
          <div class="form-group">
            <label>Kurs (valfritt)</label>
            <select v-model="deviationForm.enrollmentId" class="form-control">
              <option value="">— Välj kurs —</option>
              <option
                v-for="enrollment in availableEnrollments"
                :key="enrollment._id"
                :value="enrollment._id"
              >
                {{ enrollment.name || enrollment.courseInstance?.courseName || 'Kurs' }}
              </option>
            </select>
          </div>
        </div>
        <div class="modal-footer">
          <button @click="saveDeviation" class="btn btn-primary" :disabled="!deviationForm.title || savingDeviation">
            {{ savingDeviation ? 'Sparar...' : 'Skapa' }}
          </button>
          <button @click="showDeviationModal = false" class="btn btn-secondary">Avbryt</button>
        </div>
      </div>
    </div>
  </div>

  <!-- Dropout Confirm Dialog -->
  <ConfirmDialog
    v-model="showDropoutConfirm"
    :title="dropoutConfirmAction === 'dropout' ? 'Markera som avbrott?' : 'Ta bort avbrott-status?'"
    :message="dropoutConfirmAction === 'dropout'
      ? `${localStudent.name} kommer att markeras som inaktiv. Detta tar bort eleven från APL-listor, slutprov och skickar en notis till lärare.`
      : `${localStudent.name} kommer att återaktiveras som aktiv elev.`"
    confirm-label="Bekräfta"
    cancel-label="Avbryt"
    :loading="processingDropout"
    @confirm="confirmDropoutAction"
    @cancel="cancelDropoutAction"
  />
</template>

<script>
import { ref, computed, onMounted, watch } from 'vue';
import { useRoute } from 'vue-router';
import { useStore } from 'vuex';
import client from '@/api/client.js';
import { useToast } from '@/composables/useToast.js';
import ConfirmDialog from '@/components/base/ConfirmDialog.vue';

export default {
  name: 'GeneralTab',
  components: { ConfirmDialog },
  props: {
    student: {
      type: Object,
      required: true,
    },
    changeHistory: {
      type: Array,
      required: true,
    }
  },
  emits: ['student-updated'],
  setup(props, { emit }) {
    const route = useRoute();
    const store = useStore();
    const toast = useToast();

    const editMode = ref(false);
    const saving = ref(false);
    const showCommentModal = ref(false);
    const showEditModal = ref(false);
    const newComment = ref('');
    const editingComment = ref(null);
    const localStudent = ref(props.student);
    const studentPassword = ref(null);
    const resettingPassword = ref(false);
    const processingDropout = ref(false);
    const showDropoutConfirm = ref(false);
    const dropoutConfirmAction = ref('dropout');

    // Support info
    const supportInfo = ref([]);
    const showSupportModal = ref(false);
    const supportEditData = ref([]);
    const savingSupport = ref(false);

    // Deviations
    const deviations = ref([]);
    const loadingDeviations = ref(false);
    const showDeviationModal = ref(false);
    const savingDeviation = ref(false);
    const deviationForm = ref({
      type: 'deviation',
      title: '',
      description: '',
      reason: '',
      enrollmentId: '',
    });
    const availableEnrollments = computed(() => {
      return (localStudent.value?.education || []).filter(
        e => e.isEnrollment && e.status !== 'dropped'
      );
    });

    const editData = ref({});

    const municipalities = [
      'Botkyrka', 'Danderyd', 'Huddinge', 'Järfälla', 'KCNO', 'Lidingö', 'Norrtälje',
      'Nykvarn', 'Privat kunder', 'Salem', 'Sigtuna', 'Sollentuna', 'Solna',
      'Sundbyberg', 'Södertälje', 'Täby', 'Upplands Bro', 'Upplands Väsby',
      'Vallentuna', 'Vaxholm', 'Växjö', 'Österåker',
    ];

    const isAdmin = computed(() => store.getters.isAdmin);
    const isSpecped = computed(() => userRole.value === 'specped');
    const userRole = computed(() => store.getters.userRole);
    const userId = computed(() => store.getters.userId);
    const specpedAccommodationMode = ref(false);

    const canComment = computed(() => ['teacher', 'admin', 'systemadmin'].includes(userRole.value));

    const canCreateDeviation = computed(() => ['teacher', 'admin', 'systemadmin'].includes(userRole.value));

    const activeComments = computed(() => {
      if (!localStudent.value?.commentHistory) return [];
      return localStudent.value.commentHistory.filter((comment) => !comment.isDeleted);
    });
    
    const initializeEditData = () => {
        editData.value = {
            name: localStudent.value.name || '',
            personalNumber: localStudent.value.personalNumber || '',
            phone: localStudent.value.phone || '',
            email: localStudent.value.email || '',
            municipality: { type: localStudent.value.municipality?.type || '' },
            aplStatus: localStudent.value.aplStatus || 'GRAY',
            startDate: localStudent.value.startDate ? new Date(localStudent.value.startDate).toISOString().split('T')[0] : '',
            endDate: localStudent.value.endDate ? new Date(localStudent.value.endDate).toISOString().split('T')[0] : '',
            exam: localStudent.value.exam || '',
            additionalInfo: localStudent.value.additionalInfo || '',
            specialNeeds: localStudent.value.specialNeeds || '',
            examAccommodations: {
                extraTime: localStudent.value.examAccommodations?.extraTime || false,
                computer: localStudent.value.examAccommodations?.computer || false,
                separateRoom: localStudent.value.examAccommodations?.separateRoom || false,
                notes: localStudent.value.examAccommodations?.notes || '',
            },
        };
    };
    
    watch(() => props.student, (newStudent) => {
        localStudent.value = newStudent;
        initializeEditData();
    }, { deep: true, immediate: true });

    const toggleEditMode = () => {
      editMode.value = !editMode.value;
      if (editMode.value) {
        initializeEditData();
      }
    };

    const saveChanges = async () => {
      try {
        saving.value = true;
        const response = await client.put(`/student-details/${route.params.id}`, editData.value);
        emit('student-updated', response.data.student);
        editMode.value = false;
      } catch (err) {
        console.error('Error saving changes:', err);
        toast.error('Kunde inte spara ändringar');
      } finally {
        saving.value = false;
      }
    };

    const cancelEdit = () => {
      editMode.value = false;
      initializeEditData();
    };

    const enterSpecpedAccommodationMode = () => {
      specpedAccommodationMode.value = true;
      initializeEditData();
    };

    const cancelSpecpedAccommodationMode = () => {
      specpedAccommodationMode.value = false;
      initializeEditData();
    };

    const saveAccommodations = async () => {
      try {
        saving.value = true;
        await client.put(
          `/student-details/${route.params.id}`,
          { examAccommodations: editData.value.examAccommodations }
        );
        localStudent.value.examAccommodations = { ...editData.value.examAccommodations };
        specpedAccommodationMode.value = false;
        toast.success('Anpassningar sparade');
      } catch (err) {
        console.error('Error saving accommodations:', err);
        toast.error('Kunde inte spara anpassningar');
      } finally {
        saving.value = false;
      }
    };

    const addComment = async () => {
      try {
        const response = await client.post(`/student-details/${route.params.id}/comments`, {
          comment: newComment.value,
        });
        localStudent.value.commentHistory = response.data.commentHistory;
        newComment.value = '';
        showCommentModal.value = false;
      } catch (err) {
        console.error('Error adding comment:', err);
        toast.error('Kunde inte lägga till kommentar');
      }
    };

    const editComment = (comment) => {
      editingComment.value = { ...comment };
      showEditModal.value = true;
    };

    const saveEditedComment = async () => {
      try {
        const response = await client.put(
          `/student-details/${route.params.id}/comments/${editingComment.value._id}`,
          { comment: editingComment.value.comment }
        );
        const updatedHistory = response.data.commentHistory;
        const commentIndex = localStudent.value.commentHistory.findIndex(c => c._id === editingComment.value._id);
        if (commentIndex !== -1) {
            localStudent.value.commentHistory[commentIndex] = updatedHistory.find(c => c._id === editingComment.value._id);
        }
        showEditModal.value = false;
        editingComment.value = null;
      } catch (err) {
        console.error('Error editing comment:', err);
        toast.error('Kunde inte redigera kommentar');
      }
    };

    const deleteComment = async (commentId) => {
      if (!confirm('Är du säker på att du vill radera denna kommentar?')) return;
      try {
        await client.delete(`/student-details/${route.params.id}/comments/${commentId}`);
        const comment = localStudent.value.commentHistory.find((c) => c._id === commentId);
        if (comment) {
            comment.isDeleted = true;
        }
      } catch (err) {
        console.error('Error deleting comment:', err);
        toast.error('Kunde inte radera kommentar');
      }
    };

    const canEditComment = (comment) => {
      return comment.authorId === userId.value || isAdmin.value;
    };

    const canDeleteComment = (comment) => {
      return comment.authorId === userId.value || isAdmin.value;
    };

    const formatDate = (date) => {
      if (!date) return '';
      return new Date(date).toLocaleDateString('sv-SE');
    };

    const formatDateTime = (date) => {
      if (!date) return '';
      const d = new Date(date);
      return d.toLocaleString('sv-SE', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
      });
    };

    const formatRole = (role) => {
      const roleMap = {
        'admin': 'Administratör',
        'systemadmin': 'Systemadministratör',
        'teacher': 'Lärare',
        'syv': 'SYV',
        'specped': 'Specped.',
        'coordinator': 'Praktiksamordnare',
        'student': 'Elev'
      };
      return roleMap[role] || role;
    };

    const getAplStatusLabel = (status) => {
      if (!status) return null;
      const statusMap = {
        'GRAY': 'Grå - Ny Elev',
        'BLUE': 'Blå - Kontaktad',
        'YELLOW': 'Gul - APL på gång',
        'PURPLE': 'Lila - Behöver uppföljning',
        'RED': 'Röd - Snart slut',
        'GREEN': 'Grön - Klar praktik',
      };
      return statusMap[status] || status;
    };

    const getFieldLabel = (field) => {
      const fieldLabels = {
        'name': 'Namn',
        'personalNumber': 'Personnummer',
        'phone': 'Telefon',
        'email': 'E-post',
        'municipality': 'Kommun',
        'aplStatus': 'APL-status',
        'startDate': 'Startdatum',
        'endDate': 'Slutdatum',
        'exam': 'Provstatus',
        'additionalInfo': 'Övrigt',
        'specialNeeds': 'Specialbehov'
      };
      return fieldLabels[field] || field;
    };

    const formatChangeValue = (value) => {
      if (value === null || value === undefined || value === '') {
        return '<em>tomt</em>';
      }
      
      // Handle date values
      if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) {
        try {
          return formatDate(value);
        } catch (e) {
          return value;
        }
      }
      
      // Handle objects (like municipality)
      if (typeof value === 'object' && value !== null) {
        if (value.type) {
          return value.type;
        }
        return JSON.stringify(value);
      }
      
      return value;
    };

    const resetPassword = async () => {
      if (!props.student?.user?._id) {
        toast.error('Ingen användare hittades för denna elev.');
        return;
      }
      
      resettingPassword.value = true;
      try {
        const response = await client.post(`/users/${props.student.user._id}/reset-password`);
        studentPassword.value = response.data.tempPassword;
        toast.success('Lösenordet har återställts! Det nya lösenordet visas nedan.');
      } catch (error) {
        console.error('Error resetting password:', error);
        toast.error('Kunde inte återställa lösenord.');
      } finally {
        resettingPassword.value = false;
      }
    };

    // ─── Support Info ─────────────────────────────────────────────────────────

    const loadSupportInfo = async () => {
      try {
        const response = await client.get(`/student-details/${route.params.id}/support`);
        supportInfo.value = response.data.supportInfo || [];
      } catch (err) {
        console.error('Error loading support info:', err);
      }
    };

    const addSupportContact = () => {
      supportEditData.value.push({
        contactName: '',
        contactRole: '',
        contactPhone: '',
        contactEmail: '',
        supportType: '',
        notes: '',
      });
    };

    const removeSupportContact = (idx) => {
      supportEditData.value.splice(idx, 1);
    };

    const saveSupportInfo = async () => {
      savingSupport.value = true;
      try {
        // Filter out empty contacts
        const cleaned = supportEditData.value.filter(c => c.contactName.trim() !== '');
        await client.put(`/student-details/${route.params.id}/support`, {
          supportInfo: cleaned,
        });
        supportInfo.value = cleaned;
        showSupportModal.value = false;
        toast.success('Stödkontakter uppdaterade.');
      } catch (err) {
        console.error('Error saving support info:', err);
        toast.error('Kunde inte spara stödkontakter.');
      } finally {
        savingSupport.value = false;
      }
    };

    // Watch for support modal open to initialize edit data
    watch(showSupportModal, (showing) => {
      if (showing) {
        supportEditData.value = supportInfo.value.map(c => ({ ...c }));
      }
    });

    // ─── Deviations ───────────────────────────────────────────────────────────

    const loadDeviations = async () => {
      loadingDeviations.value = true;
      try {
        const response = await client.get(`/student-details/${route.params.id}/deviations`);
        deviations.value = response.data || [];
      } catch (err) {
        console.error('Error loading deviations:', err);
      } finally {
        loadingDeviations.value = false;
      }
    };

    const saveDeviation = async () => {
      if (!deviationForm.value.title) return;
      savingDeviation.value = true;
      try {
        const payload = {
          type: deviationForm.value.type,
          title: deviationForm.value.title,
          description: deviationForm.value.description,
          reason: deviationForm.value.reason,
          enrollmentId: deviationForm.value.enrollmentId || undefined,
        };
        const response = await client.post(`/student-details/${route.params.id}/deviations`, payload);
        deviations.value.unshift(response.data.deviation);
        showDeviationModal.value = false;
        deviationForm.value = { type: 'deviation', title: '', description: '', reason: '', enrollmentId: '' };
        toast.success('Avvikelse skapad.');
      } catch (err) {
        console.error('Error creating deviation:', err);
        toast.error('Kunde inte skapa avvikelse.');
      } finally {
        savingDeviation.value = false;
      }
    };

    const getDeviationTypeLabel = (type) => {
      const map = { exception: 'Undantag', revision: 'Revidering', deviation: 'Avvikelse' };
      return map[type] || type;
    };

    const getDeviationStatusLabel = (status) => {
      const map = { pending: 'Väntande', approved: 'Godkänd', rejected: 'Avvisad' };
      return map[status] || status;
    };

    const handleDropoutChange = (event) => {
      const checked = event.target.checked;
      // Revert checkbox immediately — ConfirmDialog handles the actual action
      event.target.checked = localStudent.value.dropout;
      dropoutConfirmAction.value = checked ? 'dropout' : 'reactivate';
      showDropoutConfirm.value = true;
    };

    const confirmDropoutAction = async () => {
      showDropoutConfirm.value = false;
      processingDropout.value = true;
      try {
        if (dropoutConfirmAction.value === 'dropout') {
          const response = await client.post(`/student-details/${route.params.id}/dropout`);
          if (response.data && response.data.student) {
            const updatedStudent = response.data.student;
            localStudent.value = {
              ...localStudent.value,
              ...updatedStudent,
              dropout: updatedStudent.dropout === true || updatedStudent.dropout === 'true'
            };
            emit('student-updated', {
              ...updatedStudent,
              dropout: updatedStudent.dropout === true || updatedStudent.dropout === 'true'
            });
          } else {
            localStudent.value.dropout = true;
            emit('student-updated', { dropout: true });
          }
          toast.success('Eleven har markerats som avbrott (inaktiv).');
        } else {
          const response = await client.delete(`/student-details/${route.params.id}/dropout`);
          localStudent.value.dropout = false;
          emit('student-updated', response.data.student);
          toast.success('Avbrott-status har tagits bort för eleven.');
        }
      } catch (error) {
        console.error('Error updating dropout status:', error);
        const action = dropoutConfirmAction.value === 'dropout' ? 'markera elev som avbrott' : 'ta bort avbrott-status';
        toast.error(`Kunde inte ${action}. ` + (error.response?.data?.error || ''));
      } finally {
        processingDropout.value = false;
      }
    };

    const cancelDropoutAction = () => {
      showDropoutConfirm.value = false;
    };
    
    // Watch for changes to props.student and update localStudent
    watch(() => props.student, (newStudent) => {
      if (newStudent) {
        localStudent.value = newStudent;
      }
    }, { immediate: true, deep: true });

    const markCommentsSeen = async () => {
      const comments = localStudent.value?.commentHistory;
      if (!comments || comments.length === 0) return;
      const unseen = comments.filter(c => !c.isDeleted && !(c.seenBy || []).includes(userId.value));
      if (unseen.length === 0) return;
      try {
        await Promise.all(
          unseen.map(c =>
            client.put(`/student-details/${route.params.id}/comments/${c._id}/seen`)
          )
        );
        unseen.forEach(c => {
          if (!c.seenBy) c.seenBy = [];
          c.seenBy.push(userId.value);
        });
      } catch {
        // silent – non-critical
      }
    };

    onMounted(() => {
        initializeEditData();
        loadSupportInfo();
        loadDeviations();
        markCommentsSeen();
    });

    return {
      editMode,
      saving,
      editData,
      municipalities,
      showCommentModal,
      showEditModal,
      newComment,
      editingComment,
      localStudent,
      isAdmin,
      isSpecped,
      specpedAccommodationMode,
      canComment,
      activeComments,
      studentPassword,
      resettingPassword,
      toggleEditMode,
      saveChanges,
      cancelEdit,
      enterSpecpedAccommodationMode,
      cancelSpecpedAccommodationMode,
      saveAccommodations,
      addComment,
      editComment,
      saveEditedComment,
      getAplStatusLabel,
      deleteComment,
      canEditComment,
      canDeleteComment,
      formatDate,
      formatDateTime,
      formatRole,
      getFieldLabel,
      formatChangeValue,
      resetPassword,
      handleDropoutChange,
      processingDropout,
      showDropoutConfirm,
      dropoutConfirmAction,
      confirmDropoutAction,
      cancelDropoutAction,
      // Support
      supportInfo,
      showSupportModal,
      supportEditData,
      savingSupport,
      addSupportContact,
      removeSupportContact,
      saveSupportInfo,
      // Deviations
      deviations,
      loadingDeviations,
      showDeviationModal,
      savingDeviation,
      deviationForm,
      availableEnrollments,
      canCreateDeviation,
      saveDeviation,
      getDeviationTypeLabel,
      getDeviationStatusLabel,
    };
  },
};
</script>
<style scoped>
.content-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(400px, 1fr));
    gap: 20px;
    padding-bottom: 100px;
    min-height: auto;
  }

  .card {
    background: white;
    border-radius: 8px;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
    overflow: hidden;
  }

  .card-header {
    background: #f8f9fa;
    padding: 15px 20px;
    border-bottom: 1px solid #dee2e6;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .card-header h3 {
    margin: 0;
    color: #2c3e50;
  }

  .card-body {
    padding: 20px;
  }

  .info-grid {
    display: grid;
    gap: 15px;
  }

  .info-item {
    display: flex;
    flex-direction: column;
  }

  .info-item label {
    font-weight: 500;
    margin-bottom: 5px;
    color: #6c757d;
  }

  .form-control {
    width: 100%;
    padding: 8px 12px;
    border: 1px solid #ddd;
    border-radius: 4px;
    font-size: 14px;
  }

  .edit-actions {
    margin-top: 20px;
    display: flex;
    gap: 10px;
  }

  .btn {
    padding: 8px 16px;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-size: 14px;
    text-decoration: none;
    display: inline-block;
  }

  .btn-primary {
    background: #007bff;
    color: white;
  }

  .btn-secondary {
    background: #6c757d;
    color: white;
  }

  .btn-success {
    background: #28a745;
    color: white;
  }

  .btn-danger {
    background: #dc3545;
    color: white;
  }

  .btn-outline-primary {
    background: transparent;
    color: #007bff;
    border: 1px solid #007bff;
  }

  .btn-outline-danger {
    background: transparent;
    color: #dc3545;
    border: 1px solid #dc3545;
  }

  .btn-sm {
    padding: 4px 8px;
    font-size: 12px;
  }
  .comments-list {
    display: flex;
    flex-direction: column;
    gap: 15px;
  }

  .comment-item {
    padding: 15px;
    border: 1px solid #dee2e6;
    border-radius: 4px;
  }

  .comment-item.deleted {
    opacity: 0.6;
  }

  .comment-header {
    display: flex;
    gap: 10px;
    align-items: center;
    margin-bottom: 10px;
  }

  .comment-author {
    font-weight: 500;
  }

  .comment-date {
    color: #6c757d;
    font-size: 12px;
  }

  .comment-role {
    background: #6c757d;
    color: white;
    padding: 2px 6px;
    border-radius: 8px;
    font-size: 10px;
  }

  .comment-content {
    margin-bottom: 10px;
  }

  .deleted-text {
    color: #dc3545;
    font-style: italic;
  }

  .comment-edited {
    font-size: 12px;
    color: #6c757d;
    margin-bottom: 10px;
  }

  .comment-actions {
    display: flex;
    gap: 10px;
  }

  .history-list {
    display: flex;
    flex-direction: column;
    gap: 20px;
  }

  .history-item {
    padding: 20px;
    border: 1px solid #dee2e6;
    border-radius: 8px;
    background: #f8f9fa;
    transition: box-shadow 0.2s;
  }

  .history-item:hover {
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  }

  .history-header {
    margin-bottom: 15px;
    padding-bottom: 10px;
    border-bottom: 2px solid #dee2e6;
  }

  .history-meta {
    display: flex;
    gap: 15px;
    align-items: center;
    flex-wrap: wrap;
  }

  .history-date {
    font-weight: 600;
    color: #495057;
    font-size: 14px;
  }

  .history-user {
    background: #007bff;
    color: white;
    padding: 4px 10px;
    border-radius: 12px;
    font-size: 11px;
    font-weight: 500;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .history-changes {
    display: flex;
    flex-direction: column;
    gap: 15px;
  }

  .change-item {
    background: white;
    padding: 12px;
    border-radius: 6px;
    border-left: 3px solid #007bff;
  }

  .change-field-label {
    font-weight: 600;
    color: #495057;
    margin-bottom: 8px;
    font-size: 14px;
  }

  .change-values {
    display: flex;
    align-items: center;
    gap: 15px;
    flex-wrap: wrap;
  }

  .change-value {
    display: flex;
    flex-direction: column;
    gap: 4px;
    flex: 1;
    min-width: 150px;
  }

  .change-label {
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: #6c757d;
  }

  .change-content {
    padding: 6px 10px;
    border-radius: 4px;
    font-size: 13px;
    word-break: break-word;
  }

  .change-value.old .change-content {
    background: #fff5f5;
    color: #dc3545;
    text-decoration: line-through;
  }

  .change-value.new .change-content {
    background: #f0fff4;
    color: #28a745;
    font-weight: 500;
  }

  .change-arrow {
    color: #6c757d;
    font-size: 20px;
    font-weight: bold;
    flex-shrink: 0;
  }

  .change-content em {
    color: #6c757d;
    font-style: italic;
  }
    .modal-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
  }

  .modal-content {
    background: white;
    border-radius: 8px;
    width: 90%;
    max-width: 500px;
    max-height: 80vh;
    overflow-y: auto;
  }

  .modal-header {
    padding: 20px;
    border-bottom: 1px solid #dee2e6;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .modal-header h3 {
    margin: 0;
  }

  .close-btn {
    background: none;
    border: none;
    font-size: 24px;
    cursor: pointer;
    color: #6c757d;
  }

  .modal-body {
    padding: 20px;
  }

  .modal-footer {
    padding: 20px;
    border-top: 1px solid #dee2e6;
    display: flex;
    gap: 10px;
    justify-content: flex-end;
  }
  .no-comments,
  .no-history {
    text-align: center;
    color: #6c757d;
    font-style: italic;
    padding: 20px;
  }
  .checkbox-group {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    align-items: center;
  }
  .checkbox-label {
    display: flex;
    align-items: center;
    gap: 6px;
    font-weight: normal;
    cursor: pointer;
  }
  .checkbox-label input[type="checkbox"] {
    width: 16px;
    height: 16px;
  }
  .badge {
    font-size: 0.75rem;
    padding: 3px 8px;
  }

  /* Support Contacts */
  .support-list {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .support-item {
    padding: 12px;
    border: 1px solid #dee2e6;
    border-left: 4px solid #17a2b8;
    border-radius: 4px;
    background: #f8fbfd;
  }

  .support-name {
    font-weight: 600;
    color: #2c3e50;
  }

  .support-role {
    font-size: 0.85rem;
    color: #6c757d;
    margin-bottom: 4px;
  }

  .support-details {
    font-size: 0.9rem;
    color: #495057;
  }

  .support-type {
    margin-top: 4px;
  }

  .support-notes {
    margin-top: 6px;
    font-size: 0.85rem;
    color: #6c757d;
    font-style: italic;
  }

  .empty-state {
    text-align: center;
    color: #6c757d;
    padding: 16px;
  }

  /* Support Edit Modal */
  .support-edit-item {
    border: 1px solid #dee2e6;
    border-radius: 4px;
    padding: 10px;
    margin-bottom: 10px;
  }

  .support-edit-row {
    display: flex;
    gap: 8px;
    margin-bottom: 8px;
  }

  .support-edit-row:last-child {
    margin-bottom: 0;
  }

  .support-edit-row .form-control {
    flex: 1;
  }

  .modal-wide {
    max-width: 700px;
  }

  /* Deviations */
  .deviations-list {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .deviation-item {
    padding: 12px;
    border: 1px solid #dee2e6;
    border-radius: 4px;
  }

  .deviation-item.deviation-pending {
    border-left: 4px solid #ffc107;
    background: #fffdf5;
  }

  .deviation-item.deviation-approved {
    border-left: 4px solid #28a745;
    background: #f6fff8;
  }

  .deviation-item.deviation-rejected {
    border-left: 4px solid #dc3545;
    background: #fff8f8;
  }

  .deviation-header {
    display: flex;
    gap: 8px;
    margin-bottom: 6px;
  }

  .deviation-type-badge {
    padding: 2px 8px;
    border-radius: 4px;
    font-size: 0.75rem;
    font-weight: 500;
  }

  .deviation-type-badge.type-deviation {
    background: #e2e3e5;
    color: #383d41;
  }

  .deviation-type-badge.type-exception {
    background: #fff3cd;
    color: #856404;
  }

  .deviation-type-badge.type-revision {
    background: #cce5ff;
    color: #004085;
  }

  .deviation-status-badge {
    padding: 2px 8px;
    border-radius: 4px;
    font-size: 0.75rem;
    font-weight: 500;
  }

  .deviation-status-badge.status-pending {
    background: #fff3cd;
    color: #856404;
  }

  .deviation-status-badge.status-approved {
    background: #d4edda;
    color: #155724;
  }

  .deviation-status-badge.status-rejected {
    background: #f8d7da;
    color: #721c24;
  }

  .deviation-title {
    font-weight: 600;
    color: #2c3e50;
  }

  .deviation-description {
    font-size: 0.9rem;
    color: #495057;
    margin-top: 4px;
  }

  .deviation-meta {
    font-size: 0.8rem;
    color: #6c757d;
    margin-top: 6px;
  }

  .loading-small {
    text-align: center;
    color: #6c757d;
    padding: 12px;
  }
</style>