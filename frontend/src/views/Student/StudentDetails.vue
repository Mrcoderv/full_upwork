<template>
  <div class="scrollable-view">
    <div class="student-details-container">
      <div class="header-section">
        <h1 class="page-title">{{ student ? student.name : 'Elevdetaljer' }}</h1>
        <button
          v-if="isSystemAdmin"
          class="btn btn-danger delete-student-btn"
          @click="handleDeleteStudent"
        >
          DELETE STUDENT
        </button>
      </div>

      <div v-if="loading" class="loading">
        <div class="spinner"></div>
        <p>Laddar elevinformation...</p>
      </div>

      <div v-else-if="error" class="error-message">
        <p>{{ error }}</p>
      </div>

      <div v-else-if="student">
        <div v-if="student.dropout === true || student.dropout === 'true' || student.dropout === 1" class="inactive-banner">
          <h2>INAKTIV</h2>
          <p>Denna elev har markerats som avbrott (inaktiv).</p>
        </div>

        <!-- Certificate & Diploma Generation Section -->
        <div v-if="canGenerateCertificates" class="certificate-generation-section">
          <div class="card">
            <div class="card-header">
              <h3>Intyggande & Diploma</h3>
            </div>
            <div class="card-body">
              <div v-if="student.enrollments && student.enrollments.length > 0" class="generation-options">
                <!-- Study Certificate -->
                <div v-for="enrollment in student.enrollments" :key="enrollment._id" class="generation-option">
                  <div v-if="enrollment.status === 'completed'" class="option eligible">
                    <v-icon left>mdi-file-document</v-icon>
                    <span>Generera studieintyg</span>
                    <v-tooltip top>
                      <template #content>
                        Studieintyg genereras för slutförda kurser
                      </template>
                    </v-tooltip>
                  </div>
                  <div v-else class="option disabled">
                    <v-icon left>mdi-file-document-outline</v-icon>
                    <span>Kursen måste vara slutförd</span>
                  </div>
                </div>

                <!-- Diploma -->
                <div v-if="student.coursePackageId && student.aplStatus === 'GREEN'" class="generation-option">
                  <v-icon left>mdi-medal</v-icon>
                  <span>Generera diplom</span>
                  <v-tooltip top>
                    <template #content>
                      Diplom genereras när alla kurser och APL är godkända efter kursens slutdatum
                    </template>
                  </v-tooltip>
                </div>
              </div>

              <div v-if="student.enrollments.length === 0" class="no-enrollments">
                Inga kurser inlagda ännu
              </div>
            </div>
          </div>
        </div>

        <ul class="nav nav-tabs">
          <li class="nav-item" v-for="tab in tabs" :key="tab.name">
            <a
              class="nav-link"
              :class="{ active: activeTab === tab.component }"
              @click.prevent="activeTab = tab.component"
              href="#"
              :title="tab.description || tab.name"
            >
              {{ tab.name }}
            </a>
          </li>
        </ul>

        <div class="tab-content">
          <keep-alive>
            <component
              :is="activeTab"
              :student="student"
              :userData="student"
              :changeHistory="changeHistory"
              @student-updated="handleStudentUpdate"
            />
          </keep-alive>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import { ref, onMounted, onUnmounted, computed, shallowRef, watch } from 'vue';
import { useRoute } from 'vue-router';
import { useStore } from 'vuex';
import client from '@/api/client.js'
import { useToast } from '@/composables/useToast.js'

import GeneralTab from './tabs/GeneralTab.vue';
import StudyPlanTab from './tabs/StudyPlanTab.vue';
import PermissionsTab from './tabs/PermissionsTab.vue';
import DocumentsTab from './tabs/DocumentsTab.vue';
import CourseArchiveTab from './tabs/CourseArchiveTab.vue';
import AplTab from './tabs/AplTab.vue';
import LogbookTab from './tabs/LogbookTab.vue';
import ActionPlanTab from '../Admin/SearchTabs/ActionPlanTab.vue';

