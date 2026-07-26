<template>
  <div class="scrollable-view">
    <h1>APL Status Board</h1>
    <v-tabs v-model="activeTab" grow>
      <v-tab value="ongoing">Pågående</v-tab>
      <v-tab value="completed">Avslutad</v-tab>
      <v-tab value="contracts">APL-kontrakt</v-tab>
    </v-tabs>
    <v-window v-model="activeTab">
      <v-window-item value="ongoing">
        <APLBoard v-if="students.length" :students="students" filter-type="active" @student-updated="fetchStudents" />
        <div v-else>Loading ongoing APL...</div>
      </v-window-item>
      <v-window-item value="completed">
        <APLBoard v-if="students.length" :students="students" filter-type="completed" @student-updated="fetchStudents" />
        <div v-else>Loading completed APL...</div>
      </v-window-item>
      <v-window-item value="contracts">
        <APLFileArchive />
      </v-window-item>
    </v-window>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import client from '@/api/client.js';
import { useToast } from '@/composables/useToast.js';
import APLBoard from '../components/APLBoard.vue';
import APLFileArchive from '../components/APLFileArchive.vue'; // To be created in Phase 4

const toast = useToast();
const activeTab = ref('ongoing');
const students = ref([]);

const fetchStudents = async () => {
  try {
    const res = await client.get('/students');
    students.value = res.data;
  } catch (err) {
    console.error('❌ Failed to fetch students in APLView:', err);
  }
};

onMounted(fetchStudents);
</script>

<style scoped>
.apl-view {
  padding: 24px;
}
h1 {
  margin-bottom: 16px;
}
</style>
