<template>
  <div class="account-info">
    <section v-if="userType === 'Elev'">
      <!-- Loading and Error States -->
      <div v-if="loading" class="loading">
        <div class="spinner"></div>
        <p>Laddar elevinformation...</p>
      </div>

      <div v-else-if="error" class="error-message">
        <p>{{ error }}</p>
      </div>

      <div v-else-if="student" class="content-grid">
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
            </div>
          </div>
        </div>

        <!-- Education Card -->
        <div class="card">
          <div class="card-header">
            <h3>Utbildning</h3>
            <div v-if="student.enrollmentStats" class="enrollment-stats">
              <span class="stat-item">
                <strong>{{ student.enrollmentStats.totalEnrollments }}</strong>
                totalt
              </span>
              <span class="stat-item">
                <strong>{{ student.enrollmentStats.activeEnrollments }}</strong>
                aktiva
              </span>
            </div>
          </div>
          <div class="card-body">
            <div
              class="education-scroll-container"
              style="
                max-height: 400px;
                overflow-y: auto;
                border: 2px solid #007bff;
                background-color: #f8f9fa;
                padding: 10px;
                border-radius: 4px;
              "
            >
              <div v-if="student.education && student.education.length > 0" class="education-list">
                <div
                  v-for="(edu, index) in student.education"
                  :key="edu._id || index"
                  class="education-item"
                  :class="{ 'enrollment-item': edu.isEnrollment }"
                >
                  <div class="education-header">
                    <span class="education-type">{{ edu.type }}</span>
                    <span v-if="edu.isEnrollment" class="enrollment-badge">Inskriven</span>
                    <span class="education-name">
                      {{ getEducationName(edu) }}
                    </span>
                  </div>

                  <div class="education-details">
                    <div v-if="edu.startDate && edu.endDate" class="education-dates">
                      {{ formatDate(edu.startDate) }} - {{ formatDate(edu.endDate) }}
                    </div>

                    <div v-if="edu.status" class="education-status">
                      Status:
                      <span :class="'status-' + edu.status">{{ edu.status }}</span>
                    </div>

                    <div v-if="edu.grade" class="education-grade">Betyg: {{ edu.grade }}</div>

                    <div v-if="edu.isEnrollment && edu.courseInstance" class="course-instance-info">
                      Kursinstans: {{ edu.courseInstance.courseName }} ({{
                        formatDate(edu.courseInstance.startDate)
                      }}
                      - {{ formatDate(edu.courseInstance.endDate) }})
                    </div>
                  </div>
                </div>
              </div>
              <div v-else class="no-education">Ingen utbildning registrerad</div>
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
                v-for="(comment, index) in activeComments"
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

        <!-- Meeting Button -->
        <div class="card">
          <div class="card-body">
            <button
              v-if="['syv', 'specialpedagog'].includes(userRole)"
              class="btn btn-secondary"
              @click="openMeetingModal"
            >
              Boka möte med eleven
            </button>
            <MeetingModal
              v-if="showMeetingModal"
              :studentId="student._id"
              :studentName="student.name"
              @close="showMeetingModal = false"
            />
          </div>
        </div>
      </div>
    </section>

    <!-- Non-student section (teachers, etc.) -->
    <section v-else>
      <div class="card">
        <div class="card-header">
          <h3>Användarinformation</h3>
        </div>
        <div class="card-body">
          <div class="info-item" v-for="(value, key) in editablePersonalData" :key="key">
            <strong>{{ fieldPersonalLabels[key] }}:</strong>
            <span v-if="!editFields[key]">{{ value || '-' }}</span>
            <input v-else v-model="editablePersonalData[key]" class="form-control" />
            <button @click="toggleEdit(key)" class="btn btn-sm" :class="editFields[key] ? 'btn-primary' : 'btn-outline-primary'">
              <i :class="editFields[key] ? 'fas fa-save' : 'fas fa-edit'"></i>
            </button>
          </div>
        </div>
      </div>

      <!-- Roles section (Admin only) -->
      <div v-if="isAdmin" class="card">
        <div class="card-header">
          <h3>Användarroller</h3>
        </div>
        <div class="card-body">
          <div v-if="loadingRoles" class="loading">
            <p>Laddar roller...</p>
          </div>
          <div v-else>
            <div class="roles-list">
              <div
                v-for="role in availableRoles"
                :key="role.value"
                class="role-item"
                :class="{ selected: selectedRoles.includes(role.value) }"
                @click="toggleRole(role.value)"
              >
                {{ role.label }}
              </div>
            </div>
            <div class="form-actions">
              <button 
                @click="saveRoles" 
                class="btn btn-primary" 
                :disabled="isSavingRoles || !hasChanges"
              >
                {{ isSavingRoles ? 'Sparar...' : 'Spara roller' }}
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- Editable Permission Matrix Section -->
      <div v-if="isAdmin" class="card">
        <div class="card-header">
          <h3>Behörighetsmatris</h3>
          <p class="small text-muted">Klicka på kryssrutor för att aktivera/inaktivera behörigheter för denna användare</p>
        </div>
        <div class="card-body">
          <div class="permission-matrix-container">
            <table class="permission-matrix editable">
              <thead>
                <tr>
                  <th>Funktion</th>
                  <th class="permission-toggle-header">Tillåt</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="feature in features" :key="feature.value">
                  <td class="feature-name">{{ feature.label }}</td>
                  <td class="permission-cell editable-cell">
                    <label class="permission-checkbox">
                      <input
                        type="checkbox"
                        :checked="hasPermission(feature.value)"
                        @change="togglePermission(feature.value, $event.target.checked)"
                      />
                      <span class="checkmark"></span>
                    </label>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <div class="form-actions mt-3">
            <button 
              @click="savePermissions" 
              class="btn btn-primary" 
              :disabled="isSavingPermissions || !hasPermissionChanges"
            >
              {{ isSavingPermissions ? 'Sparar...' : 'Spara behörigheter' }}
            </button>
          </div>
        </div>
      </div>

    </section>

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
  import { computed, ref, watch, onMounted } from 'vue'
  import { useStore } from 'vuex'
  import client from '@/api/client.js'
  import { useToast } from '@/composables/useToast.js'
  import MeetingModal from '../MeetingModal.vue'

  export default {
    props: {
      userData: Object,
      userType: String,
    },
    components: {
      MeetingModal,
    },
    setup(props) {
      const store = useStore()
      const toast = useToast()
      const userRole = computed(() => store.getters.userRole || 'guest')
      const isAdmin = computed(() => store.getters.isAdmin)
      const userId = computed(() => store.getters.userId)

      // Student-specific state
      const student = ref(null)
      const loading = ref(false)
      const error = ref(null)
      const editMode = ref(false)
      const saving = ref(false)
      const showCommentModal = ref(false)
      const showEditModal = ref(false)
      const newComment = ref('')
      const editingComment = ref(null)
      const changeHistory = ref([])
      const editData = ref({})
      const studentPassword = ref(null)
      const resettingPassword = ref(false)

      // Non-student state
      const editablePersonalData = ref({})
      const showMeetingModal = ref(false)
      const editFields = ref({})
      const selectedRoles = ref([])
      const originalRoles = ref([])
      const isSavingRoles = ref(false)
      const loadingRoles = ref(false)
      
      // Custom permissions state
      const customPermissions = ref({})
      const originalPermissions = ref({})
      const isSavingPermissions = ref(false)
      
      // Permission matrix based on requirements
      const PERMISSION_MATRIX = {
        calendar_final_exam: {
          systemadmin: 'Skapa, redigera, ändra till tidigare version',
          admin: 'Skapa, redigera',
          teacher: 'Endast titta',
          syv: 'Lägga in mö',
          specped: 'Lägga in mö',
          coordinator: 'Nej',
          student: 'Endast deras egna inbokade slutprov',
        },
        search_content: {
          systemadmin: 'Ja',
          admin: 'Ja',
          teacher: 'Ja',
          syv: 'Ja',
          specped: 'Ja',
          coordinator: 'Ja',
          student: 'Nej',
        },
        search_users: {
          systemadmin: 'Ja',
          admin: 'Ja',
          teacher: 'Ja',
          syv: 'Ja',
          specped: 'Ja',
          coordinator: 'Ja',
          student: 'Nej',
        },
        statistics: {
          systemadmin: 'Ja',
          admin: 'Ja',
          teacher: 'Ja',
          syv: 'Ja',
          specped: 'Ja',
          coordinator: 'Nej',
          student: 'Nej',
        },
        manage_users_permissions: {
          systemadmin: 'Ja',
          admin: 'Ja',
          teacher: 'Nej',
          syv: 'Nej',
          specped: 'Nej',
          coordinator: 'Nej',
          student: 'Nej',
        },
        hierarchy_management: {
          systemadmin: 'Ja',
          admin: 'Nej',
          teacher: 'Nej',
          syv: 'Nej',
          specped: 'Nej',
          coordinator: 'Nej',
          student: 'Nej',
        },
        own_settings: {
          systemadmin: 'Ja',
          admin: 'Ja',
          teacher: 'Ja',
          syv: 'Ja',
          specped: 'Ja',
          coordinator: 'Ja',
          student: 'Ja',
        },
        add_municipalities_courses: {
          systemadmin: 'Ja',
          admin: 'Nej',
          teacher: 'Nej',
          syv: 'Nej',
          specped: 'Nej',
          coordinator: 'Nej',
          student: 'Nej',
        },
      };

      const FEATURES = [
        { value: 'calendar_final_exam', label: 'Kalender (slutprov)' },
        { value: 'search_content', label: 'Söka efter innehåll' },
        { value: 'search_users', label: 'Söka efter användare' },
        { value: 'statistics', label: 'Statistik' },
        { value: 'manage_users_permissions', label: 'Hantering av användar och åtkomstbehörigheter' },
        { value: 'hierarchy_management', label: 'Hierarkihantering?' },
        { value: 'own_settings', label: 'Egna inställningar (ex profilbild)' },
        { value: 'add_municipalities_courses', label: 'Lägga till kommuner, kurser etc' },
      ];

      const availableRoles = [
        { value: 'systemadmin', label: 'Systemadministratör' },
        { value: 'admin', label: 'Administratör' },
        { value: 'teacher', label: 'Lärare' },
        { value: 'syv', label: 'SYV' },
        { value: 'specped', label: 'Specped.' },
        { value: 'coordinator', label: 'Praktiksamordnar' },
        { value: 'student', label: 'Elev' },
      ];

      const features = ref(FEATURES);

      const getPermissionText = (role, feature) => {
        return PERMISSION_MATRIX[feature]?.[role] || 'Nej';
      };

      const getPermissionClass = (role, feature) => {
        const permission = getPermissionText(role, feature);
        if (permission === 'Ja') {
          return 'permission-yes';
        } else if (permission === 'Nej') {
          return 'permission-no';
        } else {
          return 'permission-limited';
        }
      };

      // Check if user has custom permission for a feature
      const hasPermission = (feature) => {
        // Check custom permissions first - if explicitly set (true or false), use that
        if (customPermissions.value && customPermissions.value.hasOwnProperty(feature)) {
          return customPermissions.value[feature] === true;
        }
        // If no custom permission set, check if any of the user's roles have this permission
        const userRoles = selectedRoles.value;
        for (const role of userRoles) {
          const rolePermission = getPermissionText(role, feature);
          if (rolePermission && rolePermission !== 'Nej') {
            return true;
          }
        }
        return false;
      };

      // Toggle permission for a feature
      const togglePermission = (feature, enabled) => {
        // Create a new object to ensure reactivity
        customPermissions.value = {
          ...customPermissions.value,
          [feature]: enabled
        };
      };

      // Check if permissions have changed
      const hasPermissionChanges = computed(() => {
        // Normalize both objects - remove undefined and null values, sort keys
        const normalize = (obj) => {
          if (!obj || typeof obj !== 'object') return {};
          const normalized = {};
          Object.keys(obj).sort().forEach(key => {
            const value = obj[key];
            // Only include truthy values or explicit false (but not undefined/null)
            if (value !== undefined && value !== null) {
              normalized[key] = value;
            }
          });
          return normalized;
        };
        
        const currentNormalized = normalize(customPermissions.value);
        const originalNormalized = normalize(originalPermissions.value);
        
        const current = JSON.stringify(currentNormalized);
        const original = JSON.stringify(originalNormalized);
        
        const hasChanges = current !== original;
        
        // Debug logging (can be removed later)
        if (hasChanges) {
          console.log('Permission changes detected:', {
            current: currentNormalized,
            original: originalNormalized
          });
        }
        
        return hasChanges;
      });

      // Save custom permissions
      const savePermissions = async () => {
        if (!props.userData?._id) return;
        isSavingPermissions.value = true;
        try {
          await client.put(`/users/${props.userData._id}/permissions`, {
            permissions: customPermissions.value,
          });
          originalPermissions.value = JSON.parse(JSON.stringify(customPermissions.value));
          toast.success('Behörigheterna har uppdaterats!');
        } catch (error) {
          console.error('Error saving permissions:', error);
          toast.error('Kunde inte spara behörigheter.');
        } finally {
          isSavingPermissions.value = false;
        }
      };

      const municipalities = [
        'Botkyrka',
        'Danderyd',
        'Huddinge',
        'Järfälla',
        'KCNO',
        'Lidingö',
        'Norrtälje',
        'Nykvarn',
        'Privat kunder',
        'Salem',
        'Sigtuna',
        'Sollentuna',
        'Solna',
        'Sundbyberg',
        'Södertälje',
        'Täby',
        'Upplands Bro',
        'Upplands Väsby',
        'Vallentuna',
        'Vaxholm',
        'Växjö',
        'Österåker',
      ]

      const fieldPersonalLabels = {
        username: 'Användarnamn',
        email: 'Email',
      }

      // Computed properties
      const canComment = computed(() =>
        ['teacher', 'admin', 'systemadmin'].includes(userRole.value)
      )

      const activeComments = computed(() => {
        if (!student.value?.commentHistory) return []
        return student.value.commentHistory.filter((comment) => !comment.isDeleted)
      })

      // Methods for student functionality
      const loadStudent = async () => {
        if (props.userType !== 'Elev' || !props.userData?._id) return

        try {
          loading.value = true
          error.value = null

          const response = await client.get(`/student-details/${props.userData._id}`)
          student.value = response.data

          // Initialize edit data
          editData.value = {
            name: student.value.name || '',
            personalNumber: student.value.personalNumber || '',
            phone: student.value.phone || '',
            email: student.value.email || '',
            municipality: { type: student.value.municipality?.type || '' },
            startDate: student.value.startDate
              ? new Date(student.value.startDate).toISOString().split('T')[0]
              : '',
            endDate: student.value.endDate
              ? new Date(student.value.endDate).toISOString().split('T')[0]
              : '',
            exam: student.value.exam || '',
            additionalInfo: student.value.additionalInfo || '',
          }

          // Load change history if admin
          if (isAdmin.value) {
            await loadChangeHistory()
          }
        } catch (err) {
          console.error('Error loading student:', err)
          error.value = 'Kunde inte ladda elevinformation'
        } finally {
          loading.value = false
        }
      }

      const loadChangeHistory = async () => {
        try {
          const response = await client.get(`/student-details/${props.userData._id}/history`)
          changeHistory.value = response.data.changeHistory
        } catch (err) {
          console.error('Error loading change history:', err)
        }
      }

      const toggleEditMode = () => {
        editMode.value = !editMode.value
      }

      const saveChanges = async () => {
        try {
          saving.value = true

          const response = await client.put(`/student-details/${props.userData._id}`, editData.value)

          // Update local data
          Object.assign(student.value, response.data.student)

          editMode.value = false

          // Reload change history
          if (isAdmin.value) {
            await loadChangeHistory()
          }
        } catch (err) {
          console.error('Error saving changes:', err)
          toast.error('Kunde inte spara ändringar')
        } finally {
          saving.value = false
        }
      }

      const cancelEdit = () => {
        editMode.value = false
        // Reset edit data
        editData.value = {
          name: student.value.name || '',
          personalNumber: student.value.personalNumber || '',
          phone: student.value.phone || '',
          email: student.value.email || '',
          municipality: { type: student.value.municipality?.type || '' },
          startDate: student.value.startDate
            ? new Date(student.value.startDate).toISOString().split('T')[0]
            : '',
          endDate: student.value.endDate
            ? new Date(student.value.endDate).toISOString().split('T')[0]
            : '',
          exam: student.value.exam || '',
          additionalInfo: student.value.additionalInfo || '',
        }
      }

      const addComment = async () => {
        try {
          const response = await client.post(`/student-details/${props.userData._id}/comments`, {
            comment: newComment.value,
          })

          student.value.commentHistory = response.data.commentHistory
          newComment.value = ''
          showCommentModal.value = false
        } catch (err) {
          console.error('Error adding comment:', err)
          toast.error('Kunde inte lägga till kommentar')
        }
      }

      const editComment = (comment) => {
        editingComment.value = { ...comment }
        showEditModal.value = true
      }

      const saveEditedComment = async () => {
        try {
          await client.put(
            `/student-details/${props.userData._id}/comments/${editingComment.value._id}`,
            {
              comment: editingComment.value.comment,
            }
          )

          // Update local comment
          const commentIndex = student.value.commentHistory.findIndex(
            (c) => c._id === editingComment.value._id
          )
          if (commentIndex !== -1) {
            student.value.commentHistory[commentIndex] = editingComment.value
          }

          showEditModal.value = false
          editingComment.value = null
        } catch (err) {
          console.error('Error editing comment:', err)
          toast.error('Kunde inte redigera kommentar')
        }
      }

      const deleteComment = async (commentId) => {
        if (!confirm('Är du säker på att du vill radera denna kommentar?')) return

        try {
          await client.delete(`/student-details/${props.userData._id}/comments/${commentId}`)

          // Update local comment
          const commentIndex = student.value.commentHistory.findIndex((c) => c._id === commentId)
          if (commentIndex !== -1) {
            student.value.commentHistory[commentIndex].isDeleted = true
            student.value.commentHistory[commentIndex].comment = '[DELETED]'
          }
        } catch (err) {
          console.error('Error deleting comment:', err)
          toast.error('Kunde inte radera kommentar')
        }
      }

      const canEditComment = (comment) => {
        return comment.authorId === userId.value || isAdmin.value
      }

      const canDeleteComment = (comment) => {
        return comment.authorId === userId.value || isAdmin.value
      }

      const getEducationName = (edu) => {
        // First try to use the name field (which we populated in the schema)
        if (edu.name) {
          return edu.name
        }

        // Fallback to refId if name is not available
        if (!edu.refId) return 'Okänd'

        if (edu.type === 'Course') {
          return edu.refId.courseName || 'Okänd kurs'
        } else if (edu.type === 'CoursePackage') {
          return edu.refId.coursePackageName || 'Okänt kurspaket'
        } else if (edu.type === 'Program') {
          return edu.refId.programName || 'Okänt program'
        }

        return 'Okänd'
      }

      const formatDate = (date) => {
        if (!date) return ''
        return new Date(date).toLocaleDateString('sv-SE')
      }

      const formatDateTime = (date) => {
        if (!date) return ''
        const d = new Date(date)
        return d.toLocaleString('sv-SE', {
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit'
        })
      }

      const formatRole = (role) => {
        const roleMap = {
          'admin': 'Administratör',
          'systemadmin': 'Systemadministratör',
          'teacher': 'Lärare',
          'syv': 'SYV',
          'specped': 'Specped.',
          'coordinator': 'Praktiksamordnare',
          'student': 'Elev'
        }
        return roleMap[role] || role
      }

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
        }
        return fieldLabels[field] || field
      }

      const formatChangeValue = (value) => {
        if (value === null || value === undefined || value === '') {
          return '<em>tomt</em>'
        }
        
        // Handle date values
        if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) {
          try {
            return formatDate(value)
          } catch (e) {
            return value
          }
        }
        
        // Handle objects (like municipality)
        if (typeof value === 'object' && value !== null) {
          if (value.type) {
            return value.type
          }
          return JSON.stringify(value)
        }
        
        return value
      }

      // Methods for non-student functionality
      const updateEditableData = async () => {
        editablePersonalData.value = {
          username: props.userData?.username || '',
          email: props.userData?.email || '',
        }
        
        // Load roles if admin
        if (isAdmin.value && props.userData?._id) {
          await loadRoles()
        }
      }
      
      const loadRoles = async () => {
        if (!props.userData?._id) return
        loadingRoles.value = true
        try {
          // The userData should already have roles from the details endpoint
          const roles = props.userData?.roles || []
          // Ensure we're working with role values (strings), not objects
          selectedRoles.value = Array.isArray(roles) ? [...roles] : []
          originalRoles.value = Array.isArray(roles) ? [...roles] : []
          
          // Load custom permissions
          const permissions = props.userData?.permissions || {}
          customPermissions.value = permissions && typeof permissions === 'object' 
            ? JSON.parse(JSON.stringify(permissions))
            : {}
          originalPermissions.value = JSON.parse(JSON.stringify(customPermissions.value))
        } catch (error) {
          console.error('Error loading roles:', error)
        } finally {
          loadingRoles.value = false
        }
      }
      
      const toggleRole = (roleValue) => {
        const index = selectedRoles.value.indexOf(roleValue)
        if (index > -1) {
          selectedRoles.value.splice(index, 1)
        } else {
          selectedRoles.value.push(roleValue)
        }
      }
      
      const hasChanges = computed(() => {
        const current = [...selectedRoles.value].sort().join(',')
        const original = [...originalRoles.value].sort().join(',')
        return current !== original
      })
      
      const saveRoles = async () => {
        if (!props.userData?._id) return
        isSavingRoles.value = true
        try {
          await client.put(`/users/${props.userData._id}/roles`, {
            roles: selectedRoles.value,
          })
          originalRoles.value = [...selectedRoles.value]
          toast.success('Rollerna har uppdaterats!')
        } catch (error) {
          console.error('Error saving roles:', error)
          toast.error('Kunde inte spara roller.')
        } finally {
          isSavingRoles.value = false
        }
      }

      const toggleEdit = async (key) => {
        if (editFields.value[key]) {
          try {
            const endpoint = `/update-user/${props.userData._id}`

            const response = await client.put(endpoint, {
              [key]: editablePersonalData.value[key],
            })

            console.log('✅ Uppdatering lyckades:', response.data)
          } catch (error) {
            console.error(
              '❌ Fel vid uppdatering av fält:',
              error.response ? error.response.data : error.message
            )
          }
        }
        editFields.value[key] = !editFields.value[key]
      }

      const openMeetingModal = () => {
        showMeetingModal.value = true
      }

      const resetPassword = async () => {
        if (!student.value?.user?._id) {
          toast.error('Ingen användare hittades för denna elev.')
          return
        }
        
        resettingPassword.value = true
        try {
          const response = await client.post(`/users/${student.value.user._id}/reset-password`)
          studentPassword.value = response.data.tempPassword
          toast.success('Lösenordet har återställts! Det nya lösenordet visas nedan.')
        } catch (error) {
          console.error('Error resetting password:', error)
          toast.error('Kunde inte återställa lösenord.')
        } finally {
          resettingPassword.value = false
        }
      }

      // Watch for changes and load student data
      watch(
        () => props.userData,
        () => {
          if (props.userType === 'Elev') {
            loadStudent()
          } else {
            updateEditableData()
          }
        },
        { immediate: true }
      )

      onMounted(() => {
        if (props.userType === 'Elev') {
          loadStudent()
        } else {
          updateEditableData()
        }
      })

      return {
        // Student-specific
        student,
        // Non-student specific
        selectedRoles,
        availableRoles,
        features,
        getPermissionText,
        getPermissionClass,
        customPermissions,
        hasPermission,
        togglePermission,
        savePermissions,
        isSavingPermissions,
        hasPermissionChanges,
        loadingRoles,
        isSavingRoles,
        hasChanges,
        toggleRole,
        saveRoles,
        loading,
        error,
        editMode,
        saving,
        editData,
        municipalities,
        showCommentModal,
        showEditModal,
        newComment,
        editingComment,
        changeHistory,
        studentPassword,
        resettingPassword,
        resetPassword,
        isAdmin,
        userRole,
        userId,
        canComment,
        activeComments,
        toggleEditMode,
        saveChanges,
        cancelEdit,
        addComment,
        editComment,
        saveEditedComment,
        deleteComment,
        canEditComment,
        canDeleteComment,
        getEducationName,
        formatDate,
        formatDateTime,
        formatRole,
        getFieldLabel,
        formatChangeValue,

        // Non-student
        editablePersonalData,
        showMeetingModal,
        editFields,
        toggleEdit,
        openMeetingModal,
        fieldPersonalLabels,
      }
    },
  }
