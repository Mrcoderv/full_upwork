<template>
  <div class="scrollable-view">
    <div class="teacher-management-container">
      <div class="header-section">
        <h3 class="page-title">Lärarhantering</h3>
        <div class="header-actions">
          <button class="btn btn-success" @click="goToAddTeacher">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              class="me-2"
            >
              <path d="M5 12h14" />
              <path d="m12 5 7 7-7 7" />
            </svg>
            Lägg till lärare
          </button>
        </div>
      </div>

      <!-- Search and Filter Section -->
      <div class="search-section">
        <div class="search-box">
          <input
            type="text"
            v-model="searchQuery"
            placeholder="Sök efter lärare..."
            class="form-control"
          />
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            class="search-icon"
          >
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.35-4.35" />
          </svg>
        </div>

        <div class="filter-options">
          <select v-model="permissionsFilter" class="form-control">
            <option value="">Alla behörigheter</option>
            <option value="Svenska">Svenska</option>
            <option value="Engelska">Engelska</option>
            <option value="Matematik">Matematik</option>
            <option value="Historia">Historia</option>
            <option value="Samhällskunskap">Samhällskunskap</option>
            <option value="Naturkunskap">Naturkunskap</option>
            <option value="Fysik">Fysik</option>
            <option value="Kemi">Kemi</option>
            <option value="Biologi">Biologi</option>
            <option value="Idrott och hälsa">Idrott och hälsa</option>
            <option value="Slöjd">Slöjd</option>
            <option value="Bild">Bild</option>
            <option value="Musik">Musik</option>
            <option value="Specialpedagogik">Specialpedagogik</option>
            <option value="Studievägledning">Studievägledning</option>
            <option value="Övrigt">Övrigt</option>
          </select>
        </div>
      </div>

      <!-- Teachers List -->
      <div class="teachers-grid" v-if="!isLoading">
        <div
          v-for="teacher in filteredTeachers"
          :key="teacher._id"
          class="teacher-card"
          :style="{ borderLeftColor: teacher.colorCode }"
        >
          <div class="teacher-header">
            <div class="teacher-avatar" :style="{ backgroundColor: teacher.colorCode }">
              {{ getInitials(teacher.userId?.username || '') }}
            </div>
            <div class="teacher-info">
              <h5 class="teacher-name">{{ teacher.userId?.username || 'Namnlös' }}</h5>
              <p class="teacher-email">{{ teacher.userId?.email || 'Ingen e-post' }}</p>
              <span class="teacher-subject">{{ getFormattedPermissions(teacher.subject) }}</span>
            </div>
            <div class="teacher-actions">
              <button
                class="btn btn-sm btn-outline-primary"
                @click="editTeacher(teacher)"
                title="Redigera lärare"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                >
                  <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
                  <path d="m15 5 4 4" />
                </svg>
              </button>
              <button
                class="btn btn-sm btn-outline-warning"
                @click="changePassword(teacher)"
                title="Ändra lösenord"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                >
                  <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
                  <circle cx="12" cy="16" r="1" />
                  <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
              </button>
              <button
                class="btn btn-sm btn-outline-secondary"
                @click="unassignAllStudents(teacher)"
                title="Ta bort alla kopplingar till elever"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                >
                  <path d="M18 6L6 18" />
                  <path d="M6 6l12 12" />
                </svg>
              </button>
              <button
                class="btn btn-sm btn-outline-danger"
                @click="deleteTeacher(teacher)"
                title="Ta bort lärare"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                >
                  <path d="M3 6h18" />
                  <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
                  <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
                  <line x1="10" x2="10" y1="11" y2="17" />
                  <line x1="14" x2="14" y1="11" y2="17" />
                </svg>
              </button>
            </div>
          </div>

          <div class="teacher-stats">
            <div class="stat-item">
              <span class="stat-label">Skapad:</span>
              <span class="stat-value">{{ formatDate(teacher.createdAt) }}</span>
            </div>
            <div class="stat-item">
              <span class="stat-label">Senast uppdaterad:</span>
              <span class="stat-value">{{ formatDate(teacher.updatedAt) }}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Loading State -->
      <div v-if="isLoading" class="loading-state">
        <div class="spinner-border text-primary" role="status">
          <span class="visually-hidden">Laddar...</span>
        </div>
        <p>Laddar lärare...</p>
      </div>

      <!-- Empty State -->
      <div v-if="!isLoading && filteredTeachers.length === 0" class="empty-state">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="64"
          height="64"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1"
          stroke-linecap="round"
          stroke-linejoin="round"
          class="empty-icon"
        >
          <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="m22 21-2-2" />
          <path d="M16 16h6" />
        </svg>
        <h4>Inga lärare hittades</h4>
        <p>Det finns inga lärare som matchar din sökning.</p>
        <button class="btn btn-primary" @click="goToAddTeacher">Lägg till första läraren</button>
      </div>

      <!-- Edit Teacher Modal -->
      <div class="modal fade" id="editTeacherModal" tabindex="-1" ref="editTeacherModal">
        <div class="modal-dialog modal-lg">
          <div class="modal-content">
            <div class="modal-header">
              <h5 class="modal-title">Redigera lärare</h5>
              <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
            </div>
            <div class="modal-body">
              <form @submit.prevent="saveTeacherChanges">
                <div class="row">
                  <div class="col-md-6">
                    <div class="form-group">
                      <label class="form-label">Namn</label>
                      <input
                        type="text"
                        v-model="editingTeacher.username"
                        class="form-control"
                        required
                      />
                    </div>
                  </div>
                  <div class="col-md-6">
                    <div class="form-group">
                      <label class="form-label">E-post</label>
                      <input
                        type="email"
                        v-model="editingTeacher.email"
                        class="form-control"
                        required
                      />
                    </div>
                  </div>
                </div>

                <div class="row">
                  <div class="col-md-6">
                    <div class="form-group">
                      <label class="form-label">Behörigheter</label>
                      <div class="permissions-list" role="listbox" aria-multiselectable="true">
                        <div
                          v-for="opt in permissionsOptions"
                          :key="opt"
                          class="permission-item"
                          :class="{ selected: editingPermissions.includes(opt) }"
                          @dblclick="toggleEditingPermission(opt)"
                        >
                          {{ opt }}
                        </div>
                      </div>
                      <small class="form-help">Dubbelklicka för att välja/avmarkera.</small>
                    </div>
                  </div>
                  <div class="col-md-6">
                    <div class="form-group">
                      <label class="form-label">Färgkod</label>
                      <div class="color-input-group">
                        <input
                          type="color"
                          v-model="editingTeacher.colorCode"
                          class="form-control color-picker"
                        />
                        <input
                          type="text"
                          v-model="editingTeacher.colorCode"
                          class="form-control color-text"
                          placeholder="#FF0000"
                        />
                        <button
                          type="button"
                          class="btn btn-outline-secondary"
                          @click="generateRandomColor"
                        >
                          Slumpa
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                <div class="row">
                  <div class="col-12">
                    <div class="form-group">
                      <label class="form-label">Telefonnummer</label>
                      <div
                        class="phone-input-group"
                        v-for="(phone, index) in editingTeacher.phoneNumbers"
                        :key="index"
                      >
                        <input
                          type="text"
                          v-model="phone.number"
                          class="form-control"
                          :placeholder="`Telefon ${index + 1}`"
                        />
                        <button
                          type="button"
                          class="btn btn-outline-secondary"
                          @click="removeEditingPhone(index)"
                          :disabled="editingTeacher.phoneNumbers.length === 1"
                        >
                          Ta bort
                        </button>
                      </div>
                      <button
                        type="button"
                        class="btn btn-outline-primary btn-sm mt-2"
                        @click="addEditingPhone"
                      >
                        Lägg till telefonnummer
                      </button>
                    </div>
                  </div>
                </div>
              </form>
            </div>
            <div class="modal-footer">
              <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">
                Avbryt
              </button>
              <button
                type="button"
                class="btn btn-primary"
                @click="saveTeacherChanges"
                :disabled="isSaving"
              >
                <span v-if="isSaving" class="spinner-border spinner-border-sm me-2"></span>
                {{ isSaving ? 'Sparar...' : 'Spara ändringar' }}
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- Change Password Modal -->
      <div class="modal fade" id="changePasswordModal" tabindex="-1" ref="changePasswordModal">
        <div class="modal-dialog">
          <div class="modal-content">
            <div class="modal-header">
              <h5 class="modal-title">Ändra lösenord</h5>
              <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
            </div>
            <div class="modal-body">
              <div class="alert alert-info">
                <strong>Lärare:</strong>
                {{ changingPasswordTeacher?.userId?.username }}
              </div>

              <div class="form-group">
                <label class="form-label">Nytt lösenord</label>
                <div class="input-group">
                  <input type="text" v-model="newPassword" class="form-control" readonly />
                  <button
                    type="button"
                    class="btn btn-outline-secondary"
                    @click="generateNewPassword"
                  >
                    Generera
                  </button>
                  <button type="button" class="btn btn-outline-primary" @click="copyPassword">
                    Kopiera
                  </button>
                </div>
              </div>

              <div class="alert alert-warning">
                <strong>Viktigt:</strong>
                Dela det nya lösenordet säkert med läraren.
              </div>
            </div>
            <div class="modal-footer">
              <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">
                Avbryt
              </button>
              <button
                type="button"
                class="btn btn-primary"
                @click="saveNewPassword"
                :disabled="isChangingPassword"
              >
                <span
                  v-if="isChangingPassword"
                  class="spinner-border spinner-border-sm me-2"
                ></span>
                {{ isChangingPassword ? 'Sparar...' : 'Spara nytt lösenord' }}
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- Add Teacher Modal -->
      <div class="modal fade" id="addTeacherModal" tabindex="-1" ref="addTeacherModal">
        <div class="modal-dialog modal-lg">
          <div class="modal-content">
            <div class="modal-header">
              <h5 class="modal-title">Lägg till ny lärare</h5>
              <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
            </div>
            <div class="modal-body">
              <form @submit.prevent="createNewTeacher">
                <div class="row">
                  <div class="col-md-6">
                    <div class="form-group">
                      <label class="form-label">Namn *</label>
                      <input
                        type="text"
                        v-model="newTeacher.username"
                        class="form-control"
                        required
                      />
                    </div>
                  </div>
                  <div class="col-md-6">
                    <div class="form-group">
                      <label class="form-label">E-post *</label>
                      <input
                        type="email"
                        v-model="newTeacher.email"
                        class="form-control"
                        required
                      />
                    </div>
                  </div>
                </div>

                <div class="row">
                  <div class="col-md-6">
                    <div class="form-group">
                      <label class="form-label">Ämne *</label>
                      <select v-model="newTeacher.subject" class="form-control" required>
                        <option value="">Välj ämne</option>
                        <option value="Svenska">Svenska</option>
                        <option value="Engelska">Engelska</option>
                        <option value="Matematik">Matematik</option>
                        <option value="Historia">Historia</option>
                        <option value="Samhällskunskap">Samhällskunskap</option>
                        <option value="Naturkunskap">Naturkunskap</option>
                        <option value="Fysik">Fysik</option>
                        <option value="Kemi">Kemi</option>
                        <option value="Biologi">Biologi</option>
                        <option value="Idrott och hälsa">Idrott och hälsa</option>
                        <option value="Slöjd">Slöjd</option>
                        <option value="Bild">Bild</option>
                        <option value="Musik">Musik</option>
                        <option value="Specialpedagogik">Specialpedagogik</option>
                        <option value="Studievägledning">Studievägledning</option>
                        <option value="Övrigt">Övrigt</option>
                      </select>
                    </div>
                  </div>
                  <div class="col-md-6">
                    <div class="form-group">
                      <label class="form-label">Färgkod</label>
                      <div class="color-input-group">
                        <input
                          type="color"
                          v-model="newTeacher.colorCode"
                          class="form-control color-picker"
                        />
                        <input
                          type="text"
                          v-model="newTeacher.colorCode"
                          class="form-control color-text"
                          placeholder="#FF0000"
                        />
                        <button
                          type="button"
                          class="btn btn-outline-secondary"
                          @click="generateRandomColorForNew"
                        >
                          Slumpa
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </form>
            </div>
            <div class="modal-footer">
              <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">
                Avbryt
              </button>
              <button
                type="button"
                class="btn btn-primary"
                @click="createNewTeacher"
                :disabled="isCreatingTeacher"
              >
                <span v-if="isCreatingTeacher" class="spinner-border spinner-border-sm me-2"></span>
                {{ isCreatingTeacher ? 'Skapar...' : 'Skapa lärare' }}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
  import client from '@/api/client.js'
  import { useToast } from '@/composables/useToast.js'

  export default {
    name: 'TeacherManagement',
    setup() {
      const toast = useToast()
      return { toast }
    },
    data() {
      return {
        teachers: [],
        isLoading: true,
        searchQuery: '',
        permissionsFilter: '',
        showAddTeacherModal: false,

        // Edit teacher
        editingTeacher: {},
        editingPermissions: [],
        permissionsOptions: [
          'Samtliga behörigheter som rektor',
          'Alvis',
          'Freja',
          'Its learning',
          'Växeltelefon',
          'Studie- och yrkesvägledarexamen',
          'Specialpedagogisk examen',
          'Information och Kommunikation 1',
          'Information och Kommunikation 2',
          'Svenska',
          'Svenska som andraspråk',
          'Retorik',
          'Barn- och Fritidsprogrammet',
          'Engelska',
          'Försäljning- och Serviceprogammet',
          'Matematik',
          'Vård- och omsorgsprogrammet',
          'Sammhällskunskap 1a1',
        ],
        isSaving: false,

        // Change password
        changingPasswordTeacher: null,
        newPassword: '',
        isChangingPassword: false,

        // Add teacher
        newTeacher: {
          username: '',
          email: '',
          subject: '',
          colorCode: '#FF0000',
        },
        isCreatingTeacher: false,
      }
    },

    computed: {
      filteredTeachers() {
        let filtered = this.teachers

        if (this.searchQuery) {
          const query = this.searchQuery.toLowerCase()
          filtered = filtered.filter(
            (teacher) =>
              teacher.userId?.username?.toLowerCase().includes(query) ||
              teacher.userId?.email?.toLowerCase().includes(query) ||
              teacher.subject?.toLowerCase().includes(query)
          )
        }

        if (this.permissionsFilter) {
          filtered = filtered.filter((teacher) => teacher.subject === this.permissionsFilter)
        }

        return filtered
      },
    },

    async mounted() {
      await this.loadTeachers()
      this.generateRandomColorForNew()
    },

    methods: {
      goToAddTeacher() {
        this.$router.push('/lagg-till-larare')
      },
      async loadTeachers() {
        try {
          this.isLoading = true
          const response = await client.get('/teachers')
          this.teachers = response.data
        } catch (error) {
          console.error('Error loading teachers:', error)
          this.toast.error('Kunde inte ladda lärare')
        } finally {
          this.isLoading = false
        }
      },

      getInitials(name) {
        return name
          .split(' ')
          .map((word) => word.charAt(0))
          .join('')
          .toUpperCase()
          .slice(0, 2)
      },

      formatDate(dateString) {
        if (!dateString) return 'Okänd'
        return new Date(dateString).toLocaleDateString('sv-SE')
      },

      getFormattedPermissions(subject) {
        if (
          !subject ||
          typeof subject !== 'string' ||
          subject.trim() === '' ||
          subject.trim() === 'Övrigt'
        ) {
          return 'Inga behörigheter'
        }
        // Subject field stores permissions as comma-separated string
        // Return it as-is, or format it nicely
        return subject.trim()
      },

      editTeacher(teacher) {
        this.editingTeacher = {
          _id: teacher._id,
          username: teacher.userId?.username || '',
          email: teacher.userId?.email || '',
          colorCode: teacher.colorCode || '#FF0000',
          phoneNumbers: Array.isArray(teacher.phoneNumbers)
            ? teacher.phoneNumbers.map((p) => ({ number: p }))
            : [{ number: '' }],
        }
        this.editingPermissions =
          typeof teacher.subject === 'string' && teacher.subject.length
            ? teacher.subject
                .split(',')
                .map((s) => s.trim())
                .filter(Boolean)
            : []

        const modal = new bootstrap.Modal(this.$refs.editTeacherModal)
        modal.show()
      },

      async saveTeacherChanges() {
        try {
          this.isSaving = true

          await client.put(`/teachers/${this.editingTeacher._id}`, {
            username: this.editingTeacher.username,
            email: this.editingTeacher.email,
            subject: this.editingPermissions.join(', '),
            colorCode: this.editingTeacher.colorCode,
            phoneNumbers: this.editingTeacher.phoneNumbers
              .map((p) => (p.number || '').trim())
              .filter((p) => p !== ''),
          })

          // Update local data
          const teacherIndex = this.teachers.findIndex((t) => t._id === this.editingTeacher._id)
          if (teacherIndex !== -1) {
            this.teachers[teacherIndex] = {
              ...this.teachers[teacherIndex],
              userId: {
                ...this.teachers[teacherIndex].userId,
                username: this.editingTeacher.username,
                email: this.editingTeacher.email,
              },
              subject: this.editingPermissions.join(', '),
              colorCode: this.editingTeacher.colorCode,
              phoneNumbers: this.editingTeacher.phoneNumbers
                .map((p) => (p.number || '').trim())
                .filter((p) => p !== ''),
            }
          }

          const modal = bootstrap.Modal.getInstance(this.$refs.editTeacherModal)
          modal.hide()

          this.toast.success('Lärare uppdaterad!')
        } catch (error) {
          console.error('Error updating teacher:', error)
          this.toast.error('Kunde inte uppdatera lärare')
        } finally {
          this.isSaving = false
        }
      },

      addEditingPhone() {
        if (!Array.isArray(this.editingTeacher.phoneNumbers)) {
          this.editingTeacher.phoneNumbers = [{ number: '' }]
        } else {
          this.editingTeacher.phoneNumbers.push({ number: '' })
        }
      },

      removeEditingPhone(index) {
        if (
          Array.isArray(this.editingTeacher.phoneNumbers) &&
          this.editingTeacher.phoneNumbers.length > 1
        ) {
          this.editingTeacher.phoneNumbers.splice(index, 1)
        }
      },

      toggleEditingPermission(opt) {
        const idx = this.editingPermissions.indexOf(opt)
        if (idx === -1) {
          this.editingPermissions.push(opt)
        } else {
          this.editingPermissions.splice(idx, 1)
        }
      },

      changePassword(teacher) {
        this.changingPasswordTeacher = teacher
        this.generateNewPassword()

        const modal = new bootstrap.Modal(this.$refs.changePasswordModal)
        modal.show()
      },

      generateNewPassword() {
        const charset =
          'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()_+-=[]{}|;:,.<>?'
        let password = ''

        // Ensure at least one character from each category
        password += 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'[Math.floor(Math.random() * 26)]
        password += 'abcdefghijklmnopqrstuvwxyz'[Math.floor(Math.random() * 26)]
        password += '0123456789'[Math.floor(Math.random() * 10)]
        password += '!@#$%^&*()_+-=[]{}|;:,.<>?'[Math.floor(Math.random() * 32)]

        // Fill the rest
        for (let i = 4; i < 12; i++) {
          password += charset[Math.floor(Math.random() * charset.length)]
        }

        // Shuffle
        this.newPassword = password
          .split('')
          .sort(() => Math.random() - 0.5)
          .join('')
      },

      async copyPassword() {
        try {
          await navigator.clipboard.writeText(this.newPassword)
          this.toast.success('Lösenord kopierat!')
        } catch (error) {
          console.error('Could not copy password:', error)
          const textArea = document.createElement('textarea')
          textArea.value = this.newPassword
          document.body.appendChild(textArea)
          textArea.select()
          document.execCommand('copy')
          document.body.removeChild(textArea)
          this.toast.success('Lösenord kopierat!')
        }
      },

      async saveNewPassword() {
        try {
          this.isChangingPassword = true

          await client.put(`/teachers/${this.changingPasswordTeacher._id}/password`, {
            password: this.newPassword,
          })

          const modal = bootstrap.Modal.getInstance(this.$refs.changePasswordModal)
          modal.hide()

          this.toast.success('Lösenord ändrat!')
        } catch (error) {
          console.error('Error changing password:', error)
          this.toast.error('Kunde inte ändra lösenord')
        } finally {
          this.isChangingPassword = false
        }
      },

      async deleteTeacher(teacher) {
        if (!confirm(`Är du säker på att du vill ta bort läraren "${teacher.userId?.username}"?`)) {
          return
        }

        try {
          await client.delete(`/teachers/${teacher._id}`)

          // Remove from local data
          this.teachers = this.teachers.filter((t) => t._id !== teacher._id)

          this.toast.success('Lärare borttagen!')
        } catch (error) {
          console.error('Error deleting teacher:', error)
          this.toast.error('Kunde inte ta bort lärare')
        }
      },

      async unassignAllStudents(teacher) {
        if (
          !confirm(
            `Vill du ta bort alla kopplingar mellan läraren \"${teacher.userId?.username}\" och elever?`
          )
        ) {
          return
        }
        try {
          await client.put(`/teachers/${teacher._id}/unassign-all-students`)
          this.toast.success('Alla kopplingar till elever har tagits bort!')
        } catch (error) {
          console.error('Error unassigning students:', error)
          this.toast.error('Kunde inte ta bort kopplingar till elever')
        }
      },

      // Predefined color list for teacher profiles
      getNextAvailableColor(excludeColor = null) {
        const TEACHER_COLORS = [
          '#e6194b',
          '#3cb44b',
          '#ffe119',
          '#4363d8',
          '#f58231',
          '#911eb4',
          '#46f0f0',
          '#f032e6',
          '#bcf60c',
          '#fabebe',
          '#008080',
          '#e6beff',
          '#9a6324',
          '#fffac8',
          '#800000',
          '#aaffc3',
          '#808000',
          '#ffd8b1',
          '#000075',
          '#808080',
          '#ffffff',
          '#000000',
        ]

        // Get all used colors from existing teachers
        const usedColors = new Set(
          this.teachers
            .map((t) => t.colorCode)
            .filter(Boolean)
            .filter((color) => color !== excludeColor) // Exclude the current teacher's color when editing
        )

        // Find the first color in the list that's not used
        for (const color of TEACHER_COLORS) {
          if (!usedColors.has(color)) {
            return color
          }
        }

        // If all colors are used, cycle through the list
        const index = this.teachers.length % TEACHER_COLORS.length
        return TEACHER_COLORS[index]
      },

      generateRandomColor() {
        this.editingTeacher.colorCode = this.getNextAvailableColor(this.editingTeacher.colorCode)
      },

      generateRandomColorForNew() {
        this.newTeacher.colorCode = this.getNextAvailableColor()
      },

      async createNewTeacher() {
        if (!this.newTeacher.username || !this.newTeacher.email || !this.newTeacher.subject) {
          this.toast.error('Fyll i alla obligatoriska fält')
          return
        }

        try {
          this.isCreatingTeacher = true

          const response = await client.post('/admin/teacher', {
            username: this.newTeacher.username,
            email: this.newTeacher.email,
            subject: this.newTeacher.subject,
            colorCode: this.newTeacher.colorCode,
            generatePassword: true,
          })

          if (response.data.success) {
            // Add to local data
            this.teachers.push({
              _id: response.data.data.teacher.id,
              userId: {
                username: this.newTeacher.username,
                email: this.newTeacher.email,
              },
              subject: this.newTeacher.subject,
              colorCode: this.newTeacher.colorCode,
              createdAt: new Date(),
              updatedAt: new Date(),
            })

            // Show success modal with credentials
            this.toast.success(
              `Lärare skapad! Lösenord: ${response.data.password}. Dela lösenordet säkert med läraren.`
            )

            // Reset form
            this.newTeacher = {
              username: '',
              email: '',
              subject: '',
              colorCode: '#FF0000',
            }
            this.generateRandomColorForNew()

            const modal = bootstrap.Modal.getInstance(this.$refs.addTeacherModal)
            modal.hide()
          }
        } catch (error) {
          console.error('Error creating teacher:', error)
          let errorMessage = 'Kunde inte skapa lärare'
          if (error.response?.status === 409) {
            errorMessage = 'En användare med denna e-postadress finns redan'
          } else if (error.response?.data?.error) {
            errorMessage = error.response.data.error
          }
          this.toast.error(errorMessage)
        } finally {
          this.isCreatingTeacher = false
        }
      },
    },
  }
