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
        <ul class="nav nav-tabs">
          <li class="nav-item" v-for="tab in tabs" :key="tab.name">
            <a
              class="nav-link"
              :class="{ active: activeTab === tab.component }"
              @click.prevent="activeTab = tab.component"
              href="#"
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

export default {
  name: 'StudentDetails',
  components: {
    GeneralTab,
    StudyPlanTab,
    PermissionsTab,
    DocumentsTab,
    CourseArchiveTab,
    AplTab,
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
      const allTabs = [
        { name: 'Allmänt', component: GeneralTab },
        { name: 'Studieplan', component: StudyPlanTab },
        { name: 'Dokument', component: DocumentsTab },
        { name: 'Kursarkiv', component: CourseArchiveTab },
      ];

      // Conditionally add APL tab
      // Show APL tab if student has CoursePackage in education OR is manually added to APL
      // OR has an aplStatusHistory (indicating they've been in APL system)
      if (student.value) {
        const studentId = String(student.value._id);
        
        // Check if student has CoursePackage in education
        // Check both direct type and nested structures
        const hasCoursePackage = student.value.education && 
          Array.isArray(student.value.education) &&
          student.value.education.some(e => {
            // Check direct type
            if (e.type === 'CoursePackage') return true;
            // Check if refId is a CoursePackage (populated)
            if (e.refId && (e.refId.coursePackageName || e.refId.coursePackageCode)) return true;
            // Check if there's a coursePackageId field
            if (e.coursePackageId) return true;
            return false;
          });
        
        // Check if student is manually added to APL (using reactive ref)
        // Normalize all IDs to strings for comparison
        const normalizedManualIds = new Set(Array.from(manualAplIds.value).map(id => String(id)));
        const isManuallyAdded = normalizedManualIds.has(studentId);
        
        // Also check localStorage directly as a fallback (in case reactive ref hasn't updated)
        let isManuallyAddedDirect = false;
        try {
          const raw = localStorage.getItem('manualAplIds');
          if (raw) {
            const arr = JSON.parse(raw);
            const ids = Array.isArray(arr) ? arr.map(String) : [];
            isManuallyAddedDirect = ids.includes(studentId);
          }
        } catch (e) {
          // Ignore errors
        }
        
        // Use either check
        const isManuallyAddedFinal = isManuallyAdded || isManuallyAddedDirect;
        
        // Check if student has APL status history (indicates they've been in APL system)
        const hasAplHistory = student.value.aplStatusHistory && 
          Array.isArray(student.value.aplStatusHistory) && 
          student.value.aplStatusHistory.length > 0;
        
        // Check if student has a non-default APL status (not just the default GRAY)
        // If they have status history, they've been actively managed in APL
        const hasActiveAplStatus = hasAplHistory || 
          (student.value.aplStatus && student.value.aplStatus !== 'GRAY');
        
        // Debug logging with detailed education structure
        const educationDetails = student.value.education?.map(e => ({
          type: e.type,
          hasRefId: !!e.refId,
          refIdType: e.refId?.constructor?.name,
          refIdKeys: e.refId ? Object.keys(e.refId) : [],
          coursePackageId: e.coursePackageId,
          allKeys: Object.keys(e || {}),
        })) || [];
        
        console.log('[APL Tab Check]', {
          studentName: student.value.name,
          studentId: studentId,
          studentIdType: typeof studentId,
          hasCoursePackage,
          isManuallyAdded,
          isManuallyAddedDirect,
          isManuallyAddedFinal,
          hasAplHistory,
          aplStatus: student.value.aplStatus,
          manualAplIdsRaw: Array.from(manualAplIds.value),
          manualAplIdsNormalized: Array.from(normalizedManualIds),
          educationCount: student.value.education?.length || 0,
          educationDetails,
          fullEducation: JSON.stringify(student.value.education, null, 2),
        });

        // Show APL tab if any condition is met:
        // 1. Has CoursePackage in education
        // 2. Is manually added to APL (check both reactive ref and direct localStorage)
        // 3. Has APL status history (been actively managed in APL)
        // 4. Has an aplStatus set AND is not a dropout
        //    Note: If student appears in APL board, they should have the tab.
        //    Since all students have default GRAY status, we use this as a fallback
        //    to ensure students visible in APL board have the tab.
        const hasAplStatusSet = student.value.aplStatus && 
          student.value.aplStatus !== null && 
          student.value.aplStatus !== undefined &&
          !student.value.dropout;
        
        const shouldShowAplTab = hasCoursePackage || 
          isManuallyAddedFinal || 
          hasAplHistory ||
          hasAplStatusSet;
        
        if (shouldShowAplTab) {
          const reason = hasCoursePackage ? 'has CoursePackage' : 
                        isManuallyAddedFinal ? 'manually added' : 
                        hasAplHistory ? 'has APL history' :
                        'has APL status set';
          console.log(`[APL Tab] ✅ Showing APL tab for ${student.value.name}`, { reason });
          allTabs.push({ name: 'APL', component: AplTab });
        } else {
          // Expanded logging to help debug why tab isn't showing
          console.log(`[APL Tab] ❌ NOT showing APL tab for ${student.value.name}`);
          console.log(`[APL Tab Debug] Full check details:`, {
            studentId,
            hasCoursePackage,
            isManuallyAdded,
            isManuallyAddedDirect,
            isManuallyAddedFinal,
            hasAplHistory,
            aplStatus: student.value.aplStatus,
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
      loadStudent();
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