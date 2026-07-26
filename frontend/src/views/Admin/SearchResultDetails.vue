<template>
  <div class="scrollable-view">
    <div class="name-container">  
      Användarinformation: {{ data?.name }}
    </div>
    <section class="tab-container">
      <div class="tab-menu">

        <ul>
          <li 
            v-for="tab in tabs" 
            :key="tab" 
            @click="activeTab = tab" 
            :class="{ active: activeTab === tab }"
          >
            {{ tab }}
          </li>
        </ul>
      </div>
      <div class="content">
        <component :is="currentComponent" :userData="data" :userType="type"></component>
      </div>
    </section>
  </div>
</template>

<script>
import { ref, onMounted, computed, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import client from "@/api/client.js";
import { useToast } from "@/composables/useToast.js";
import AccountTab from "@/views/Admin/SearchTabs/AccountTab.vue";
import StudyPlan from "@/views/Admin/SearchTabs/StudyPlan.vue";
import DocumentSection from "@/views/Admin/SearchTabs/DocumentSection.vue";
import ActionPlanTab from "@/views/Admin/SearchTabs/ActionPlanTab.vue";
import StudentsTab from "@/views/Admin/SearchTabs/StudentsTab.vue";
import CoursesTab from "@/views/Admin/SearchTabs/CoursesTab.vue";


export default {
  components: { AccountTab, StudyPlan, DocumentSection, StudentsTab, CoursesTab },
  setup() {
    const route = useRoute();
    const router = useRouter();
    const toast = useToast();
    const data = ref(null);
    const activeTab = ref("Användare");

    const tabs = computed(() => {
      const isTeacher = route.params.type === 'Lärare' || route.params.type === 'teacher';
      
      // For teachers: Användare, Kurser, Dokument, Elever
      if (isTeacher) {
        const teacherTabs = ["Användare", "Kurser", "Dokument", "Elever"];
        return teacherTabs;
      }
      
      // For students: Användare, Studieplan, Dokument, Handlingsplan (if needed)
      const baseTabs = ["Användare", "Studieplan", "Dokument"];
      const hasLockedF = data.value?.education?.some(
        edu => edu.grade === 'F' && edu.locked === true
      );

      if (hasLockedF) {
        baseTabs.push("Handlingsplan");
      }

      return baseTabs;
    });
    const fetchData = async () => {
      const { type, id } = route.params;
      console.log("🔍 Requesting details for:", type, id);

      try {
        const response = await client.get(`/details/${type}/${id}`);
        data.value = response.data;
        console.log("✅ Data received:", response.data);
      } catch (error) {
        console.error("❌ Error fetching data:", error);
        console.error("❌ Error response:", error.response?.data);
        console.error("❌ Error status:", error.response?.status);
      }
    };

    onMounted(() => {
      // Redirect Elev/Student type to student view
      if (route.params.type === 'Elev' || route.params.type === 'Student') {
        router.replace({
          path: `/student/${route.params.id}`,
          query: route.query
        });
        return;
      }
      
      // Redirect Kursinstans/CourseInstance type to education view
      if (route.params.type === 'Kursinstans' || route.params.type === 'CourseInstance') {
        router.replace({
          path: `/education/${route.params.id}`,
          query: { ...route.query, type: 'instance' }
        });
        return;
      }
      
      fetchData().then(() => {
        if (route.query.showActionPlan === 'true') {
          activeTab.value = "Handlingsplan"
        }
      });
    });

    // Watch för att uppdatera datan när route ändras
    watch(() => route.params, (newParams) => {
      // Redirect Elev/Student type to student view
      if (newParams.type === 'Elev' || newParams.type === 'Student') {
        router.replace({
          path: `/student/${newParams.id}`,
          query: route.query
        });
        return;
      }
      
      // Redirect Kursinstans/CourseInstance type to education view
      if (newParams.type === 'Kursinstans' || newParams.type === 'CourseInstance') {
        router.replace({
          path: `/education/${newParams.id}`,
          query: { ...route.query, type: 'instance' }
        });
        return;
      }
      
      fetchData();
    }, { deep: true });



    const currentComponent = computed(() => {
      switch (activeTab.value) {
        case "Studieplan": return StudyPlan;
        case "Dokument": return DocumentSection;
        case "Handlingsplan": return ActionPlanTab;
        case "Elever": return StudentsTab;
        case "Kurser": return CoursesTab;
        default: return AccountTab;
      }
    });


    return { data, activeTab, tabs, currentComponent, type: route.params.type };
  },
};
</script>

<style scoped>
.tab-container {
  padding: 20px;
  height: 70vh;
}

.tab-menu {
  display: flex;
  gap: 20px;
  padding-bottom: 10px;
}

.tab-menu ul {
  display: flex;
  list-style: none;
  padding: 0;
  margin: 0;
}

.tab-menu li {
  font-size: 18px;
  padding: 8px 16px;
  cursor: pointer;
  font-weight: bold;
  color: gray;
  transition: color 0.3s ease-in-out;
}

.tab-menu li.active {
  color: black;
  border-bottom: 3px solid black;
}

.content {
  margin-top: 20px;
  background: white;
  padding: 25px;
  border-radius: 15px;
  box-shadow: 0 4px 10px rgba(0, 0, 0, 0.1);
}

.name-container {
  font-size: 24px;
  font-weight: 600;
  padding: 40px;
  margin: 10px 0;
}

</style>
