<template>
  <div class="placement-wizard-overlay" @click.self="$emit('close')">
    <div class="placement-wizard">
      <div class="wizard-header">
        <h3>Placera kurs</h3>
        <button class="btn-close-wizard" @click="$emit('close')">&times;</button>
      </div>

      <!-- Step Indicator -->
      <div class="step-indicator">
        <div
          v-for="(s, i) in steps"
          :key="i"
          class="step-dot"
          :class="{ active: step === i + 1, completed: step > i + 1 }"
          :title="s"
        >
          <span v-if="step > i + 1">&#10003;</span>
          <span v-else>{{ i + 1 }}</span>
        </div>
      </div>

      <div class="wizard-body">
        <!-- Step 1: Placement Type -->
        <div v-if="step === 1" class="wizard-step">
          <h4>Välj placeringstyp</h4>
          <div class="type-selection">
            <button
              class="type-card"
              :class="{ selected: placementType === 'course' }"
              @click="placementType = 'course'"
            >
              <div class="type-icon">&#128218;</div>
              <div class="type-label">Enskild kurs</div>
              <div class="type-desc">Placera en enskild kurs</div>
            </button>
            <button
              class="type-card"
              :class="{ selected: placementType === 'package' }"
              @click="placementType = 'package'"
            >
              <div class="type-icon">&#128218;&#128218;</div>
              <div class="type-label">Kurspaket</div>
              <div class="type-desc">Placera ett helt kurspaket</div>
            </button>
          </div>
        </div>

        <!-- Step 2a: Select Course -->
        <div v-if="step === 2 && placementType === 'course'" class="wizard-step">
          <h4>Välj kurs</h4>
          <div class="search-box">
            <input
              v-model="courseSearchQuery"
              type="text"
              class="form-control"
              placeholder="Sök kurs efter namn eller kod..."
              @input="filterCourses"
            />
          </div>
          <div class="course-list">
            <div
              v-for="course in filteredCourses"
              :key="course._id"
              class="course-option"
              :class="{ selected: selectedCourse?._id === course._id }"
              @click="selectedCourse = course"
            >
              <span class="course-name">{{ course.courseName }}</span>
              <span class="course-code">{{ course.courseCode }}</span>
              <span class="course-extent">{{ course.courseExtent }}v</span>
            </div>
            <div v-if="filteredCourses.length === 0" class="no-results">
              Inga kurser hittades
            </div>
          </div>
        </div>

        <!-- Step 2b: Select Package -->
        <div v-if="step === 2 && placementType === 'package'" class="wizard-step">
          <h4>Välj kurspaket</h4>
          <div class="course-list">
            <div
              v-for="pkg in packages"
              :key="pkg._id"
              class="course-option"
              :class="{ selected: selectedPackage?._id === pkg._id }"
              @click="selectPackage(pkg)"
            >
              <span class="course-name">{{ pkg.coursePackageName }}</span>
              <span class="course-code">{{ pkg.coursePackageCode }}</span>
              <span class="course-extent">{{ pkg.coursePackageExtent }}</span>
            </div>
            <div v-if="packages.length === 0" class="no-results">
              Laddar kurspaket...
            </div>
          </div>

          <!-- Exclude courses from package -->
          <div v-if="selectedPackage && packageCourses.length > 0" class="exclude-section">
            <h5>Borttagande kurser (valfritt)</h5>
            <div
              v-for="course in packageCourses"
              :key="course._id"
              class="exclude-option"
            >
              <label>
                <input
                  v-model="excludeCourseIds"
                  type="checkbox"
                  :value="course._id"
                />
                {{ course.courseName }} ({{ course.courseCode }})
              </label>
            </div>
          </div>
        </div>

        <!-- Step 3: Duration & Pace -->
        <div v-if="step === 3" class="wizard-step">
          <h4>Studietakt & period</h4>
          <div class="form-group">
            <label>Startdatum</label>
            <input v-model="startDate" type="date" class="form-control" />
          </div>
          <div v-if="placementType === 'course'" class="form-group">
            <label>Kurslängd</label>
            <select v-model="durationWeeks" class="form-control">
              <option :value="5">5 veckor (100%)</option>
              <option :value="10">10 veckor (50%)</option>
              <option :value="20">20 veckor (25%)</option>
            </select>
          </div>
          <div v-if="placementType === 'course' && selectedCourse" class="course-summary">
            <p>
              <strong>{{ selectedCourse.courseName }}</strong> &mdash;
              {{ durationWeeks }} veckor, startar {{ formatDate(startDate) }}
            </p>
          </div>
          <div v-if="placementType === 'package' && selectedPackage" class="course-summary">
            <p>
              <strong>{{ selectedPackage.coursePackageName }}</strong> &mdash;
              {{ packageCourses.length - excludeCourseIds.length }} kurser,
              startar {{ formatDate(startDate) }}
            </p>
          </div>
        </div>

        <!-- Step 4: Student Info -->
        <div v-if="step === 4" class="wizard-step">
          <h4>Elevinformation</h4>
          <div class="info-grid">
            <div class="info-row">
              <span class="info-label">Namn:</span>
              <span class="info-value">{{ student.name }}</span>
            </div>
            <div v-if="student.personalNumber" class="info-row">
              <span class="info-label">Personnummer:</span>
              <span class="info-value">{{ student.personalNumber }}</span>
            </div>
            <div v-if="student.email" class="info-row">
              <span class="info-label">E-post:</span>
              <span class="info-value">{{ student.email }}</span>
            </div>
            <div v-if="student.phone" class="info-row">
              <span class="info-label">Telefon:</span>
              <span class="info-value">{{ student.phone }}</span>
            </div>
            <div v-if="student.municipality?.type" class="info-row">
              <span class="info-label">Kommun:</span>
              <span class="info-value">{{ student.municipality.type }}</span>
            </div>
          </div>
        </div>

        <!-- Step 5: Exam Configuration -->
        <div v-if="step === 5" class="wizard-step">
          <h4>Tentakonfiguration</h4>
          <div class="form-group">
            <label>Tentatyp</label>
            <select v-model="examMode" class="form-control">
              <option value="on-site">På plats</option>
              <option value="remote">Distans</option>
            </select>
          </div>
          <div class="form-group">
            <label>Kommun</label>
            <select v-model="examMunicipality" class="form-control">
              <option value="">Välj kommun</option>
              <option v-for="m in municipalities" :key="m" :value="m">{{ m }}</option>
            </select>
          </div>
          <div class="info-note">
            <p v-if="examMode === 'remote'">
              Tentamen sker på distans.
            </p>
            <p v-else>
              Tentamen sker på plats.
            </p>
          </div>
        </div>

        <!-- Step 6: Preview -->
        <div v-if="step === 6" class="wizard-step">
          <h4>Förhandsgranskning</h4>
          <div v-if="isLoadingPreview" class="loading-preview">
            <p>Beräknar datum...</p>
          </div>
          <div v-else-if="previewError" class="preview-error">
            <p>{{ previewError }}</p>
          </div>
          <div v-else-if="previewData" class="preview-table-wrapper">
            <table class="preview-table">
              <thead>
                <tr>
                  <th>Kurs</th>
                  <th>Start</th>
                  <th>Slut</th>
                  <th>Slutprov</th>
                  <th>Tentatyp</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(c, idx) in previewData.courses" :key="idx">
                  <td>
                    {{ c.courseName }}
                    <span v-if="c.grouped" class="grouped-badge">Grupperad</span>
                  </td>
                  <td>{{ formatDate(c.startDate) }}</td>
                  <td>{{ formatDate(c.endDate) }}</td>
                  <td>{{ formatDate(c.slutprovDate) }}</td>
                  <td>{{ c.examMode === 'remote' ? 'Distans' : 'På plats' }}</td>
                </tr>
              </tbody>
            </table>
            <div class="preview-summary">
              <p>Totalt: {{ previewData.courses.length }} kurs(er), {{ previewData.totalWeeks }} veckor</p>
            </div>
          </div>
        </div>

        <!-- Step 7: Confirmation -->
        <div v-if="step === 7" class="wizard-step">
          <h4>Bekräftelse</h4>
          <div v-if="isSubmitting" class="loading-preview">
            <p>Skapar placering...</p>
          </div>
          <div v-else-if="submitError" class="preview-error">
            <p>{{ submitError }}</p>
          </div>
          <div v-else-if="submitSuccess" class="submit-success">
            <div class="success-icon">&#10003;</div>
            <p>Kursen har placerats!</p>
            <button class="btn btn-primary" @click="$emit('placed')">Stäng</button>
          </div>
        </div>
      </div>

      <!-- Navigation -->
      <div class="wizard-footer">
        <button
          v-if="step > 1 && !isSubmitting && !submitSuccess"
          class="btn btn-secondary"
          @click="prevStep"
        >
          Tillbaka
        </button>
        <div class="footer-spacer"></div>
        <button
          v-if="step < totalSteps && !isSubmitting && !submitSuccess"
          class="btn btn-primary"
          :disabled="!canProceed"
          @click="nextStep"
        >
          Nästa
        </button>
        <button
          v-if="step === totalSteps && !isSubmitting && !submitSuccess"
          class="btn btn-success"
          :disabled="isSubmitting"
          @click="submitPlacement"
        >
          {{ isSubmitting ? 'Skapar...' : 'Bekräfta placering' }}
        </button>
      </div>
    </div>
  </div>
