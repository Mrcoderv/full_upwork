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
  </div>
</template>

<script>
import { ref, computed, onMounted, watch } from 'vue';
import { useRoute } from 'vue-router';
import { useStore } from 'vuex';
import client from '@/api/client.js';
import { useToast } from '@/composables/useToast.js';

export default {
  name: 'GeneralTab',
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

    const editData = ref({});

    const municipalities = [
      'Botkyrka', 'Danderyd', 'Huddinge', 'Järfälla', 'KCNO', 'Lidingö', 'Norrtälje',
      'Nykvarn', 'Privat kunder', 'Salem', 'Sigtuna', 'Sollentuna', 'Solna',
      'Sundbyberg', 'Södertälje', 'Täby', 'Upplands Bro', 'Upplands Väsby',
      'Vallentuna', 'Vaxholm', 'Växjö', 'Österåker',
    ];

    const isAdmin = computed(() => store.getters.isAdmin);
    const userRole = computed(() => store.getters.userRole);
    const userId = computed(() => store.getters.userId);

    const canComment = computed(() => ['teacher', 'admin', 'systemadmin'].includes(userRole.value));

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

    const handleDropoutChange = async (event) => {
      const checked = event.target.checked;
      
      processingDropout.value = true;
      
      try {
        if (checked) {
          // Setting to dropout (checked = true) - use dedicated endpoint
          const confirmed = confirm(
            `Är du säker på att du vill markera ${localStudent.value.name} som avbrott (inaktiv)?\n\n` +
            `Detta kommer att:\n` +
            `- Ta bort eleven från APL-listor\n` +
            `- Ta bort eleven från slutprov\n` +
            `- Skicka en notis till ansvarig lärare`
          );

          if (!confirmed) {
            event.target.checked = false;
            return;
          }

          console.log('📤 Sending dropout request for student:', route.params.id);
          const response = await client.post(`/student-details/${route.params.id}/dropout`);
          console.log('✅ Dropout response:', response.data);
          
          // Update local student with the response
          if (response.data && response.data.student) {
            const updatedStudent = response.data.student;
            console.log('📝 Updating localStudent with:', updatedStudent);
            console.log('📝 updatedStudent.dropout:', updatedStudent.dropout);
            console.log('📝 updatedStudent.dropout type:', typeof updatedStudent.dropout);
            
            // Ensure dropout is explicitly set
            localStudent.value = { 
              ...localStudent.value, 
              ...updatedStudent,
              dropout: updatedStudent.dropout === true || updatedStudent.dropout === 'true'
            };
            console.log('✅ localStudent.value.dropout after update:', localStudent.value.dropout);
            console.log('✅ localStudent.value object:', JSON.stringify(localStudent.value, null, 2));
            
            // Emit the full updated student with explicit dropout flag
            emit('student-updated', {
              ...updatedStudent,
              dropout: updatedStudent.dropout === true || updatedStudent.dropout === 'true'
            });
          } else {
            console.warn('⚠️ No student data in response, using fallback');
            // Fallback: just set dropout flag
            localStudent.value.dropout = true;
            emit('student-updated', { dropout: true });
          }
          
          toast.success('Eleven har markerats som avbrott (inaktiv).');
        } else {
          // Unchecking (setting to false) - use update endpoint
          const confirmed = confirm(
            `Är du säker på att du vill ta bort avbrott-status för ${localStudent.value.name}?\n\n` +
            `Eleven kommer att:\n` +
            `- Återfås i APL-listor (om relevant)\n` +
            `- Kunna registreras för slutprov igen`
          );

          if (!confirmed) {
            event.target.checked = true;
            return;
          }

          const response = await client.delete(`/student-details/${route.params.id}/dropout`);
          localStudent.value.dropout = false;
          emit('student-updated', response.data.student);
          toast.success('Avbrott-status har tagits bort för eleven.');
        }
      } catch (error) {
        console.error('Error updating dropout status:', error);
        const action = checked ? 'markera elev som avbrott' : 'ta bort avbrott-status';
        toast.error(`Kunde inte ${action}. ` + (error.response?.data?.error || ''));
        // Revert checkbox to original state
        event.target.checked = localStudent.value.dropout;
      } finally {
        processingDropout.value = false;
      }
    };
    
    // Watch for changes to props.student and update localStudent
    watch(() => props.student, (newStudent) => {
      if (newStudent) {
        localStudent.value = newStudent;
      }
    }, { immediate: true, deep: true });

    onMounted(() => {
        initializeEditData();
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
      canComment,
      activeComments,
      studentPassword,
      resettingPassword,
      toggleEditMode,
      saveChanges,
      cancelEdit,
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
</style>