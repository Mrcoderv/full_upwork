<template>
  <div class="modal-backdrop">
    <div class="modal-content">
      <h2>{{ title }}</h2> <!-- Use prop for title -->

      <label>Datum:</label>
      <DatePicker
        v-model="form.date"
        :enable-time="false"
        :locale="svLocale"
        :auto-apply="true"
        format="yyyy-MM-dd"
      />

      <label>Från tid:</label>
      <input v-model="form.timeFrom" type="time" class="time-input" />

      <label>Till tid:</label>
      <input v-model="form.timeTo" type="time" class="time-input" />

    <label>Elev:</label>
    <v-autocomplete
      ref="studentAuto"
      v-model="form.student"
      :items="students"
      item-title="displayName"
      item-value="_id"
      label="Välj elev"
      outlined
      clearable
      return-object
      :no-data-text="'Inga elever tillgängliga'"
      :menu-props="{ maxHeight: '300px' }"
      :custom-filter="filterStudents"
      auto-select-first
    >
      <template #item="{ props: itemProps, item }">
        <v-list-item v-bind="itemProps" :title="item.raw.displayName || `${item.raw.name} (${item.raw.personalNumber || ''})`" />
      </template>
      <template #selection="{ item }">
        {{ item.raw.displayName || `${item.raw.name} (${item.raw.personalNumber || ''})` }}
      </template>
    </v-autocomplete>

      <label>Plats:</label>
      <input v-model="form.location" placeholder="T.ex. Samtalsrum A" />

      <!-- 🔽 ADD TEXTAREA FOR INFO 🔽 -->
      <label>Information:</label>
      <textarea v-model="form.info" placeholder="Anteckningar om mötet..."></textarea>

      <div class="modal-buttons">
        <button @click="submit">Spara</button>
        <button @click="emit('close')">Avbryt</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { VueDatePicker as DatePicker } from '@vuepic/vue-datepicker'
import '@vuepic/vue-datepicker/dist/main.css'
import { sv } from 'date-fns/locale'
import client from '@/api/client.js'
import { useToast } from '@/composables/useToast.js'
import { useStore } from 'vuex'

const store = useStore()
const emit = defineEmits(['event-added', 'close'])
const toast = useToast()

const props = defineProps({
  title: {
    type: String,
    default: 'Boka möte'
  },
  bookedByRole: {
    type: String,
    required: false,
    default: null
  }
})

const svLocale = sv
const form = ref({
  date: new Date(),
  timeFrom: new Date().toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' }),
  timeTo: new Date(new Date().getTime() + 60 * 60 * 1000).toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' }),
  student: null,
  location: '',
  info: ''
})
const students = ref([])

const userRole = computed(() => store.getters.userRole || 'guest')
const username = computed(() => store.state.user?.username || store.state.user?.email || 'Okänd')

const eventTitle = computed(() => {
  if (userRole.value === 'syv') {
    return `${username.value}, Syv`
  } else if (userRole.value === 'specped') {
    return `${username.value}, Special Pedagog`
  } else if (userRole.value === 'admin' || userRole.value === 'systemadmin') {
    const roleLabel = props.bookedByRole === 'syv' ? 'Syv' :
                     props.bookedByRole === 'specped' ? 'Special Pedagog' :
                     userRole.value === 'systemadmin' ? 'Systemadmin' : 'Admin';
    return `${username.value}, ${roleLabel}`;
  }
  if (props.bookedByRole) {
    const roleLabel = props.bookedByRole === 'syv' ? 'Syv' :
                     props.bookedByRole === 'specped' ? 'Special Pedagog' :
                     props.bookedByRole;
    return `${username.value}, ${roleLabel}`;
  }
  return 'Möte';
})

const bookedByValue = computed(() => {
  if (props.bookedByRole) {
    return props.bookedByRole;
  }
  if (userRole.value === 'admin' || userRole.value === 'systemadmin') {
    return userRole.value;
  }
  if (userRole.value === 'syv' || userRole.value === 'specped') {
    return userRole.value;
  }
  return userRole.value;
})