</template>

<script>
import { ref, computed, watch, onMounted } from 'vue';
import client from '@/api/client.js';
import { useToast } from '@/composables/useToast.js';
import { municipalityPricing } from '@/utils/municipalityPricing.js';

export default {
  name: 'CoursePlacementWizard',
  props: {
    student: { type: Object, required: true },
    preselectedCourseId: { type: String, default: null },
    preselectedInstanceId: { type: String, default: null },
  },
  emits: ['close', 'placed'],
  setup(props, { emit }) {
    const toast = useToast();

    const step = ref(1);
    const totalSteps = 7;
    const steps = ['Typ', 'Kurs', 'Period', 'Elev', 'Tenta', 'Granskning', 'Bekräftelse'];

    const placementType = ref('course');
    const courseSearchQuery = ref('');
    const courses = ref([]);
    const packages = ref([]);
    const selectedCourse = ref(null);
    const selectedPackage = ref(null);
    const packageCourses = ref([]);
    const excludeCourseIds = ref([]);

    const startDate = ref('');
    const durationWeeks = ref(5);

    const examMode = ref('on-site');
    const examMunicipality = ref('');

    const isLoadingPreview = ref(false);
    const previewData = ref(null);
    const previewError = ref('');

    const isSubmitting = ref(false);
    const submitError = ref('');
    const submitSuccess = ref(false);

    const municipalities = computed(() => Object.keys(municipalityPricing));

    const filteredCourses = computed(() => {
      const q = courseSearchQuery.value.toLowerCase().trim();
      if (!q) return courses.value;
      return courses.value.filter(
        (c) =>
          c.courseName?.toLowerCase().includes(q) ||
          c.courseCode?.toLowerCase().includes(q)
      );
    });

    const canProceed = computed(() => {
      switch (step.value) {
        case 1: return !!placementType.value;
        case 2:
          return placementType.value === 'course'
            ? !!selectedCourse.value
            : !!selectedPackage.value;
        case 3: return !!startDate.value;
        case 4: return true;
        case 5: return !!examMode.value;
        case 6: return !!previewData.value && !isLoadingPreview.value;
        default: return true;
      }
    });

    const formatDate = (date) => {
      if (!date) return '-';
      const d = new Date(date);
      if (isNaN(d.getTime())) return '-';
      return d.toLocaleDateString('sv-SE');
    };

    const loadCourses = async () => {
      try {
        const res = await client.get('/courses');
        courses.value = Array.isArray(res.data) ? res.data : [];
      } catch (err) {
        console.error('Error loading courses:', err);
      }
    };

    const loadPackages = async () => {
      try {
        const res = await client.get('/coursepackages');
        packages.value = Array.isArray(res.data) ? res.data : res.data?.packages || [];
      } catch (err) {
        console.error('Error loading packages:', err);
      }
    };

    const selectPackage = async (pkg) => {
      selectedPackage.value = pkg;
      excludeCourseIds.value = [];
      // Load courses in the package
      try {
        const res = await client.get(`/coursepackages/${pkg._id}`);
        const populated = res.data?.coursePackageCourses || [];
        packageCourses.value = Array.isArray(populated) ? populated : [];
      } catch (err) {
        console.error('Error loading package courses:', err);
        packageCourses.value = [];
      }
    };

    const filterCourses = () => {
      // Filtering is done via computed
    };

    const nextStep = async () => {
      if (step.value === 5) {
        // Load preview before showing step 6
        await loadPreview();
      }
      if (step.value < totalSteps) {
        step.value++;
      }
    };

    const prevStep = () => {
      if (step.value > 1) {
        step.value--;
      }
    };

    const loadPreview = async () => {
      isLoadingPreview.value = true;
      previewError.value = '';
      previewData.value = null;

      try {
        const payload = {
          studentId: props.student._id,
          type: placementType.value,
          startDate: startDate.value,
          examMode: examMode.value,
          municipality: examMunicipality.value || props.student.municipality?.type || '',
        };

        if (placementType.value === 'course' && selectedCourse.value) {
          payload.courseId = selectedCourse.value._id;
          payload.durationWeeks = durationWeeks.value;
        } else if (placementType.value === 'package' && selectedPackage.value) {
          payload.packageId = selectedPackage.value._id;
          payload.excludeCourseIds = excludeCourseIds.value;
        }

        const res = await client.post('/placement/preview', payload);
        previewData.value = res.data;
      } catch (err) {
        console.error('Error loading preview:', err);
        previewError.value =
          err.response?.data?.error || 'Kunde inte beräkna datum. Försök igen.';
      } finally {
        isLoadingPreview.value = false;
      }
    };

    const submitPlacement = async () => {
      isSubmitting.value = true;
      submitError.value = '';

      try {
        const entries = [];

        if (placementType.value === 'course' && selectedCourse.value) {
          entries.push({
            type: 'Course',
            refId: selectedCourse.value._id,
            name: selectedCourse.value.courseName,
            startDate: startDate.value,
            endDate: new Date(
              new Date(startDate.value).getTime() + durationWeeks.value * 7 * 24 * 60 * 60 * 1000
            )
              .toISOString()
              .slice(0, 10),
          });
        } else if (placementType.value === 'package' && selectedPackage.value) {
          // Build the package entry with excluded courses
          entries.push({
            type: 'CoursePackage',
            refId: selectedPackage.value._id,
            name: selectedPackage.value.coursePackageName,
            startDate: startDate.value,
            excludedCourseIds: excludeCourseIds.value,
          });
        }

        await client.post('/process-education', {
          studentId: props.student._id,
          educationEntries: entries,
          needsSupport: false,
          examMode: examMode.value,
        });

        submitSuccess.value = true;
        toast.success('Kursen har placerats!');
      } catch (err) {
        console.error('Error placing course:', err);
        submitError.value =
          err.response?.data?.error ||
          err.response?.data?.message ||
          'Kunde inte placera kursen. Försök igen.';
      } finally {
        isSubmitting.value = false;
      }
    };

    // Set default start date to next Monday
    const getNextMonday = () => {
      const d = new Date();
      const day = d.getDay();
      const diff = day === 1 ? 0 : (8 - day) % 7;
      d.setDate(d.getDate() + diff);
      d.setHours(0, 0, 0, 0);
      return d.toISOString().slice(0, 10);
    };

    // Set default exam mode based on student municipality
    const setDefaults = () => {
      startDate.value = getNextMonday();
      const mun = props.student.municipality?.type || '';
      examMunicipality.value = mun;
      // Upplands Bro defaults to remote
      const normalized = mun.trim().toLowerCase().replace(/[\s-]+/g, '');
      examMode.value = normalized === 'upplandsbro' ? 'remote' : 'on-site';
    };

    onMounted(() => {
      loadCourses();
      loadPackages();
      setDefaults();

      // Pre-select course if provided
      if (props.preselectedCourseId) {
        const found = courses.value.find((c) => c._id === props.preselectedCourseId);
        if (found) {
          selectedCourse.value = found;
        }
      }
    });

    // Watch for preselectedCourseId after courses load
    watch(courses, (newCourses) => {
      if (props.preselectedCourseId && !selectedCourse.value) {
        const found = newCourses.find((c) => c._id === props.preselectedCourseId);
        if (found) {
          selectedCourse.value = found;
          // Skip to step 3 since course is pre-selected
          step.value = 3;
        }
      }
    });

    return {
      step,
      totalSteps,
      steps,
      placementType,
      courseSearchQuery,
      courses,
      packages,
      selectedCourse,
      selectedPackage,
      packageCourses,
      excludeCourseIds,
      startDate,
      durationWeeks,
      examMode,
      examMunicipality,
      isLoadingPreview,
      previewData,
      previewError,
      isSubmitting,
      submitError,
      submitSuccess,
      municipalities,
      filteredCourses,
      canProceed,
      formatDate,
      filterCourses,
      selectPackage,
      nextStep,
      prevStep,
      submitPlacement,
    };
  },
};
</script>

