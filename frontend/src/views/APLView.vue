<template>
  <div class="scrollable-view apl-view">
    <h1>APL-status</h1>
    <v-alert v-if="loadError" type="error" variant="tonal" class="mb-4">
      {{ loadError }}
    </v-alert>
    <v-tabs v-model="activeTab" grow>
      <v-tab value="ongoing">Pågående</v-tab>
      <v-tab value="completed">Avslutad</v-tab>
      <v-tab value="contracts">APL-kontrakt</v-tab>
    </v-tabs>
    <v-window v-model="activeTab">
      <v-window-item value="ongoing">
        <APLBoard v-if="students.length" :students="students" filter-type="active" @student-updated="fetchStudents" />
        <div v-else class="loading-text">Laddar pågående APL...</div>
      </v-window-item>
      <v-window-item value="completed">
        <AplCompletedTab />
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
import APLBoard from '../components/APLBoard.vue';
import APLFileArchive from '../components/APLFileArchive.vue';
import AplCompletedTab from './Admin/AplCompletedTab.vue';

const activeTab = ref('ongoing');
const students = ref([]);
const loadError = ref('');

const fetchStudents = async () => {
  loadError.value = '';
  try {
    const res = await client.get('/students');
    students.value = Array.isArray(res.data) ? res.data : [];
  } catch (err) {
    loadError.value = 'Kunde inte hämta APL-elever. Försök igen.';
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
.loading-text {
  text-align: center;
  padding: 40px;
  color: #6c757d;
}
</style>
