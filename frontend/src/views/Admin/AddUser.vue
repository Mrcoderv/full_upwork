<template>
  <body style="background-color: #f4f4f4; padding: 20px">
    <h3 class="container pt-4 text-start">Hantera Användare</h3>

    <div class="text-start container py-3">
      <svg xmlns="http://www.w3.org/2000/svg" width="30" height="30" viewBox="0 0 24 24">
        <path fill="#2c9316" d="M20 9v6h-8v4.84L4.16 12L12 4.16V9z" />
      </svg>
      <router-link to="/anvandare"> Tillbaka till Användare och åtkomstbehörigheter </router-link>
    </div>

    <ul class="nav nav-tabs container">
      <li class="nav-item">
        <a
          href="#"
          :class="formType === 'student' ? 'active-link' : ''"
          class="nav-link"
          style="color: black !important; border: none !important"
          @click="toggleForm('student')"
        >
          Elev
        </a>
      </li>
      <a
        href="#"
        :class="formType === 'teacher' ? 'active-link' : ''"
        class="nav-link"
        style="color: black !important"
        @click="toggleForm('teacher')"
      >
        Lärare
      </a>
    </ul>
    <div class="container bg-white p-4 rounded shadow-sm">
      <!-- Toggle mellan Elev och Lärare -->

      <!-- Formulär för att lägga till elev -->
      <form v-if="formType === 'student'" @submit.prevent="submitStudentForm">
        <div class="row g-3">
          <div class="col-md-6 text-start">
            <label for="name" class="form-label">Namn</label>
            <input id="name" v-model="studentForm.namn" type="text" class="form-control" placeholder="Ex. Doe, Jane" />
          </div>
        </div>
        <div class="row g-3">
          <div class="col-md-6 text-start">
            <label for="personnummer" class="form-label">Personnummer</label>
            <input
              id="personnummer"
              v-model="studentForm.personnummer"
              type="text"
              class="form-control"
              placeholdeR="Ex. ååååmmdd"
            />
          </div>
        </div>
        <div class="row g-3 text-start">
          <div class="col-md-6">
            <label for="kurspaket" class="form-label">Kurspaket:</label>
            <input
              id="kurspaket"
              v-model="studentForm.kurspaket"
              type="text"
              class="form-control"
              placeholder="Ex. Svenska 1"
            />
          </div>
        </div>
        <div class="row g-3 text-start">
          <div class="col-md-6">
            <label class="form-label" for="startDatum">Start datum:</label>
            <input
              id="startDatum"
              v-model="studentForm.startDatum"
              type="text"
              class="form-control"
              placeholder="yyyy-mm-dd"
              @input="calculateEndDate"
            />
          </div>
        </div>
        <div class="row g-3 mt-3">
          <div class="col-md-6">
            <label>Studietakt: </label>
            <div class="checkbox-wrapper-27">
              <label class="checkbox">
                <input
                  type="checkbox"
                  value="5"
                  :checked="studentForm.duration === '5'"
                  @change="updateDuration('5')"
                />
                <span class="checkbox__icon"></span>
                5 veckor
              </label>
            </div>
            <div class="checkbox-wrapper-27">
              <label class="checkbox">
                <input
                  type="checkbox"
                  value="10"
                  :checked="studentForm.duration === '10'"
                  @change="updateDuration('10')"
                />
                <span class="checkbox__icon"></span>
                10 veckor
              </label>
            </div>
            <div class="checkbox-wrapper-27">
              <label class="checkbox">
                <input
                  type="checkbox"
                  value="20"
                  :checked="studentForm.duration === '20'"
                  @change="updateDuration('20')"
                />
                <span class="checkbox__icon"></span>
                20 veckor
              </label>
            </div>
          </div>
          <!--
          <div class="col-md-6">
            <label>Studie takt: </label>
      <label>
        <input
          type="radio"
          value="5"
          v-model="studentForm.duration"
          @change="calculateEndDate"
        />
        5 weeks
      </label>
      <br />
      <label>
        <input
          type="radio"
          value="10"
          v-model="studentForm.duration"
          @change="calculateEndDate"
        />
        10 weeks
      </label>
      <br />
      <label>
        <input
          type="radio"
          value="20"
          v-model="studentForm.duration"
          @change="calculateEndDate"
        />
        20 weeks
      </label>
          </div>