<style scoped>
.placement-wizard-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  z-index: 1050;
  display: flex;
  justify-content: center;
  align-items: center;
}

.placement-wizard {
  background: white;
  border-radius: 8px;
  width: 720px;
  max-width: 95vw;
  max-height: 90vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
}

.wizard-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 24px;
  border-bottom: 1px solid #dee2e6;
}

.wizard-header h3 {
  margin: 0;
  font-size: 18px;
}

.btn-close-wizard {
  background: none;
  border: none;
  font-size: 24px;
  cursor: pointer;
  color: #6c757d;
  padding: 0 4px;
}

.btn-close-wizard:hover {
  color: #343a40;
}

.step-indicator {
  display: flex;
  justify-content: center;
  gap: 8px;
  padding: 12px 24px;
  border-bottom: 1px solid #dee2e6;
}

.step-dot {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: #e9ecef;
  color: #6c757d;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: 600;
}

.step-dot.active {
  background: #2c9316;
  color: white;
}

.step-dot.completed {
  background: #28a745;
  color: white;
}

.wizard-body {
  flex: 1;
  overflow-y: auto;
  padding: 24px;
}

.wizard-step h4 {
  margin: 0 0 16px 0;
  font-size: 16px;
  color: #2c3e50;
}

.type-selection {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}

