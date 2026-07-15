<!-- DocumentSection.vue -->
<template>
  <div class="document-section">
    <div v-if="!isStudent && !isTeacher" class="not-available-message">
      <p>Dokumenthantering är endast tillgänglig för elever och lärare.</p>
    </div>
    <div v-else>
      <div v-if="canUpload" class="upload-section">
        <form @submit.prevent="uploadFile">
          <input type="file" @change="handleFileChange" />
          <button type="submit" :disabled="!selectedFile">Ladda upp</button>
        </form>
      </div>

      <div v-if="documents.length" class="documents-list">
        <ul>
          <li v-for="doc in documents" :key="doc._id" class="document-item">
            <a :href="`${baseURL}/uploads/${doc.filename}`" target="_blank" class="document-link">
              {{ doc.originalName }}
            </a>
            <span v-if="doc.uploadedBy && doc.uploadedBy !== entityId" class="uploaded-by">
              (uppladdad av admin)
            </span>
            <button v-if="canDelete(doc)" @click="deleteFile(doc._id)" class="delete-btn">🗑️</button>
          </li>
        </ul>
      </div>

      <p v-else class="no-documents">Inga dokument uppladdade än.</p>
    </div>
  </div>
</template>

<script>
import { ref, watch, onMounted, computed } from 'vue';
import { api } from '@/store/store.js';
import { useStore } from 'vuex';

export default {
  props: {
    student: {
      type: Object,
      required: false,
    },
    userData: {
      type: Object,
      required: false,
    },
    userType: {
      type: String,
      default: null,
    },
    type: {
      type: String,
      default: 'GENERAL',
    },
    enrollmentId: {
      type: String,
      default: null,
    },
  },
  setup(props) {
    const store = useStore();
    const documents = ref([]);
    const selectedFile = ref(null);
    const baseURL = import.meta.env.VITE_API_URL || 'http://localhost:5001';

    // Determine if this is a student
    const isStudent = computed(() => {
      if (props.student) return true;
      if (props.userData && (props.userType === 'Elev' || props.userType === 'student')) return true;
      return false;
    });

    // Determine if this is a teacher
    const isTeacher = computed(() => {
      if (props.userData && (props.userType === 'Lärare' || props.userType === 'teacher')) return true;
      return false;
    });

    // Get the entity ID (student or teacher)
    const entityId = computed(() => {
      if (props.student?._id) return props.student._id;
      if (props.userData && (props.userType === 'Elev' || props.userType === 'student')) {
        return props.userData._id;
      }
      if (props.userData && (props.userType === 'Lärare' || props.userType === 'teacher')) {
        return props.userData._id;
      }
      return null;
    });

    // Get current user info
    const currentUser = computed(() => store.state.user);
    const isAdmin = computed(() => store.getters.isAdmin);
    const canUpload = computed(() => {
      // Admins/systemadmins can upload for any student or teacher
      if (isAdmin.value) return true;
      
      if (isStudent.value) {
        // Students can upload for themselves
        return currentUser.value?.userId === entityId.value;
      }
      
      if (isTeacher.value) {
        // Teachers can upload for themselves
        return currentUser.value?.userId === entityId.value;
      }
      
      return false;
    });

    const canDelete = (doc) => {
      // Admins can delete any document
      if (isAdmin.value) return true;
      // Users can delete documents they uploaded
      if (doc.uploadedBy && currentUser.value?.userId === doc.uploadedBy.toString()) return true;
      // Teachers can delete their own documents
      if (isTeacher.value && currentUser.value?.userId === entityId.value) return true;
      return false;
    };

    const fetchDocuments = async () => {
      const id = entityId.value;
      if (!id) return;
      try {
        const params = { type: props.type };
        if (props.enrollmentId) {
          params.enrollmentId = props.enrollmentId;
        }
        // Add entityType for teacher documents
        if (isTeacher.value) {
          params.entityType = 'teacher';
        }
        const res = await api.get(`/documents/${id}`, { params });
        documents.value = res.data;
      } catch (error) {
        console.error('Error fetching documents:', error);
      }
    };

    const handleFileChange = (e) => {
      selectedFile.value = e.target.files[0];
    };

    const uploadFile = async () => {
      const id = entityId.value;
      if (!selectedFile.value || !id) {
        alert('Välj en fil och kontrollera att användar-ID är korrekt');
        return;
      }

      console.log('Uploading file for:', {
        isStudent: isStudent.value,
        isTeacher: isTeacher.value,
        entityId: id,
        fileName: selectedFile.value.name
      });

      const formData = new FormData();
      formData.append('file', selectedFile.value);
      
      if (isStudent.value) {
        formData.append('studentId', id);
        console.log('Appending studentId:', id);
      } else if (isTeacher.value) {
        formData.append('teacherId', id);
        console.log('Appending teacherId:', id);
      }
      
      formData.append('type', props.type);
      if (props.enrollmentId) {
        formData.append('enrollmentId', props.enrollmentId);
      }

      try {
        const response = await api.post('/documents/upload', formData, {
          headers: {
            'Content-Type': 'multipart/form-data',
          },
        });
        console.log('Upload successful:', response.data);
        selectedFile.value = null;
        // Reset file input
        const inputFile = document.querySelector('input[type="file"]');
        if(inputFile) inputFile.value = '';

        await fetchDocuments();
        alert('✅ Filen laddades upp framgångsrikt!');
      } catch (error) {
        console.error('Error uploading file:', error);
        console.error('Error response:', error.response?.data);
        const errorMessage = error.response?.data?.message || error.response?.data?.error || error.message;
        alert('⚠️ Kunde inte ladda upp filen: ' + errorMessage);
      }
    };

    const deleteFile = async (id) => {
      if (!confirm('Är du säker på att du vill radera detta dokument?')) return;
      try {
        await api.delete(`/documents/${id}`);
        await fetchDocuments();
      } catch (error) {
        console.error('Error deleting document:', error);
        alert('Kunde inte radera dokumentet: ' + (error.response?.data?.message || error.message));
      }
    };

    onMounted(() => {
      if (isStudent.value || isTeacher.value) {
        fetchDocuments();
      }
    });
    
    watch(() => [entityId.value, props.type, props.enrollmentId], () => {
      if (isStudent.value || isTeacher.value) {
        fetchDocuments();
      }
    });

    return {
      documents,
      selectedFile,
      isStudent,
      isTeacher,
      entityId,
      canUpload,
      canDelete,
      handleFileChange,
      uploadFile,
      deleteFile,
      baseURL,
    };
  },
};
</script>