export default {
  name: 'StudentDetails',
  components: {
    GeneralTab,
    StudyPlanTab,
    PermissionsTab,
    DocumentsTab,
    CourseArchiveTab,
    AplTab,
    LogbookTab,
    ActionPlanTab,
  },
  setup() {
    const route = useRoute();
    const store = useStore();
    const toast = useToast();
    const student = ref(null);
    const loading = ref(true);
    const error = ref(null);
    const changeHistory = ref([]);
    const activeTab = shallowRef(GeneralTab);
    const manualAplIds = ref(new Set());

    const isAdmin = computed(() => store.getters.isAdmin);
    const isSystemAdmin = computed(
      () => store.getters.isSystemAdmin || store.getters.isAdmin
    );

    // Load manual APL IDs from localStorage (reactive)
    const loadManualAplIds = () => {
      try {
        const raw = localStorage.getItem('manualAplIds');
        if (raw) {
          const arr = JSON.parse(raw);
          manualAplIds.value = new Set(Array.isArray(arr) ? arr.map(String) : []);
        } else {
          manualAplIds.value = new Set();
        }
      } catch (e) {
        console.error('Error reading manualAplIds from localStorage:', e);
        manualAplIds.value = new Set();
      }
    };

    // Listen for storage changes to update manualAplIds reactively
    const handleStorageChange = (e) => {
      if (e.key === 'manualAplIds') {
        loadManualAplIds();
      }
    };

    const tabs = computed(() => {
      const studentId = String(student.value?._id || '');

      const allTabs = [
        { name: 'Allmänt', component: GeneralTab, alwaysShow: true, description: 'Elevens grundinformation och kontaktuppgifter' },
        { name: 'Studieplan', component: StudyPlanTab, alwaysShow: true, description: 'Kurser, perioder och studieuppehåll' },
        { name: 'Kursarkiv', component: CourseArchiveTab, alwaysShow: true, description: 'Historik över genomförda kurser' },
      ];

      // Conditionally show APL tab - work placement
      if (student.value) {
        const hasCoursePackage = student.value.education && 
          Array.isArray(student.value.education) &&
          student.value.education.some(e => 
            e.type === 'CoursePackage' || 
            (e.refId && (e.refId.coursePackageName || e.refId.coursePackageCode)) || 
            e.coursePackageId
          );

        const hasActiveApplStatus = student.value.aplStatus && 
          student.value.aplStatus !== 'GRAY' && 
          !student.value.dropout;

        const hasAplHistory = student.value.aplStatusHistory && 
          Array.isArray(student.value.aplStatusHistory) && 
          student.value.aplStatusHistory.length > 0;

        const isManuallyAdded = manualAplIds.value.has(studentId);

        // Show APL tab if any condition is met
        const showAplTab = hasCoursePackage || isManuallyAdded || hasAplHistory || hasActiveApplStatus;

        if (showAplTab) {
          let apReason = '';
          if (hasCoursePackage) apReason = 'har CoursePackage i utbildningen';
          else if (isManuallyAdded) apReason = 'är manuellt kopplad till APL';
          else if (hasAplHistory) apReason = 'har APL-historia';
          else if (hasActiveApplStatus) apReason = 'har aktiv APL-status';

          allTabs.push({
            name: 'APL',
            component: AplTab,
            alwaysShow: false,
            description: apReason,
          });
        }
      }

      // Conditionally show Action Plan tab
      if (student.value) {
        const hasApCoursePackage = student.value.education && 
          Array.isArray(student.value.education) &&
          student.value.education.some(e => 
            e.type === 'CoursePackage' || 
            (e.refId && (e.refId.coursePackageName || e.refId.coursePackageCode)) || 
            e.coursePackageId
          );

        if (hasApCoursePackage) {
          allTabs.push({
            name: 'Handlingsplan',
            component: ActionPlanTab,
            alwaysShow: false,
            description: 'APL-åtgärdsplan och mål',
          });
        }
      }

      // Conditionally show Documents tab
      if (student.value && student.value.enrollments && student.value.enrollments.length > 0) {
        const hasCompleted = student.value.enrollments.some(e => e.status === 'completed');
        if (hasCompleted) {
          allTabs.push({
            name: 'Dokument',
            component: DocumentsTab,
            alwaysShow: false,
            description: 'Genererade intygg och diplom',
          });
        }
      }

      return allTabs;
    });
            dropout: student.value.dropout,
            manualAplIdsCount: manualAplIds.value.size,
            manualAplIdsList: Array.from(manualAplIds.value),
            normalizedManualIdsList: Array.from(normalizedManualIds),
            localStorageCheck: (() => {
              try {
                const raw = localStorage.getItem('manualAplIds');
                if (raw) {
                  const arr = JSON.parse(raw);
                  return Array.isArray(arr) ? arr.map(String) : [];
                }
                return [];
              } catch {
                return [];
              }
            })(),
            educationArray: JSON.stringify(student.value.education, null, 2),
          });
        }

        // Show the Logbook tab for APL-managed students or when logbook entries already exist
        const hasLogbookEntries =
          Array.isArray(student.value.logbook) && student.value.logbook.length > 0;
        if (shouldShowAplTab || hasLogbookEntries) {
          allTabs.push({ name: 'Loggbok', component: LogbookTab });
        }
      }

      if (isAdmin.value) {
        allTabs.push({ name: 'Behörigheter', component: PermissionsTab });
      }

      return allTabs;
    });

    const loadStudent = async () => {
      try {
        loading.value = true;
        error.value = null;
        const response = await client.get(`/student-details/${route.params.id}`);
        student.value = response.data;
        if (isAdmin.value) {
          await loadChangeHistory();
        }
      } catch (err) {
        console.error('Error loading student:', err);
        error.value = 'Kunde inte ladda elevinformation';
      } finally {
        loading.value = false;
      }
    };

    const loadChangeHistory = async () => {
      try {
        const response = await client.get(`/student-details/${route.params.id}/history`);
        changeHistory.value = response.data.changeHistory;
      } catch (err) {
        console.error('Error loading change history:', err);
      }
    };

    const handleStudentUpdate = async (updatedStudent) => {
      console.log('🔄 Updating student data:', updatedStudent);
      console.log('🔄 updatedStudent.dropout:', updatedStudent.dropout);
      console.log('🔄 student.value.dropout before update:', student.value?.dropout);
      
      // Ensure dropout is explicitly set
      student.value = { 
        ...student.value, 
        ...updatedStudent,
        dropout: updatedStudent.dropout === true || updatedStudent.dropout === 'true'
      };
      
      console.log('✅ Updated student.value.dropout:', student.value.dropout);
      console.log('✅ student.value.dropout type:', typeof student.value.dropout);
      console.log('✅ Will show banner?', student.value.dropout === true);
      
      if (isAdmin.value) {
        await loadChangeHistory();
      }
    };

    // Watch for student changes and reload manualAplIds
    watch(() => student.value?._id, () => {
      loadManualAplIds();
    });

    // Watch for route changes to reload manualAplIds
    watch(() => route.params.id, () => {
      loadManualAplIds();
    });

    watch(() => route.query.showActionPlan, (val) => {
      if (val === 'true') {
        activeTab.value = ActionPlanTab;
      }
    });

    const handleDeleteStudent = async () => {
      if (!student.value?._id) return;
      const confirmed = window.confirm(
        'Är du säker på att du vill radera eleven? Detta går inte att ångra.'
      );
      if (!confirmed) return;

      try {
        await client.delete(`/student/${student.value._id}`);
        window.history.back();
      } catch (err) {
        console.error('Error deleting student:', err);
        toast.error('Kunde inte radera elev.');
      }
    };

    onMounted(() => {
      loadManualAplIds();
      loadStudent().then(() => {
        if (route.query.showActionPlan === 'true') {
          activeTab.value = ActionPlanTab;
        }
      });
      // Listen for storage changes (cross-tab)
      window.addEventListener('storage', handleStorageChange);
      
      // Also listen for custom events (same-tab updates from APL board)
      window.addEventListener('manualAplIdsUpdated', loadManualAplIds);
    });
    
    // Cleanup
    onUnmounted(() => {
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('manualAplIdsUpdated', loadManualAplIds);
    });

    return {
      student,
      loading,
      error,
      activeTab,
      tabs,
      changeHistory,
      handleStudentUpdate,
      isSystemAdmin,
      handleDeleteStudent,
    };
  },
};
</script>