.type-card {
  padding: 24px;
  border: 2px solid #dee2e6;
  border-radius: 8px;
  background: white;
  cursor: pointer;
  text-align: center;
  transition: border-color 0.2s, background 0.2s;
}

.type-card:hover {
  border-color: #2c9316;
}

.type-card.selected {
  border-color: #2c9316;
  background: #f0fff0;
}

.type-icon {
  font-size: 32px;
  margin-bottom: 8px;
}

.type-label {
  font-weight: 600;
  font-size: 14px;
  margin-bottom: 4px;
}

.type-desc {
  font-size: 12px;
  color: #6c757d;
}

.search-box {
  margin-bottom: 12px;
}

.course-list {
  max-height: 300px;
  overflow-y: auto;
  border: 1px solid #dee2e6;
  border-radius: 4px;
}

.course-option {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 14px;
  border-bottom: 1px solid #f0f0f0;
  cursor: pointer;
  transition: background 0.15s;
}

.course-option:hover {
  background: #f8f9fa;
}

.course-option.selected {
  background: #e8f5e9;
  border-left: 3px solid #2c9316;
}

.course-name {
  flex: 1;
  font-weight: 500;
}

.course-code {
  color: #6c757d;
  font-size: 13px;
}

.course-extent {
  background: #e9ecef;
  padding: 2px 8px;
  border-radius: 12px;
  font-size: 12px;
  font-weight: 500;
}