<style scoped>
.document-section {
  padding: 20px;
}

.upload-section {
  margin-bottom: 20px;
  padding: 15px;
  background: #f8f9fa;
  border-radius: 8px;
}

.upload-section form {
  display: flex;
  gap: 10px;
  align-items: center;
}

.upload-section input[type="file"] {
  flex: 1;
  padding: 8px;
  border: 1px solid #ddd;
  border-radius: 4px;
}

.upload-section button {
  padding: 8px 16px;
  background: #1976d2;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-weight: 500;
}

.upload-section button:hover:not(:disabled) {
  background: #1565c0;
}

.upload-section button:disabled {
  background: #ccc;
  cursor: not-allowed;
}

.documents-list {
  margin-top: 20px;
}

.documents-list ul {
  list-style: none;
  padding: 0;
  margin: 0;
}

.document-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px;
  margin-bottom: 8px;
  background: white;
  border: 1px solid #e0e0e0;
  border-radius: 6px;
  transition: all 0.2s;
}

.document-item:hover {
  background: #f5f5f5;
  border-color: #1976d2;
}

.document-link {
  flex: 1;
  color: #1976d2;
  text-decoration: none;
  font-weight: 500;
}

.document-link:hover {
  text-decoration: underline;
}

.uploaded-by {
  color: #666;
  font-size: 12px;
  font-style: italic;
}

.delete-btn {
  background: none;
  border: none;
  cursor: pointer;
  font-size: 18px;
  padding: 4px 8px;
  transition: transform 0.2s;
}

.delete-btn:hover {
  transform: scale(1.2);
}

.no-documents {
  padding: 20px;
  text-align: center;
  color: #999;
  font-style: italic;
}

.not-available-message {
  padding: 20px;
  text-align: center;
  color: #666;
}

.not-available-message p {
  margin: 0;
  font-size: 16px;
}
</style>