<template>
  <v-container>
    <form @submit.prevent="submitForm">
      <!-- Student Selection -->
      <v-autocomplete
        v-model="selectedStudent"
        :items="students"
        item-title="name"
        item-value="_id"
        label="Välj befintlig elev"
        return-object
        :loading="loadingStudents"
        :search="studentSearchQuery"
        :no-data-text="studentSearchQuery.length < 2 ? 'Skriv minst 2 tecken för att söka' : 'Inga elever hittades'"
        clearable
        @update:search="searchStudents"
      ></v-autocomplete>

      <!-- Course Selection -->
      <v-autocomplete
        v-model="selectedCourseInstance"
        :items="filteredCourseInstances"
        item-title="displayName"
        item-value="_id"
        label="Välj kursinstans"
        :loading="loadingCourseInstances"
        :search="courseInstanceSearchQuery"
        return-object
        clearable
        :no-data-text="'Inga kursinstanser hittades'"
        @update:search="courseInstanceSearchQuery = $event"
      ></v-autocomplete>

      <!-- Dates -->
      <v-text-field v-model="startDate" label="Startdatum" type="date"></v-text-field>
      <v-select
        v-model="studyLength"
        :items="[5, 10, 20]"
        label="Studielängd (veckor)"
        @update:model-value="calculateEndDate"
      ></v-select>
      <v-text-field :model-value="endDate" label="Beräknat slutdatum" readonly></v-text-field>
      <v-text-field v-model="finalExamDate" label="Slutprovsdatum" type="date"></v-text-field>

      <!-- New Fields -->
      <v-checkbox v-model="needsSupport" label="Behöver extra stöd"></v-checkbox>
      <v-radio-group v-model="examMode" inline label="Examinationsform">
        <v-radio label="På plats" value="on-site"></v-radio>
        <v-radio label="Distans" value="remote"></v-radio>
      </v-radio-group>
      
      <!-- APL Status -->
      <v-select
          v-model="aplStatus"
          :items="aplStatusOptions"
          label="APL Status"
          item-title="text"
          item-value="value"
        ></v-select>

      <v-btn type="submit" color="primary" :loading="submitting">Anmäl elev</v-btn>
    </form>
  </v-container>
</template>

<script setup>
import { ref, watch, onMounted } from 'vue';
import client from '@/api/client.js';
import { useToast } from '@/composables/useToast.js';
import debounce from 'lodash.debounce';

const toast = useToast();

const props = defineProps({
  mode: {
    type: String,
    required: false,
    default: 'single',
    validator: (value) => !value || value === 'single',
  },
});

const emit = defineEmits(['submit']);

// Student selection
const selectedStudent = ref(null);
const students = ref([]);
const loadingStudents = ref(false);
const studentSearchQuery = ref('');

// Cache all students for filtering
const allStudents = ref([]);

const searchStudents = debounce(async (query) => {
  studentSearchQuery.value = query || '';
  
  // If we don't have students cached yet, fetch them
  if (allStudents.value.length === 0 && (!query || query.length >= 2)) {
    loadingStudents.value = true;
    try {
      const { data } = await client.get('/students');
      allStudents.value = Array.isArray(data) ? data : [];
    } catch (error) {
      console.error('Error fetching students:', error);
      allStudents.value = [];
    } finally {
      loadingStudents.value = false;
    }
  }
  
  // Filter students by search query
  if (!query || query.length < 2) {
    students.value = [];
    return;
  }
  
  const lowerQuery = query.toLowerCase();
  students.value = allStudents.value.filter(s => 
    s.name?.toLowerCase().includes(lowerQuery) ||
    s.email?.toLowerCase().includes(lowerQuery) ||
    s.personalNumber?.includes(query)
  );
}, 300);

// Course data
const courseInstances = ref([]);
const loadingCourseInstances = ref(false);
const selectedCourseInstance = ref(null);
const courseInstanceSearchQuery = ref('');

// Dates
const startDate = ref('');
const studyLength = ref(10);
const endDate = ref('');
const finalExamDate = ref('');

// New fields
const needsSupport = ref(false);
const examMode = ref('on-site');
const aplStatus = ref('GRAY');
const aplStatusOptions = [
    { text: 'Ej påbörjad', value: 'GRAY' },
    { text: 'Pågående', value: 'BLUE' },
    { text: 'Slutförd', value: 'GREEN' },
    { text: 'Avbruten', value: 'RED' },
];


const submitting = ref(false);

// Computed property for filtered course instances
const filteredCourseInstances = ref([]);

