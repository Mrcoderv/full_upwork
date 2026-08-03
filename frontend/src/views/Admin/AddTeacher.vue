<template>
  <div class="scrollable-view">
    <div class="add-teacher-container">
      <div class="header-section">
        <h3 class="page-title">Lägg till Lärare</h3>

        <!-- Removed Tillbaka till Användarhantering link and breadcrumb -->
      </div>

      <div class="form-container">
        <form @submit.prevent="submitTeacherForm" class="teacher-form">
          <div class="form-header">
            <h4>Skapa nytt lärarkonto</h4>
            <p class="form-description">
              Fyll i lärarens information nedan. Ett lösenord kommer att genereras automatiskt.
            </p>
          </div>

          <div class="form-grid">
            <!-- Basic Information -->
            <div class="form-section">
              <h5 class="section-title">Grundläggande Information</h5>

              <div class="form-group">
                <label for="username" class="form-label">
                  Fullständigt namn
                  <span class="required">*</span>
                </label>
                <input
                  type="text"
                  id="username"
                  class="form-control"
                  v-model="teacherForm.username"
                  placeholder="Ex. Anna Andersson"
                  required
                />
                <small class="form-help">Detta namn kommer att visas i systemet</small>
              </div>

              <div class="form-group">
                <label for="email" class="form-label">
                  E-postadress
                  <span class="required">*</span>
                </label>
                <input
                  type="email"
                  id="email"
                  class="form-control"
                  v-model="teacherForm.email"
                  placeholder="anna.andersson@example.com"
                  required
                />
                <small class="form-help">Används för inloggning och kommunikation</small>
              </div>

              <div class="form-group">
                <label for="permissions" class="form-label">
                  Behörigheter
                  <span class="required">*</span>
                </label>
                <div
                  id="permissions"
                  class="permissions-list"
                  role="listbox"
                  aria-multiselectable="true"
                >
                  <div
                    v-for="opt in permissionsOptions"
                    :key="opt"
                    class="permission-item"
                    :class="{ selected: teacherForm.permissions.includes(opt) }"
                    @dblclick="togglePermission(opt)"
                  >
                    {{ opt }}
                  </div>
                </div>
                <small class="form-help">Dubbelklicka för att välja/avmarkera.</small>
              </div>
            </div>

            <!-- Visual Settings -->
            <div class="form-section">
              <h5 class="section-title">Visuella inställningar</h5>

              <div class="form-group">
                <label for="colorCode" class="form-label">Färgkod</label>
                <div class="color-input-group">
                  <input
                    type="color"
                    id="colorCode"
                    class="form-control color-picker"
                    v-model="teacherForm.colorCode"
                  />
                  <input
                    type="text"
                    class="form-control color-text"
                    v-model="teacherForm.colorCode"
                    placeholder="#FF0000"
                    pattern="^#[0-9A-Fa-f]{6}$"
                  />
                  <button
                    type="button"
                    class="btn btn-outline-secondary"
                    @click="generateRandomColor"
                  >
                    Slumpa
                  </button>
                </div>
                <small class="form-help">
                  Färg som används för att identifiera läraren i scheman och kalender
                </small>
              </div>

              <div class="color-preview">
                <span class="preview-label">Förhandsvisning:</span>
                <div class="color-sample" :style="{ backgroundColor: teacherForm.colorCode }">
                  {{ teacherForm.username || 'Lärarens namn' }}
                </div>
              </div>
            </div>

            <!-- Password Information -->
            <div class="form-section">
              <h5 class="section-title">Lösenordsinformation</h5>

              <div class="password-info">
                <div class="info-box">
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
                  >
                    <circle cx="12" cy="12" r="10" />
                    <path d="m9 12 2 2 4-4" />
                  </svg>
                  <div>
                    <strong>Automatisk lösenordsgenerering</strong>
                    <p>
                      Ett säkert lösenord kommer att genereras automatiskt och visas efter att
                      kontot skapats.
                    </p>
                  </div>
                </div>

                <div class="info-box warning">
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
                  >
                    <path d="m21 2-1 1L4 18l-1 1" />
                    <path d="M10.5 10.5C10.5 10.5 12 12 12 12s1.5-1.5 1.5-1.5" />
                    <circle cx="12" cy="12" r="2" />
                  </svg>
                  <div>
                    <strong>Viktigt att komma ihåg</strong>
                    <p>
                      Se till att dela lösenordet säkert med läraren och uppmana dem att ändra det
                      vid första inloggning.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <!-- Contact Information -->
            <div class="form-section">
              <h5 class="section-title">Kontaktuppgifter</h5>

              <div class="form-group">
                <label class="form-label">Telefonnummer</label>
                <div
                  class="phone-input-group"
                  v-for="(phone, index) in teacherForm.phoneNumbers"
                  :key="index"
                >
                  <input
                    type="text"
                    class="form-control"
                    v-model="phone.number"
                    :placeholder="`Telefon ${index + 1}`"
                  />
                  <button
                    type="button"
                    class="btn btn-outline-secondary"
                    @click="removePhoneNumber(index)"
                    :disabled="teacherForm.phoneNumbers.length === 1"
                  >
                    Ta bort
                  </button>
                </div>
                <button
                  type="button"
                  class="btn btn-outline-primary btn-sm mt-2"
                  @click="addPhoneNumber"
                >
                  Lägg till telefonnummer
                </button>
                <small class="form-help">Lägg till ett eller flera telefonnummer.</small>
              </div>
            </div>
          </div>

          <!-- Submit Button -->
          <div class="form-actions">
            <button type="button" class="btn btn-outline-secondary me-3" @click="resetForm">
              Rensa formulär
            </button>
            <button type="submit" class="btn btn-success" :disabled="isSubmitting">
              <span v-if="isSubmitting" class="spinner-border spinner-border-sm me-2"></span>
              {{ isSubmitting ? 'Skapar konto...' : 'Skapa lärarkonto' }}
            </button>
          </div>
        </form>
      </div>

      <!-- Success Modal -->
      <div class="modal fade" id="successModal" tabindex="-1" ref="successModal">
        <div class="modal-dialog modal-lg">
          <div class="modal-content">
            <div class="modal-header bg-success text-white">
              <h5 class="modal-title">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="24"
                  height="24"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  class="me-2"
                >
                  <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                  <polyline points="22,4 12,14.01 9,11.01" />
                </svg>
                Lärarkonto skapat!
              </h5>
              <button
                type="button"
                class="btn-close btn-close-white"
                data-bs-dismiss="modal"
              ></button>
            </div>
            <div class="modal-body">
              <div class="success-content">
                <div class="teacher-info">
                  <h6>Kontoinformation:</h6>
                  <div class="info-grid">
                    <div>
                      <strong>Namn:</strong>
                      {{ createdTeacher.username }}
                    </div>
                    <div>
                      <strong>E-post:</strong>
                      {{ createdTeacher.email }}
                    </div>
                    <div>
                      <strong>Behörigheter:</strong>
                      {{ createdTeacher.subject }}
                    </div>
                    <div>
                      <strong>Roll:</strong>
                      Lärare
                    </div>
                  </div>
                </div>

                <div class="password-section">
                  <h6>Inloggningsuppgifter:</h6>
                  <div class="credential-box">
                    <div class="credential-item">
                      <label>E-postadress:</label>
                      <code>{{ createdTeacher.email }}</code>
                    </div>
                    <div class="credential-item">
                      <label>Lösenord:</label>
                      <div class="password-display">
                        <code>{{ generatedPassword }}</code>
                        <button
                          type="button"
                          class="btn btn-sm btn-outline-primary"
                          @click="copyPassword"
                          title="Kopiera lösenord"
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
                            <rect width="14" height="14" x="8" y="8" rx="2" ry="2" />
                            <path d="m4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                <div class="security-warning">
                  <div class="alert alert-warning d-flex align-items-start">
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
                      class="me-2 mt-1"
                    >
                      <path d="m21 2-1 1L4 18l-1 1" />
                      <path d="M10.5 10.5C10.5 10.5 12 12 12 12s1.5-1.5 1.5-1.5" />
                      <circle cx="12" cy="12" r="2" />
                    </svg>
                    <div>
                      <strong>Säkerhetsanvisningar:</strong>
                      <ul class="mb-0 mt-1">
                        <li>
                          Dela lösenordet säkert med läraren (t.ex. via krypterad e-post eller
                          personligen)
                        </li>
                        <li>Uppmana läraren att ändra lösenordet vid första inloggning</li>
                        <li>Lösenordet kommer inte att visas igen efter att denna dialog stängs</li>
                      </ul>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div class="modal-footer">
              <button type="button" class="btn btn-primary" @click="createAnotherTeacher">
                Skapa ytterligare lärare
              </button>
              <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Stäng</button>
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
    name: 'AddTeacher',
    setup() {
      const toast = useToast()
      return { toast }
    },
    data() {
      return {
        isSubmitting: false,
        teachers: [],
        teacherForm: {
          username: '',
          email: '',
          permissions: [],
          colorCode: '#FF0000',
          phoneNumbers: [{ number: '' }],
        },
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
        createdTeacher: {},
        generatedPassword: '',
      }
    },
    async mounted() {
      await this.loadTeachers()
      this.generateRandomColor()
    },
    methods: {
      async loadTeachers() {
        try {
          const response = await client.get('/teachers')
          this.teachers = response.data
        } catch (error) {
          console.error('Error loading teachers:', error)
          // Continue even if loading fails - backend will handle uniqueness
        }
      },

      // Predefined color list for teacher profiles
      getNextAvailableColor() {
        const TEACHER_COLORS = [
          '#e6194b', '#3cb44b', '#ffe119', '#4363d8', '#f58231', '#911eb4', '#46f0f0', '#f032e6', '#bcf60c', '#fabebe', 
          '#008080', '#e6beff', '#9a6324', '#fffac8', '#800000', '#aaffc3', '#808000', '#ffd8b1', '#000075', '#808080', 
          '#ffffff', '#000000'
        ]
        
        // Get all used colors from existing teachers
        const usedColors = new Set(
          this.teachers
            .map(t => t.colorCode)
            .filter(Boolean)
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
        this.teacherForm.colorCode = this.getNextAvailableColor()
      },

      resetForm() {
        this.teacherForm = {
          username: '',
          email: '',
          permissions: [],
          colorCode: '#FF0000',
          phoneNumbers: [{ number: '' }],
        }
        this.generateRandomColor()
      },

      async submitTeacherForm() {
        if (!this.validateForm()) return

        this.isSubmitting = true

        try {
          // Check if user is logged in
          if (!this.$store.getters.isLoggedIn) {
            this.toast.error('Du är inte inloggad. Logga in igen.')
            this.isSubmitting = false
            return
          }

          const response = await client.post('/admin/teacher', {
            username: this.teacherForm.username,
            email: this.teacherForm.email,
            subject: this.teacherForm.permissions.join(', '),
            colorCode: this.teacherForm.colorCode,
            phoneNumbers: this.teacherForm.phoneNumbers
              .map((p) => (p.number || '').trim())
              .filter((p) => p !== ''),
            generatePassword: true,
          })

          if (response.data.success) {
            this.createdTeacher = {
              username: this.teacherForm.username,
              email: this.teacherForm.email,
              subject: this.teacherForm.permissions.join(', '),
            }
            this.generatedPassword = response.data.password

            const modal = new bootstrap.Modal(this.$refs.successModal)
            modal.show()
            this.resetForm()
          }
        } catch (error) {
          console.error('Error creating teacher:', error)

          let errorMessage = 'Ett fel uppstod när lärarkontot skulle skapas.'
          if (error.response?.status === 401) {
            errorMessage = 'Du är inte behörig. Vänligen logga in igen.'
          } else if (error.response?.status === 409) {
            errorMessage = 'En användare med denna e-postadress finns redan.'
          } else if (error.response?.data?.error) {
            errorMessage = error.response.data.error
          }

          this.toast.error(errorMessage)
        } finally {
          this.isSubmitting = false
        }
      },

      validateForm() {
        const { username, email, permissions } = this.teacherForm

        if (!username || !username.trim()) {
          this.toast.error('Namn är obligatoriskt.')
          return false
        }

        if (!email || !email.trim()) {
          this.toast.error('E-postadress är obligatorisk.')
          return false
        }

        if (!permissions || permissions.length === 0) {
          this.toast.error('Minst en behörighet är obligatorisk.')
          return false
        }

        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
        if (!emailRegex.test(email.trim())) {
          this.toast.error('Ange en giltig e-postadress.')
          return false
        }

        return true
      },

      addPhoneNumber() {
        this.teacherForm.phoneNumbers.push({ number: '' })
      },

      removePhoneNumber(index) {
        if (this.teacherForm.phoneNumbers.length > 1) {
          this.teacherForm.phoneNumbers.splice(index, 1)
        }
      },

      togglePermission(opt) {
        const idx = this.teacherForm.permissions.indexOf(opt)
        if (idx === -1) {
          this.teacherForm.permissions.push(opt)
        } else {
          this.teacherForm.permissions.splice(idx, 1)
        }
      },

      async copyPassword() {
        try {
          await navigator.clipboard.writeText(this.generatedPassword)
          this.toast.success('Lösenord kopierat!')
        } catch (error) {
          console.error('Could not copy password:', error)
          const textArea = document.createElement('textarea')
          textArea.value = this.generatedPassword
          document.body.appendChild(textArea)
          textArea.select()
          document.execCommand('copy')
          document.body.removeChild(textArea)
          this.toast.success('Lösenord kopierat!')
        }
      },

      createAnotherTeacher() {
        const modal = bootstrap.Modal.getInstance(this.$refs.successModal)
        modal.hide()
        this.resetForm()
      },
    },
  }