-->
        </div>

        <div class="row g-3 mt-3">
          <div class="col-md-6">
            <div class="mt-3">
              <input
                id="endDate"
                type="text"
                class="form-control"
                :value="studentForm.slutDatum || 'Auto-beräknat slutdatum'"
                readonly
              />
            </div>
          </div>
        </div>
        <div class="mt-3 text-start">
          <button type="submit" class="btn btn-success font-weight-bold">Lägg till Elev</button>
        </div>
      </form>

      <!-- Formulär för att lägga till lärare -->
      <form v-else-if="formType === 'teacher'" @submit.prevent="submitTeacherForm">
        <div class="row g-3 text-start">
          <div class="col-md-6">
            <label for="teacherName" class="form-label">Namn</label>
            <input
              id="teacherName"
              v-model="teacherForm.name"
              type="text"
              class="form-control"
              placeholder="Ex. Doe, Jane"
            />
          </div>
        </div>
        <div class="row g-3 text-start">
          <div class="col-md-6">
            <label for="email" class="form-label">E-post</label>
            <input
              id="email"
              v-model="teacherForm.email"
              type="email"
              class="form-control"
              placeholder="example@gmail.com"
            />
          </div>
        </div>

        <div class="mt-3 text-start">
          <button type="submit" class="btn btn-success font-weight-bold">Lägg till Lärare</button>
        </div>
      </form>
    </div>
  </body>
</template>

<script>
  import client from '@/api/client.js'
  import { useToast } from '@/composables/useToast.js'

  const toast = useToast()

  export default {
    data() {
      return {
        formType: 'student', // Default form type
        studentForm: {
          namn: '',
          personnummer: '',
          kurspaket: '',
          startDatum: '',
          duration: null,
          slutDatum: '',
          kommun: '',
          telefon: '',
          mail: '',
          prov: '',
          ovrigt: '',
          slutprovDatum: '',
          dropout: false,
          teacher: '',
        },
        teacherForm: {
          name: '',
          email: '',
        },
      }
    },
    methods: {
      toggleForm(type) {
        this.formType = type
      },
      calculateEndDate() {
        if (this.studentForm.startDatum && this.studentForm.duration) {
          const startDate = new Date(this.studentForm.startDatum)
          const durationDays = this.studentForm.duration * 7 // Weeks to days
          const endDate = new Date(startDate)
          endDate.setDate(startDate.getDate() + durationDays - 3)
          this.studentForm.slutDatum = endDate.toISOString().split('T')[0]

          // Auto-set final test date
          const finalTestDate = new Date(endDate)
          finalTestDate.setDate(finalTestDate.getDate() - 8)
          this.studentForm.slutprovDatum = finalTestDate.toISOString().split('T')[0]
        }
      },
      updateDuration(value) {
        this.studentForm.duration = value
      },
      async submitStudentForm() {
        try {
          const response = await client.post('/student', this.studentForm)
          toast.success('Student added successfully!')
          console.log('Added student:', response.data)

          // Reset form after submission
          this.studentForm = {
            namn: '',
            personnummer: '',
            kurspaket: '',
            startDatum: '',
            duration: null,
            slutDatum: '',
            kommun: '',
            telefon: '',
            mail: '',
            prov: '',
            ovrigt: '',
            slutprovDatum: '',
            dropout: false,
            teacher: '',
          }
        } catch (error) {
          console.error('Error adding student:', error)
          toast.error('Failed to add student. Please try again.')
        }
      },
      async submitTeacherForm() {
        try {
          const response = await client.post('/teacher', this.teacherForm)
          toast.success('Teacher added successfully!')
          console.log('Added teacher:', response.data)

          // Reset form after submission
          this.teacherForm = {
            name: '',
            email: '',
          }
        } catch (error) {
          console.error('Error adding teacher:', error)
          toast.error('Failed to add teacher. Please try again.')
        }
      },
    },
  }
</script>