function filterStudents(value, query, item) {
  if (!query || !query.trim()) return true;

  const searchQuery = query.toLowerCase().trim();

  let student = item?.raw || item?.value || item || value;

  if (value && typeof value === 'object' && value.name && !student?.name) {
    student = value;
  }

  if (!student || !student.name) {
    return false;
  }

  if (student.searchText) {
    return student.searchText.includes(searchQuery);
  }

  const name = (student.name || '').toLowerCase();
  const personalNumber = (student.personalNumber || '').toLowerCase();
  const displayName = (student.displayName || '').toLowerCase();

  return name.includes(searchQuery) ||
         personalNumber.includes(searchQuery) ||
         displayName.includes(searchQuery);
}

async function fetchStudents() {
  try {
    const response = await client.get('/students');
    const data = response.data;

    students.value = (Array.isArray(data) ? data : [])
      .filter(s => !s.dropout)
      .map(s => ({
        _id: s._id,
        name: s.name,
        personalNumber: s.personalNumber || "",
        displayName: `${s.name} (${s.personalNumber || ''})`,
        searchText: `${s.name} ${s.personalNumber || ''}`.toLowerCase()
      }));
  } catch (error) {
    console.error("Kunde inte hämta elever:", error);
  }
}

async function submit() {
  if (!form.value.student || !form.value.student._id) {
    toast.error("Välj en elev.");
    return;
  }

  const [fromHours, fromMinutes] = form.value.timeFrom.split(':');
  const [toHours, toMinutes] = form.value.timeTo.split(':');
  const startDateTime = new Date(form.value.date);
  startDateTime.setHours(parseInt(fromHours), parseInt(fromMinutes));
  const endDateTime = new Date(form.value.date);
  endDateTime.setHours(parseInt(toHours), parseInt(toMinutes));

  if (endDateTime.getTime() <= startDateTime.getTime()) {
    toast.error("Till tid måste vara efter från tid.");
    return;
  }

  let meetingTitle = eventTitle.value;

  if ((userRole.value === 'admin' || userRole.value === 'systemadmin') &&
      !props.bookedByRole) {
    meetingTitle = `Möte, ${form.value.student.name}`;
  }

  const bookedBy = bookedByValue.value;

  const payload = {
    title: meetingTitle,
    start: startDateTime.toISOString(),
    end: endDateTime.toISOString(),
    location: form.value.location || '',
    studentId: form.value.student._id,
    studentName: form.value.student.name,
    personalNumber: form.value.student.personalNumber || '',
    bookedBy: bookedBy,
    info: form.value.info || ''
  };

  try {
    const response = await client.post('/meetings', payload);
    const savedMeeting = response.data;
    this.$refs.studentAuto.closeMenu();
    emit('event-added', savedMeeting);
    emit('close');
  } catch (err) {
    const errorMessage = err.message || 'Okänt fel';
    toast.error(`Kunde inte spara mötet: ${errorMessage}`);
  }
}

onMounted(fetchStudents)
</script>


<style scoped>
.modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.5);
  display: flex;
  justify-content: center;
  align-items: center;
}
.modal-content {
  background: white;
  padding: 2rem;
  border-radius: 8px;
  min-width: 300px;
}
.modal-content label {
  display: block;
  margin-top: 1rem;
}
.modal-content input, .modal-content textarea, .modal-content .time-input {
  width: 100%;
  padding: 0.5rem;
  margin-top: 0.25rem;
  box-sizing: border-box;
  border: 1px solid #ccc;
  border-radius: 4px;
}
.modal-content input, .modal-content textarea {
  width: 100%;
  padding: 0.5rem;
  margin-top: 0.25rem;
}
.modal-buttons {
  margin-top: 1.5rem;
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}
.modal-buttons button {
  padding: 0.5rem 1rem;
  border: none;
  border-radius: 4px;
  background: #007bff;
  color: white;
  cursor: pointer;
}
.modal-buttons button:hover {
  background: #0056b3;
}
</style>