</script>

<style scoped>
  .account-info {
    padding: 20px;
  }

  .content-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(400px, 1fr));
    gap: 20px;
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

  .education-list {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .education-item {
    padding: 10px;
    border: 1px solid #dee2e6;
    border-radius: 4px;
  }

  .enrollment-item {
    border-left: 4px solid #28a745;
    background-color: #f8fff9;
  }

  .education-header {
    display: flex;
    gap: 10px;
    align-items: center;
  }

  .education-type {
    background: #007bff;
    color: white;
    padding: 2px 8px;
    border-radius: 12px;
    font-size: 12px;
  }

  .enrollment-badge {
    background: #28a745;
    color: white;
    padding: 2px 8px;
    border-radius: 12px;
    font-size: 10px;
  }

  .education-name {
    font-weight: 500;
  }

  .education-details {
    margin-top: 10px;
    font-size: 14px;
    color: #6c757d;
  }

  .education-dates {
    margin-bottom: 5px;
  }

  .education-status {
    margin-bottom: 5px;
  }

  .status-enrolled {
    color: #28a745;
    font-weight: 500;
  }

  .status-active {
    color: #007bff;
    font-weight: 500;
  }

  .status-completed {
    color: #6c757d;
    font-weight: 500;
  }

  .status-dropped {
    color: #dc3545;
    font-weight: 500;
  }

  .education-grade {
    margin-top: 5px;
    color: #6c757d;
  }

  .course-instance-info {
    margin-top: 5px;
    font-size: 12px;
    color: #495057;
    background: #f8f9fa;
    padding: 5px;
    border-radius: 4px;
  }

  .enrollment-stats {
    display: flex;
    gap: 15px;
    font-size: 14px;
  }

  .stat-item {
    color: #6c757d;
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

  .courses-section {
    margin-bottom: 30px;
  }

  .courses-section:last-child {
    margin-bottom: 0;
  }

  .courses-section h4 {
    margin: 0 0 15px 0;
    color: #2c3e50;
    font-size: 16px;
    font-weight: 600;
  }

  .courses-list {
    list-style: none;
    padding: 0;
    margin: 0;
  }

  .course-item {
    margin-bottom: 10px;
  }

  .course-item:last-child {
    margin-bottom: 0;
  }

  .course-link {
    display: block;
    padding: 12px 15px;
    border: 1px solid #dee2e6;
    border-radius: 6px;
    text-decoration: none;
    color: inherit;
    transition: all 0.2s ease;
    background: #f8f9fa;
  }

  .course-link:hover {
    background: #e9ecef;
    border-color: #007bff;
    box-shadow: 0 2px 4px rgba(0, 123, 255, 0.1);
  }

  .course-name {
    font-weight: 600;
    color: #007bff;
    margin-bottom: 5px;
    font-size: 15px;
  }

  .course-link:hover .course-name {
    text-decoration: underline;
  }

  .course-details {
    display: flex;
    gap: 15px;
    align-items: center;
    font-size: 13px;
    color: #6c757d;
    flex-wrap: wrap;
  }

  .course-code {
    background: #e9ecef;
    padding: 2px 8px;
    border-radius: 4px;
    font-weight: 500;
  }

  .course-dates {
    color: #495057;
  }

  .no-courses {
    text-align: center;
    color: #6c757d;
    font-style: italic;
    padding: 20px;
  }

  /* Permission Matrix Styles */
  .permission-matrix-container {
    overflow-x: auto;
    margin-bottom: 20px;
  }

  .permission-matrix {
    width: 100%;
    border-collapse: collapse;
    font-size: 14px;
  }

  .permission-matrix.editable {
    width: 100%;
  }

  .permission-matrix thead {
    background: #007bff;
    color: white;
  }

  .permission-matrix th {
    padding: 12px 8px;
    text-align: center;
    font-weight: 600;
    border: 1px solid #0056b3;
  }

  .permission-matrix th:first-child {
    text-align: left;
    background: #0056b3;
  }

  .permission-toggle-header {
    text-align: center !important;
    width: 100px;
  }

  .permission-matrix td {
    padding: 10px 8px;
    border: 1px solid #dee2e6;
    text-align: center;
    font-size: 13px;
  }

  .permission-matrix .feature-name {
    text-align: left;
    font-weight: 500;
    background: #f8f9fa;
    min-width: 300px;
  }

  .permission-cell {
    vertical-align: middle;
  }

  .editable-cell {
    text-align: center;
  }

  /* Custom Checkbox Styles */
  .permission-checkbox {
    display: inline-block;
    position: relative;
    cursor: pointer;
    user-select: none;
  }

  .permission-checkbox input[type="checkbox"] {
    position: absolute;
    opacity: 0;
    cursor: pointer;
    height: 0;
    width: 0;
  }

  .checkmark {
    position: relative;
    display: inline-block;
    width: 24px;
    height: 24px;
    background-color: #fff;
    border: 2px solid #dee2e6;
    border-radius: 4px;
    transition: all 0.2s;
  }

  .permission-checkbox:hover .checkmark {
    border-color: #007bff;
    background-color: #f0f8ff;
  }

  .permission-checkbox input:checked ~ .checkmark {
    background-color: #28a745;
    border-color: #28a745;
  }

  .permission-checkbox input:checked ~ .checkmark:after {
    content: "";
    position: absolute;
    display: block;
    left: 8px;
    top: 4px;
    width: 6px;
    height: 12px;
    border: solid white;
    border-width: 0 2px 2px 0;
    transform: rotate(45deg);
  }

  .text-muted {
    color: #6c757d;
    font-size: 0.875rem;
    margin-top: 5px;
  }

  .permission-yes {
    background: #d4edda;
    color: #155724;
    font-weight: 500;
  }

  .permission-no {
    background: #f8d7da;
    color: #721c24;
  }

  .permission-limited {
    background: #fff3cd;
    color: #856404;
  }

  .permission-legend {
    padding-top: 15px;
    border-top: 1px solid #dee2e6;
  }

  .permission-legend ul {
    list-style: none;
    padding: 0;
    margin: 0;
  }

  .permission-legend li {
    margin: 5px 0;
  }

  .legend-yes,
  .legend-limited,
  .legend-no {
    display: inline-block;
    width: 20px;
    height: 20px;
    border-radius: 3px;
    margin-right: 8px;
    vertical-align: middle;
  }

  .legend-yes {
    background: #d4edda;
    border: 1px solid #c3e6cb;
  }

  .legend-limited {
    background: #fff3cd;
    border: 1px solid #ffeaa7;
  }

  .legend-no {
    background: #f8d7da;
    border: 1px solid #f5c6cb;
  }

  .mt-3 {
    margin-top: 1rem;
  }

  .small {
    font-size: 0.875rem;
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

  .loading {
    text-align: center;
    padding: 40px;
  }

  .spinner {
    border: 4px solid #f3f3f3;
    border-top: 4px solid #007bff;
    border-radius: 50%;
    width: 40px;
    height: 40px;
    animation: spin 1s linear infinite;
    margin: 0 auto 20px;
  }

  @keyframes spin {
    0% {
      transform: rotate(0deg);
    }
    100% {
      transform: rotate(360deg);
    }
  }

  .error-message {
    text-align: center;
    padding: 40px;
    color: #dc3545;
  }

  .no-education,
  .no-comments,
  .no-history {
    text-align: center;
    color: #6c757d;
    font-style: italic;
    padding: 20px;
  }

  /* Non-student styles */
  .info-item {
    margin-bottom: 10px;
    font-size: 16px;
    color: #333;
    display: flex;
    align-items: center;
  }

  .info-item input {
    padding: 5px;
    font-size: 16px;
    margin-left: 5px;
    flex: 1;
  }

  button {
    margin-left: 10px;
    background: none;
    border: none;
    cursor: pointer;
    font-size: 18px;
  }

  button i {
    color: #007bff;
  }

  button:hover i {
    color: #0056b3;
  }

  h3 {
    padding-bottom: 10px;
    margin-bottom: 15px;
    font-size: 20px;
  }

  /* Roles section styles */
  .roles-list {
    border: 1px solid #ced4da;
    border-radius: 6px;
    max-height: 220px;
    overflow: auto;
    background: white;
    margin-bottom: 1rem;
  }

  .role-item {
    padding: 0.5rem 0.75rem;
    cursor: pointer;
    user-select: none;
  }

  .role-item:hover {
    background: #f1f3f5;
  }

  .role-item.selected {
    background: #e9f7ef;
    border-left: 4px solid #2c9316;
    font-weight: 500;
  }

  .form-actions {
    margin-top: 1rem;
  }

  .btn-sm {
    padding: 4px 8px;
    font-size: 12px;
  }

  .btn-outline-primary {
    background: transparent;
    border: 1px solid #007bff;
    color: #007bff;
  }

  .btn-outline-primary:hover {
    background: #007bff;
    color: white;
  }
</style>