<style scoped>
  input {
    font-size: 12px;
    color: #898989;
  }

  form {
    margin-top: 20px;
  }

  input[type='text'],
  input[type='email'],
  textarea {
    display: block;
    margin-bottom: 10px;
    padding: 10px;
    max-width: 800px;
  }

  .active-link {
    font-weight: bold;
    color: black;
    background-color: white;
  }

  .checkbox-wrapper-27 .checkbox {
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
    -webkit-user-select: none;
    -moz-user-select: none;
    user-select: none;
  }

  .checkbox-wrapper-27 .checkbox > input[type='checkbox'] {
    position: absolute;
    opacity: 0;
    z-index: -1;
  }

  .checkbox-wrapper-27 .checkbox__icon {
    display: inline-block;
    color: #999;
    vertical-align: middle;
    margin-right: 5px;
  }

  .checkbox-wrapper-27 input[type='checkbox']:checked ~ .checkbox__icon {
    color: #2a7dea;
  }

  .checkbox-wrapper-27 .checkbox__icon:before {
    font-family: 'icons-27';
    speak: none;
    font-style: normal;
    font-weight: normal;
    font-variant: normal;
    text-transform: none;
    /* Better Font Rendering =========== */
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
  }

  .checkbox-wrapper-27 .icon--check:before,
  .checkbox-wrapper-27 input[type='checkbox']:checked ~ .checkbox__icon:before {
    content: '\e601';
  }

  .checkbox-wrapper-27 .icon--check-empty:before,
  .checkbox-wrapper-27 .checkbox__icon:before {
    content: '\e600';
  }

  @font-face {
    font-family: 'icons-27';
    font-weight: normal;
    font-style: normal;
    src: url('data:application/x-font-woff;charset=utf-8;base64,d09GRk9UVE8AAAR4AAoAAAAABDAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABDRkYgAAAA9AAAAPgAAAD4fZUAVE9TLzIAAAHsAAAAYAAAAGAIIvy3Y21hcAAAAkwAAABMAAAATBpVzFhnYXNwAAACmAAAAAgAAAAIAAAAEGhlYWQAAAKgAAAANgAAADYAeswzaGhlYQAAAtgAAAAkAAAAJAPiAedobXR4AAAC/AAAABgAAAAYBQAAAG1heHAAAAMUAAAABgAAAAYABlAAbmFtZQAAAxwAAAE5AAABOUQYtNZwb3N0AAAEWAAAACAAAAAgAAMAAAEABAQAAQEBCGljb21vb24AAQIAAQA6+BwC+BsD+BgEHgoAGVP/i4seCgAZU/+LiwwHi2v4lPh0BR0AAAB8Dx0AAACBER0AAAAJHQAAAO8SAAcBAQgPERMWGyBpY29tb29uaWNvbW9vbnUwdTF1MjB1RTYwMHVFNjAxAAACAYkABAAGAQEEBwoNL2X8lA78lA78lA77lA6L+HQVi/yU+JSLi/iU/JSLBd83Fffsi4v77Pvsi4v37AUOi/h0FYv8lPiUi4v33zc3i/s3++yLi/fs9zeL398F9wCFFftN+05JzUdI9xr7GveR95FHzwUO+JQU+JQViwwKAAMCAAGQAAUAAAFMAWYAAABHAUwBZgAAAPUAGQCEAAAAAAAAAAAAAAAAAAAAARAAAAAAAAAAAAAAAAAAAAAAQAAA5gEB4P/g/+AB4AAgAAAAAQAAAAAAAAAAAAAAIAAAAAAAAgAAAAMAAAAUAAMAAQAAABQABAA4AAAACgAIAAIAAgABACDmAf/9//8AAAAAACDmAP/9//8AAf/jGgQAAwABAAAAAAAAAAAAAAABAAH//wAPAAEAAAAAAACkYCfgXw889QALAgAAAAAAz65FuwAAAADPrkW7AAD/4AIAAeAAAAAIAAIAAAAAAAAAAQAAAeD/4AAAAgAAAAAAAgAAAQAAAAAAAAAAAAAAAAAAAAYAAAAAAAAAAAAAAAABAAAAAgAAAAIAAAAAAFAAAAYAAAAAAA4ArgABAAAAAAABAA4AAAABAAAAAAACAA4ARwABAAAAAAADAA4AJAABAAAAAAAEAA4AVQABAAAAAAAFABYADgABAAAAAAAGAAcAMgABAAAAAAAKACgAYwADAAEECQABAA4AAAADAAEECQACAA4ARwADAAEECQADAA4AJAADAAEECQAEAA4AVQADAAEECQAFABYADgADAAEECQAGAA4AOQADAAEECQAKACgAYwBpAGMAbwBtAG8AbwBuAFYAZQByAHMAaQBvAG4AIAAxAC4AMABpAGMAbwBtAG8AbwBuaWNvbW9vbgBpAGMAbwBtAG8AbwBuAFIAZQBnAHUAbABhAHIAaQBjAG8AbQBvAG8AbgBHAGUAbgBlAHIAYQB0AGUAZAAgAGIAeQAgAEkAYwBvAE0AbwBvAG4AAAAAAwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA==')
      format('woff');
  }
</style>