// Fetch initial data
const fetchCourseInstances = async () => {
  loadingCourseInstances.value = true;
  try {
    const { data } = await client.get('/course-instances');
    if (data.success && Array.isArray(data.instances)) {
      courseInstances.value = data.instances.map(instance => ({
        ...instance,
        displayName: `${instance.courseName || instance.courseCode || 'Okänd kurs'} (${instance.courseCode || 'Ingen kod'})`,
      }));
      filteredCourseInstances.value = courseInstances.value;
    } else if (Array.isArray(data)) {
      // Fallback if response is direct array
      courseInstances.value = data.map(instance => ({
        ...instance,
        displayName: `${instance.courseName || instance.courseCode || 'Okänd kurs'} (${instance.courseCode || 'Ingen kod'})`,
      }));
      filteredCourseInstances.value = courseInstances.value;
    }
  } catch (error) {
    console.error('Error fetching course instances:', error);
    courseInstances.value = [];
    filteredCourseInstances.value = [];
  } finally {
    loadingCourseInstances.value = false;
  }
};

// Filter course instances based on search query
watch(courseInstanceSearchQuery, (query) => {
  if (!query || query.trim() === '') {
    filteredCourseInstances.value = courseInstances.value;
  } else {
    const lowerQuery = query.toLowerCase();
    filteredCourseInstances.value = courseInstances.value.filter(instance => 
      instance.courseName?.toLowerCase().includes(lowerQuery) ||
      instance.courseCode?.toLowerCase().includes(lowerQuery) ||
      instance.displayName?.toLowerCase().includes(lowerQuery)
    );
  }
});

// Fetch course instances on mount
onMounted(() => {
  fetchCourseInstances();
});

const calculateEndDate = () => {
    if (startDate.value && studyLength.value) {
        const start = new Date(startDate.value);
        const durationDays = studyLength.value * 7;
        const end = new Date(start.setDate(start.getDate() + durationDays - 3));
        endDate.value = end.toISOString().split('T')[0];
    }
};

watch([startDate, studyLength], calculateEndDate);

const submitForm = async () => {
  if (!selectedStudent.value) {
    // Show error
    return;
  }

  submitting.value = true;
  
  if (!selectedCourseInstance.value) {
    console.error('No course instance selected');
    submitting.value = false;
    return;
  }

  // Handle both object and ID selection
  let instance;
  if (typeof selectedCourseInstance.value === 'object' && selectedCourseInstance.value !== null) {
    instance = selectedCourseInstance.value;
  } else {
    instance = courseInstances.value.find(ci => ci._id === selectedCourseInstance.value);
  }
  
  if (!instance) {
    console.error('Course instance not found');
    submitting.value = false;
    return;
  }

  // Ensure mainCourseId is available (could be populated object or just ID)
  const mainCourseId = typeof instance.mainCourseId === 'object' 
    ? instance.mainCourseId._id 
    : instance.mainCourseId;

  const educationEntries = [{
    type: 'Course',
    refId: mainCourseId,
    name: instance.courseName || instance.courseCode || 'Okänd kurs',
    startDate: startDate.value,
    endDate: endDate.value,
    slutprovDate: finalExamDate.value,
  }];

  const payload = {
    studentId: selectedStudent.value._id,
    educationEntries,
    // The backend doesn't seem to directly support these fields on process-education
    // This may need a subsequent call or a backend modification.
    // For now, we pass them for potential future use.
    needsSupport: needsSupport.value,
    examMode: examMode.value,
    aplStatus: aplStatus.value,
  };

  try {
      await client.post('/process-education', payload);
      // Handle success
      toast.success('Eleven har anmälts till kursen framgångsrikt!');
      
      // Save APL status before reset (if changed from default)
      const previousAplStatus = aplStatus.value;
      const previousStudentId = selectedStudent.value?._id;

      // Reset form only after the request has completed successfully
      selectedStudent.value = null;
      selectedCourseInstance.value = null;
      startDate.value = '';
      endDate.value = '';
      finalExamDate.value = '';
      needsSupport.value = false;
      examMode.value = 'on-site';
      aplStatus.value = 'GRAY';
      studentSearchQuery.value = '';
      courseInstanceSearchQuery.value = '';

      if (previousAplStatus !== 'GRAY' && previousStudentId) {
        await client.patch(`/students/${previousStudentId}`, { aplStatus: previousAplStatus });
      }

  } catch (error) {
      console.error('Error submitting enrollment:', error);
      toast.error('Kunde inte anmäla eleven till kursen. ' + error.message);
  } finally {
      submitting.value = false;
  }
};

</script>