<style scoped>
.student-details-container {
  padding: 20px;
  max-width: 1400px;
  margin: 0 auto;
}
.header-section {
  margin-bottom: 20px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.page-title {
  margin: 0;
  color: #2c3e50;
}
.delete-student-btn {
  font-weight: 700;
  letter-spacing: 0.5px;
}
.loading, .error-message {
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
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}
.nav-tabs {
  margin-bottom: 20px;
  border-bottom: 1px solid #dee2e6;
}
.nav-item {
    margin-bottom: -1px;
}
.nav-link {
    display: block;
    padding: 0.5rem 1rem;
    color: #007bff;
    text-decoration: none;
    background: none;
    border: 1px solid transparent;
    border-top-left-radius: 0.25rem;
    border-top-right-radius: 0.25rem;
}
.nav-link.active {
    color: #495057;
    background-color: #fff;
    border-color: #dee2e6 #dee2e6 #fff;
}
.tab-content {
  padding-top: 20px;
}
.inactive-banner {
  background-color: #dc3545;
  color: white;
  padding: 20px;
  margin-bottom: 20px;
  border-radius: 8px;
  text-align: center;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
}
.inactive-banner h2 {
  margin: 0 0 10px 0;
  font-size: 2rem;
  font-weight: bold;
  text-transform: uppercase;
}
.inactive-banner p {
  margin: 0;
  font-size: 1.1rem;
}
</style>