.no-results {
  padding: 20px;
  text-align: center;
  color: #6c757d;
  font-style: italic;
}

.exclude-section {
  margin-top: 16px;
  padding-top: 16px;
  border-top: 1px solid #dee2e6;
}

.exclude-section h5 {
  font-size: 14px;
  margin: 0 0 8px 0;
}

.exclude-option {
  padding: 6px 0;
}

.exclude-option label {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  font-size: 14px;
}

.form-group {
  margin-bottom: 16px;
}

.form-group label {
  display: block;
  font-weight: 500;
  margin-bottom: 4px;
  font-size: 14px;
}

.form-control {
  width: 100%;
  padding: 8px 12px;
  border: 1px solid #dee2e6;
  border-radius: 4px;
  font-size: 14px;
}

.course-summary {
  background: #f8f9fa;
  padding: 12px;
  border-radius: 4px;
  margin-top: 12px;
}

.course-summary p {
  margin: 0;
  font-size: 14px;
}

.info-grid {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.info-row {
  display: flex;
  align-items: center;
  padding: 8px 12px;
  background: #f8f9fa;
  border-radius: 4px;
}

.info-label {
  font-weight: 500;
  width: 140px;
  flex-shrink: 0;
  font-size: 14px;
}

.info-value {
  font-size: 14px;
}

.info-note {
  margin-top: 16px;
  padding: 12px;
  background: #e8f5e9;
  border-radius: 4px;
}

.info-note p {
  margin: 0;
  font-size: 14px;
  color: #2e7d32;
}

.loading-preview,
.preview-error {
  text-align: center;
  padding: 40px 20px;
}

.preview-error p {
  color: #dc3545;
}

.preview-table-wrapper {
  overflow-x: auto;
}

.preview-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 14px;
}

