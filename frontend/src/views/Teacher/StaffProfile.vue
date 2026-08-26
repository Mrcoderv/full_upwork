<template>
  <div class="scrollable-view">
    <div class="container mt-4">
      <div class="header-section">
        <h1 class="page-title">{{ teacher ? teacher.user?.username || 'Personalprofil' : 'Personalprofil' }}</h1>
      </div>

      <div v-if="loading" class="loading">
        <div class="spinner"></div>
        <p>Laddar personalinformation...</p>
      </div>

      <div v-else-if="error" class="error-message">
        <p>{{ error }}</p>
      </div>

      <div v-else-if="teacher">
        <ul class="nav nav-tabs">
          <li v-for="tab in tabs" :key="tab.name" class="nav-item">
            <a
              class="nav-link"
              :class="{ active: activeTab === tab.component }"
              href="#"
              @click.prevent="activeTab = tab.component"
            >
              {{ tab.name }}
            </a>
          </li>
        </ul>

        <div class="tab-content">
          <keep-alive>
            <component
              :is="activeTab"
              :teacher="teacher"
              :active-courses="activeCourses"
              :completed-courses="completedCourses"
              :total-students="totalStudents"
              @teacher-updated="fetchProfile"
            />
          </keep-alive>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import { ref, computed, onMounted, shallowRef } from 'vue';
import { useRoute } from 'vue-router';
import { useStore } from 'vuex';
import client from '@/api/client.js';

import StaffGeneralTab from './Tabs/StaffGeneralTab.vue';
import StaffCoursesTab from './Tabs/StaffCoursesTab.vue';
import StaffStudentsTab from './Tabs/StaffStudentsTab.vue';
import StaffDocumentsTab from './Tabs/StaffDocumentsTab.vue';

export default {
  name: 'StaffProfile',
  components: {
    StaffGeneralTab,
    StaffCoursesTab,
    StaffStudentsTab,
    StaffDocumentsTab,
  },
  setup() {
    const route = useRoute();
    const store = useStore();
    const loading = ref(true);
    const error = ref(null);
    const teacher = ref(null);
    const activeCourses = ref([]);
    const completedCourses = ref([]);
    const totalStudents = ref(0);
    const activeTab = shallowRef(StaffGeneralTab);

    const userRoles = computed(() => store.getters.userRoles || []);
    const isStaff = computed(() => userRoles.value.some(r => ['teacher', 'admin', 'systemadmin', 'coordinator', 'syv', 'specped'].includes(r)));

    const tabs = [
      { name: 'Allmänt', component: StaffGeneralTab },
      { name: 'Kurser', component: StaffCoursesTab },
      { name: 'Elever', component: StaffStudentsTab },
      { name: 'Filarkiv', component: StaffDocumentsTab },
    ];

    const fetchProfile = async () => {
      loading.value = true;
      error.value = null;
      try {
        const teacherId = route.params.id;
        const response = await client.get(`/teachers/${teacherId}/profile`);
        teacher.value = response.data.teacher;
        activeCourses.value = response.data.activeCourses;
        completedCourses.value = response.data.completedCourses;
        totalStudents.value = response.data.totalStudents;
      } catch (err) {
        console.error('Error fetching staff profile:', err);
        error.value = 'Kunde inte ladda personalinformation.';
      } finally {
        loading.value = false;
      }
    };

    onMounted(() => {
      fetchProfile();
    });

    return {
      loading,
      error,
      teacher,
      activeCourses,
      completedCourses,
      totalStudents,
      activeTab,
      tabs,
      isStaff,
      fetchProfile,
    };
  },
};
</script>

<style scoped>
.header-section {
  margin-bottom: 20px;
}

.page-title {
  font-size: 1.6rem;
  color: #2c3e50;
}

.nav-tabs {
  border-bottom: 2px solid #dee2e6;
  margin-bottom: 16px;
}

.nav-link {
  padding: 10px 20px;
  cursor: pointer;
  font-weight: 500;
  color: #495057;
  border: none;
}

.nav-link.active {
  color: #007bff;
  border-bottom: 2px solid #007bff;
}

.loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 40px;
}

.spinner {
  width: 40px;
  height: 40px;
  border: 4px solid #f3f3f3;
  border-top: 4px solid #007bff;
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

.error-message {
  padding: 20px;
  background: #f8d7da;
  border-radius: 4px;
  color: #721c24;
}
</style>
