<template>
  <v-card class="ma-4">
    <v-card-title>
      APL Kontrakt Arkiv
      <v-spacer></v-spacer>
      <v-btn 
        v-if="isAdmin" 
        color="error" 
        small 
        @click="cleanupOrphanedFiles" 
        :loading="cleaningUp"
        title="Ta bort filer för borttagna elever (Admin endast)"
        class="mr-2"
      >
        <v-icon left>mdi-delete-sweep</v-icon>
        Rensa borttagna
      </v-btn>
      <v-btn icon @click="fetchAllFiles" title="Uppdatera lista">
        <v-icon>mdi-refresh</v-icon>
      </v-btn>
      <v-text-field
        v-model="search"
        append-icon="mdi-magnify"
        label="Sök student"
        single-line
        hide-details
        clearable
        class="ml-4"
      ></v-text-field>
    </v-card-title>
    <v-list>
      <v-list-group v-for="student in filteredStudents" :key="student.studentId">
        <template v-slot:activator="{ props }">
          <v-list-item v-bind="props" :title="student.studentName"></v-list-item>
        </template>
        <v-list-item v-for="file in student.files" :key="file._id">
            <v-list-item-title>{{ file.filename }}</v-list-item-title>
            <v-list-item-subtitle>
              Uppladdad: {{ formatDate(file.uploadDate) }}
            </v-list-item-subtitle>
            <template v-slot:append>
                <v-btn icon flat @click="downloadFile(file._id, file.filename)">
                    <v-icon>mdi-download</v-icon>
                </v-btn>
            </template>
        </v-list-item>
      </v-list-group>
    </v-list>
    <div v-if="loading" class="text-center pa-4">Laddar filer...</div>
    <div v-if="!loading && !filteredStudents.length && !search" class="text-center pa-4">
      Inga filer hittades. Ladda upp filer via studentens profil.
    </div>
    <div v-if="!loading && !filteredStudents.length && search" class="text-center pa-4">
      Inga studenter matchade sökningen "{{ search }}".
    </div>
  </v-card>
</template>

<script setup>
import { ref, onMounted, computed } from 'vue';
import { useStore } from 'vuex';
import client from '@/api/client.js';
import { useToast } from '@/composables/useToast.js';

const toast = useToast();
const store = useStore();
const studentsWithFiles = ref([]);
const loading = ref(true);
const cleaningUp = ref(false);
const search = ref('');

const isAdmin = computed(() => {
  const role = store.getters.userRole || store.state.user?.role;
  return role === 'admin' || role === 'systemadmin';
});

const handleSearchInput = () => {
  // Force reactivity update
  // The computed property will automatically update, but this ensures the UI refreshes
};

const fetchAllFiles = async () => {
  loading.value = true;
  try {
    const { data } = await client.get('/uploads/all/apl');
    console.log(`✅ Fetched ${data?.length || 0} students with APL files:`, data);
    studentsWithFiles.value = data || [];
  } catch (err) {
    console.error('❌ Failed to fetch all APL files:', err);
    toast.error('Kunde inte ladda filer. Kontrollera konsolen för mer information.');
    studentsWithFiles.value = [];
  } finally {
    loading.value = false;
  }
};

const filteredStudents = computed(() => {
  if (!search.value || !search.value.trim()) {
    return studentsWithFiles.value;
  }
  
  const searchTerm = search.value.toLowerCase().trim();
  
  return studentsWithFiles.value.filter(s => {
    if (!s.studentName) return false;
    
    const studentName = s.studentName.toLowerCase();
    
    // Direct match
    if (studentName.includes(searchTerm)) {
      return true;
    }
    
    // Split search term into words and check if all words appear in the name
    const searchWords = searchTerm.split(/\s+/).filter(w => w.length > 0);
    if (searchWords.length > 1) {
      // If multiple words, check if all words appear (in any order)
      return searchWords.every(word => studentName.includes(word));
    }
    
    // Also try splitting the student name and matching individual parts
    const nameParts = studentName.split(/[\s,]+/).filter(p => p.length > 0);
    return nameParts.some(part => part.includes(searchTerm)) || 
           searchWords.some(word => nameParts.some(part => part.includes(word)));
  });
});

const downloadFile = async (fileId, filename) => {
    try {
        const res = await client.get(`/uploads/download/${fileId}`, {
            responseType: 'blob',
        });
        const blobUrl = window.URL.createObjectURL(res.data);
        const link = document.createElement('a');
        link.href = blobUrl;
        link.setAttribute('download', filename);
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.URL.revokeObjectURL(blobUrl);
    } catch (error) {
        console.error('Download failed:', error);
        toast.error('Failed to download file.');
    }
};

const formatDate = (dateStr) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString() + ' ' + d.toLocaleTimeString();
};

const cleanupOrphanedFiles = async () => {
  if (!confirm('Är du säker på att du vill ta bort alla filer för borttagna elever? Detta går inte att ångra.')) {
    return;
  }
  
  cleaningUp.value = true;
  try {
    const { data } = await client.delete('/uploads/cleanup/orphaned');
    console.log('✅ Cleanup result:', data);
    
    const message = `Rensning klar!\n` +
      `Totalt kontrollerade filer: ${data.totalFilesChecked}\n` +
      `Hittade föräldralösa filer: ${data.orphanedFilesFound}\n` +
      `Raderade filer: ${data.filesDeleted}`;
    
    toast.success(message);
    
    // Refresh the file list
    await fetchAllFiles();
  } catch (err) {
    console.error('❌ Failed to cleanup orphaned files:', err);
    const errorMsg = err.message || 'Okänt fel';
    toast.error(`Kunde inte rensa filer: ${errorMsg}`);
  } finally {
    cleaningUp.value = false;
  }
};

onMounted(fetchAllFiles);
</script>