</script>

<style scoped>
  .add-teacher-container {
    min-height: 100vh;
    background-color: #f8f9fa;
    padding: 2rem;
  }

  .header-section {
    margin-bottom: 2rem;
  }

  .page-title {
    color: #2c3e50;
    font-weight: 600;
    margin-bottom: 1rem;
  }

  .breadcrumb {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .breadcrumb-link {
    color: #2c9316;
    text-decoration: none;
    font-weight: 500;
  }

  .breadcrumb-link:hover {
    text-decoration: underline;
  }

  .form-container {
    background: white;
    border-radius: 12px;
    box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
    overflow: hidden;
  }

  .teacher-form {
    padding: 2rem;
  }

  .form-header {
    margin-bottom: 2rem;
    padding-bottom: 1rem;
    border-bottom: 1px solid #e9ecef;
  }

  .form-header h4 {
    color: #2c3e50;
    margin-bottom: 0.5rem;
  }

  .form-description {
    color: #6c757d;
    margin: 0;
  }

  .form-grid {
    display: grid;
    grid-template-columns: 1fr;
    gap: 2rem;
  }

  @media (min-width: 992px) {
    .form-grid {
      grid-template-columns: 1fr 1fr;
    }
  }

  .form-section {
    background: #f8f9fa;
    padding: 1.5rem;
    border-radius: 8px;
    border: 1px solid #e9ecef;
  }

  .section-title {
    color: #495057;
    font-size: 1.1rem;
    font-weight: 600;
    margin-bottom: 1.5rem;
    padding-bottom: 0.5rem;
    border-bottom: 2px solid #2c9316;
  }

  .form-group {
    margin-bottom: 1.5rem;
  }

  .form-label {
    display: block;
    margin-bottom: 0.5rem;
    font-weight: 500;
    color: #495057;
  }

  .required {
    color: #dc3545;
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
    border-color: #2c9316;
    outline: 0;
    box-shadow: 0 0 0 0.2rem rgba(44, 147, 22, 0.25);
  }

  .form-help {
    display: block;
    margin-top: 0.25rem;
    font-size: 0.875rem;
    color: #6c757d;
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

  .color-preview {
    margin-top: 1rem;
    display: flex;
    align-items: center;
    gap: 1rem;
  }

  .preview-label {
    font-weight: 500;
    color: #495057;
  }

  .color-sample {
    padding: 0.5rem 1rem;
    border-radius: 6px;
    color: white;
    font-weight: 500;
    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.5);
    min-width: 150px;
    text-align: center;
  }

  .password-info {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .info-box {
    display: flex;
    gap: 1rem;
    padding: 1rem;
    border-radius: 8px;
    background: #d1ecf1;
    border: 1px solid #bee5eb;
    color: #0c5460;
  }

  .info-box.warning {
    background: #fff3cd;
    border-color: #ffeaa7;
    color: #856404;
  }

  .info-box svg {
    flex-shrink: 0;
    margin-top: 0.1rem;
  }

  .info-box strong {
    display: block;
    margin-bottom: 0.25rem;
  }

  .info-box p {
    margin: 0;
    font-size: 0.9rem;
  }

  .form-actions {
    margin-top: 2rem;
    padding-top: 1.5rem;
    border-top: 1px solid #e9ecef;
    display: flex;
    justify-content: flex-end;
    align-items: center;
  }

  .btn {
    padding: 0.75rem 1.5rem;
    border-radius: 6px;
    font-weight: 500;
    text-decoration: none;
    border: 1px solid;
    cursor: pointer;
    transition: all 0.15s ease-in-out;
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

  .btn-success:disabled {
    opacity: 0.6;
    cursor: not-allowed;
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

  .success-content {
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
  }

  .teacher-info {
    padding: 1rem;
    background: #f8f9fa;
    border-radius: 6px;
  }

  .info-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.5rem;
    margin-top: 0.5rem;
  }

  .password-section h6 {
    color: #495057;
    margin-bottom: 1rem;
  }

  .credential-box {
    background: #f8f9fa;
    padding: 1rem;
    border-radius: 6px;
    border: 1px solid #e9ecef;
  }

  .credential-item {
    margin-bottom: 1rem;
  }

  .credential-item:last-child {
    margin-bottom: 0;
  }

  .credential-item label {
    display: block;
    font-weight: 500;
    margin-bottom: 0.25rem;
    color: #495057;
  }

  .credential-item code {
    background: white;
    padding: 0.5rem;
    border: 1px solid #ced4da;
    border-radius: 4px;
    font-family: 'Courier New', monospace;
    color: #e83e8c;
  }

  .password-display {
    display: flex;
    gap: 0.5rem;
    align-items: center;
  }

  .security-warning {
    margin-top: 1rem;
  }

  .alert {
    padding: 1rem;
    border-radius: 6px;
    border: 1px solid;
  }

  .alert-warning {
    background-color: #fff3cd;
    border-color: #ffeaa7;
    color: #856404;
  }

  .alert ul {
    padding-left: 1.5rem;
  }

  .alert li {
    margin-bottom: 0.25rem;
  }

  .spinner-border-sm {
    width: 1rem;
    height: 1rem;
  }

  .permissions-list {
    border: 1px solid #ced4da;
    border-radius: 6px;
    max-height: 220px;
    overflow: auto;
    background: white;
  }

  .permission-item {
    padding: 0.5rem 0.75rem;
    cursor: default;
    user-select: none;
  }

  .permission-item:hover {
    background: #f1f3f5;
  }

  .permission-item.selected {
    background: #e9f7ef;
    border-left: 4px solid #2c9316;
  }

  .phone-input-group {
    display: flex;
    gap: 0.5rem;
    align-items: center;
    margin-bottom: 0.5rem;
  }
</style>