</script>

<style scoped>
  .teacher-management-container {
    padding: 2rem;
    background-color: #f8f9fa;
    min-height: 100vh;
  }

  .header-section {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 2rem;
  }

  .page-title {
    color: #2c3e50;
    font-weight: 600;
    margin: 0;
  }

  .search-section {
    display: flex;
    gap: 1rem;
    margin-bottom: 2rem;
    align-items: center;
  }

  .search-box {
    position: relative;
    flex: 1;
    max-width: 400px;
  }

  .search-box input {
    padding-left: 2.5rem;
  }

  .search-icon {
    position: absolute;
    left: 0.75rem;
    top: 50%;
    transform: translateY(-50%);
    color: #6c757d;
  }

  .filter-options {
    min-width: 200px;
  }

  .teachers-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(350px, 1fr));
    gap: 1.5rem;
  }

  .teacher-card {
    background: white;
    border-radius: 12px;
    padding: 1.5rem;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
    border-left: 4px solid;
    transition: transform 0.2s, box-shadow 0.2s;
  }

  .teacher-card:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15);
  }

  .teacher-header {
    display: flex;
    align-items: center;
    gap: 1rem;
    margin-bottom: 1rem;
  }

  .teacher-avatar {
    width: 50px;
    height: 50px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    color: white;
    font-weight: 600;
    font-size: 1.2rem;
    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
  }

  .teacher-info {
    flex: 1;
  }

  .teacher-name {
    margin: 0 0 0.25rem 0;
    color: #2c3e50;
    font-weight: 600;
  }

  .teacher-email {
    margin: 0 0 0.5rem 0;
    color: #6c757d;
    font-size: 0.9rem;
  }

  .teacher-subject {
    background: #e9ecef;
    color: #495057;
    padding: 0.25rem 0.75rem;
    border-radius: 20px;
    font-size: 0.8rem;
    font-weight: 500;
  }

  .teacher-actions {
    display: flex;
    gap: 0.5rem;
  }

  .teacher-stats {
    border-top: 1px solid #e9ecef;
    padding-top: 1rem;
  }

  .stat-item {
    display: flex;
    justify-content: space-between;
    margin-bottom: 0.5rem;
  }

  .stat-item:last-child {
    margin-bottom: 0;
  }

  .stat-label {
    color: #6c757d;
    font-size: 0.9rem;
  }

  .stat-value {
    color: #495057;
    font-weight: 500;
    font-size: 0.9rem;
  }

  .loading-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 4rem 2rem;
    color: #6c757d;
  }

  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 4rem 2rem;
    text-align: center;
    color: #6c757d;
  }

  .empty-icon {
    margin-bottom: 1rem;
    opacity: 0.5;
  }

  .color-input-group {
    display: flex;
    gap: 0.5rem;
    align-items: center;
  }

  .color-picker {
    width: 60px;
    height: 45px;
    padding: 0.25rem;
    border: 1px solid #ced4da;
    border-radius: 6px;
    cursor: pointer;
  }

  .color-text {
    flex: 1;
    text-transform: uppercase;
  }

  .btn {
    padding: 0.5rem 1rem;
    border-radius: 6px;
    font-weight: 500;
    text-decoration: none;
    border: 1px solid;
    cursor: pointer;
    transition: all 0.15s ease-in-out;
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
  }

  .btn-success {
    background-color: #2c9316;
    border-color: #2c9316;
    color: white;
  }

  .btn-success:hover:not(:disabled) {
    background-color: #228b0f;
    border-color: #228b0f;
  }

  .btn-primary {
    background-color: #007bff;
    border-color: #007bff;
    color: white;
  }

  .btn-primary:hover:not(:disabled) {
    background-color: #0056b3;
    border-color: #0056b3;
  }

  .btn-outline-primary {
    background-color: transparent;
    border-color: #007bff;
    color: #007bff;
  }

  .btn-outline-primary:hover {
    background-color: #007bff;
    color: white;
  }

  .btn-outline-warning {
    background-color: transparent;
    border-color: #ffc107;
    color: #ffc107;
  }

  .btn-outline-warning:hover {
    background-color: #ffc107;
    color: #212529;
  }

  .btn-outline-danger {
    background-color: transparent;
    border-color: #dc3545;
    color: #dc3545;
  }

  .btn-outline-danger:hover {
    background-color: #dc3545;
    color: white;
  }

  .btn-outline-secondary {
    background-color: transparent;
    border-color: #6c757d;
    color: #6c757d;
  }

  .btn-outline-secondary:hover {
    background-color: #6c757d;
    color: white;
  }

  .btn-sm {
    padding: 0.25rem 0.5rem;
    font-size: 0.875rem;
  }

  .permissions-list {
    border: 1px solid #ced4da;
    border-radius: 6px;
    max-height: 220px;
    overflow: auto;
  }

  .permission-item {
    padding: 0.5rem 0.75rem;
    cursor: default;
  }

  .permission-item:hover {
    background: #f1f3f5;
  }

  .permission-item.selected {
    background: #e9f7ef;
    border-left: 4px solid #2c9316;
  }

  .form-control {
    width: 100%;
    padding: 0.75rem;
    border: 1px solid #ced4da;
    border-radius: 6px;
    font-size: 1rem;
    transition: border-color 0.15s ease-in-out, box-shadow 0.15s ease-in-out;
  }

  .form-control:focus {
    border-color: #007bff;
    outline: 0;
    box-shadow: 0 0 0 0.2rem rgba(0, 123, 255, 0.25);
  }

  .form-label {
    display: block;
    margin-bottom: 0.5rem;
    font-weight: 500;
    color: #495057;
  }

  .form-group {
    margin-bottom: 1rem;
  }

  .spinner-border-sm {
    width: 1rem;
    height: 1rem;
  }

  @media (max-width: 768px) {
    .header-section {
      flex-direction: column;
      gap: 1rem;
      align-items: stretch;
    }

    .search-section {
      flex-direction: column;
    }

    .search-box {
      max-width: none;
    }

    .teachers-grid {
      grid-template-columns: 1fr;
    }

    .teacher-header {
      flex-direction: column;
      text-align: center;
    }

    .teacher-actions {
      justify-content: center;
    }
  }
</style>