.preview-table th {
  background: #f8f9fa;
  padding: 10px 12px;
  text-align: left;
  border-bottom: 2px solid #dee2e6;
  font-weight: 600;
}

.preview-table td {
  padding: 10px 12px;
  border-bottom: 1px solid #f0f0f0;
}

.grouped-badge {
  background: #6f42c1;
  color: white;
  padding: 1px 6px;
  border-radius: 8px;
  font-size: 10px;
  margin-left: 6px;
}

.preview-summary {
  margin-top: 12px;
  padding: 12px;
  background: #f8f9fa;
  border-radius: 4px;
}

.preview-summary p {
  margin: 0;
  font-size: 14px;
  font-weight: 500;
}

.submit-success {
  text-align: center;
  padding: 40px 20px;
}

.success-icon {
  font-size: 48px;
  color: #28a745;
  margin-bottom: 16px;
}

.submit-success p {
  font-size: 16px;
  margin-bottom: 16px;
}

.wizard-footer {
  display: flex;
  align-items: center;
  padding: 16px 24px;
  border-top: 1px solid #dee2e6;
  gap: 12px;
}

.footer-spacer {
  flex: 1;
}

.btn {
  padding: 8px 20px;
  border-radius: 4px;
  border: none;
  cursor: pointer;
  font-size: 14px;
  font-weight: 500;
}

.btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.btn-primary {
  background: #2c9316;
  color: white;
}

.btn-primary:hover:not(:disabled) {
  background: #1e6b0f;
}

.btn-secondary {
  background: #6c757d;
  color: white;
}

.btn-secondary:hover:not(:disabled) {
  background: #545b62;
}

.btn-success {
  background: #28a745;
  color: white;
}

.btn-success:hover:not(:disabled) {
  background: #218838;
}
</style>
