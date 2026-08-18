<template>
  <div class="staff-general-tab">
    <!-- Teacher Info Card -->
    <div class="card">
      <div class="card-header">
        <h3>Personalinformation</h3>
        <button
          v-if="isAdmin"
          @click="toggleEditMode"
          class="btn btn-sm"
          :class="editMode ? 'btn-secondary' : 'btn-primary'"
        >
          {{ editMode ? 'Avbryt' : 'Redigera' }}
        </button>
      </div>
      <div class="card-body">
        <div class="info-grid">
          <div class="info-item">
            <label>Namn:</label>
            <span>{{ teacher.user?.username || 'Ej angivet' }}</span>
          </div>
          <div class="info-item">
            <label>E-post:</label>
            <span>{{ teacher.user?.email || 'Ej angivet' }}</span>
          </div>
          <div class="info-item">
            <label>Roll:</label>
            <span>{{ getRoleLabel(teacher.user?.roles) }}</span>
          </div>
          <div class="info-item">
            <label>Ämne:</label>
            <input
              v-if="editMode && isAdmin"
              v-model="editData.subject"
              type="text"
              class="form-control"
              placeholder="T.ex. Svenska, Matematik..."
            />
            <span v-else>{{ teacher.subject || 'Ej angivet' }}</span>
          </div>
          <div class="info-item">
            <label>Telefonnummer:</label>
            <div v-if="editMode && isAdmin">
              <div v-for="(phone, idx) in editData.phoneNumbers" :key="idx" class="phone-input-row">
                <input
                  v-model="editData.phoneNumbers[idx]"
                  type="text"
                  class="form-control"
                  placeholder="070-123 45 67"
                />
                <button @click="removePhone(idx)" class="btn btn-sm btn-outline-danger">X</button>
              </div>
              <button @click="addPhone" class="btn btn-sm btn-outline-primary">+ Lägg till telefon</button>
            </div>
            <span v-else>{{ (teacher.phoneNumbers && teacher.phoneNumbers.length > 0) ? teacher.phoneNumbers.join(', ') : 'Ej angivet' }}</span>
          </div>
        </div>

        <div v-if="editMode && isAdmin" class="mt-3">
          <button @click="saveProfile" class="btn btn-primary" :disabled="saving">
            {{ saving ? 'Sparar...' : 'Spara ändringar' }}
          </button>
        </div>
      </div>
    </div>

    <!-- Vacation Card -->
    <div class="card mt-4">
      <div class="card-header">
        <h3>Semester / Ledighet</h3>
      </div>
      <div class="card-body">
        <div class="vacation-info">
          <div class="info-item">
            <label>Status:</label>
            <span v-if="teacher.user?.onVacation" class="badge badge-warning">På ledighet</span>
            <span v-else class="badge badge-success">Activ</span>
          </div>
          <div v-if="teacher.user?.onVacation" class="info-item">
            <label>Period:</label>
            <span>
              {{ formatDate(teacher.user?.vacationStart) }} — {{ formatDate(teacher.user?.vacationEnd) }}
            </span>
          </div>
          <div v-if="teacher.user?.onVacation && teacher.user?.vacationNote" class="info-item">
            <label>Anteckning:</label>
            <span>{{ teacher.user.vacationNote }}</span>
          </div>
        </div>

        <!-- Vacation Controls (admin only) -->
        <div v-if="isAdmin" class="mt-3">
          <div v-if="!teacher.user?.onVacation" class="set-vacation">
            <p class="text-muted">Markera som ledig</p>
            <div class="form-row">
              <div class="form-group">
                <label>Startdatum</label>
                <input v-model="vacationData.vacationStart" type="date" class="form-control" />
              </div>
              <div class="form-group">
                <label>Slutdatum</label>
                <input v-model="vacationData.vacationEnd" type="date" class="form-control" />
              </div>
            </div>
            <div class="form-group mt-2">
              <label>Anteckning (valfritt)</label>
              <input v-model="vacationData.vacationNote" type="text" class="form-control" placeholder="T.ex. sommarledighet" />
            </div>
            <button @click="setVacation" class="btn btn-warning mt-2" :disabled="!vacationData.vacationStart || !vacationData.vacationEnd || savingVacation">
              {{ savingVacation ? 'Sparar...' : 'Sätt ledighet' }}
            </button>
          </div>
          <div v-else>
            <button @click="clearVacation" class="btn btn-outline-danger" :disabled="savingVacation">
              {{ savingVacation ? 'Rensar...' : 'Ta bort ledighet' }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import { ref, reactive, computed } from 'vue';
import { useStore } from 'vuex';
import client from '@/api/client.js';

export default {
  name: 'StaffGeneralTab',
  props: {
    teacher: { type: Object, required: true },
  },
  emits: ['teacher-updated'],
  setup(props, { emit }) {
    const store = useStore();
    const editMode = ref(false);
    const saving = ref(false);
    const savingVacation = ref(false);

    const isAdmin = computed(() => {
      const roles = store.getters.userRoles || [];
      return roles.some(r => ['admin', 'systemadmin'].includes(r));
    });

    const editData = reactive({
      subject: props.teacher.subject || '',
      phoneNumbers: [...(props.teacher.phoneNumbers || [])],
    });

    const vacationData = reactive({
      vacationStart: '',
      vacationEnd: '',
      vacationNote: '',
    });

    const toggleEditMode = () => {
      editMode.value = !editMode.value;
      if (editMode.value) {
        editData.subject = props.teacher.subject || '';
        editData.phoneNumbers = [...(props.teacher.phoneNumbers || [])];
      }
    };

    const addPhone = () => {
      editData.phoneNumbers.push('');
    };

    const removePhone = (idx) => {
      editData.phoneNumbers.splice(idx, 1);
    };

    const saveProfile = async () => {
      saving.value = true;
      try {
        await client.put(`/teachers/${props.teacher._id}/profile`, {
          subject: editData.subject,
          phoneNumbers: editData.phoneNumbers,
        });
        editMode.value = false;
        emit('teacher-updated');
      } catch (err) {
        console.error('Error saving profile:', err);
        alert('Kunde inte spara profil.');
      } finally {
        saving.value = false;
      }
    };

    const setVacation = async () => {
      savingVacation.value = true;
      try {
        await client.put(`/teachers/${props.teacher._id}/vacation`, {
          onVacation: true,
          vacationStart: vacationData.vacationStart,
          vacationEnd: vacationData.vacationEnd,
          vacationNote: vacationData.vacationNote,
        });
        vacationData.vacationStart = '';
        vacationData.vacationEnd = '';
        vacationData.vacationNote = '';
        emit('teacher-updated');
      } catch (err) {
        console.error('Error setting vacation:', err);
        alert('Kunde inte sätta ledighet.');
      } finally {
        savingVacation.value = false;
      }
    };

    const clearVacation = async () => {
      savingVacation.value = true;
      try {
        await client.put(`/teachers/${props.teacher._id}/vacation`, {
          onVacation: false,
        });
        emit('teacher-updated');
      } catch (err) {
        console.error('Error clearing vacation:', err);
        alert('Kunde inte ta bort ledighet.');
      } finally {
        savingVacation.value = false;
      }
    };

    const formatDate = (dateStr) => {
      if (!dateStr) return '';
      return new Date(dateStr).toLocaleDateString('sv-SE');
    };

    const getRoleLabel = (roles) => {
      if (!roles || roles.length === 0) return 'Okänd';
      const roleLabels = {
        admin: 'Administratör',
        systemadmin: 'Systemadministratör',
        teacher: 'Lärare',
        coordinator: 'Koordinator',
        syv: 'SYV',
        specped: 'Specialpedagog',
      };
      return roles.map(r => roleLabels[r] || r).join(', ');
    };

    return {
      editMode,
      saving,
      savingVacation,
      isAdmin,
      editData,
      vacationData,
      toggleEditMode,
      addPhone,
      removePhone,
      saveProfile,
      setVacation,
      clearVacation,
      formatDate,
      getRoleLabel,
    };
  },
};
</script>

<style scoped>
.card {
  border-radius: 8px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.08);
}

.card-header {
  background: #f8f9fa;
  padding: 12px 16px;
  border-bottom: 1px solid #dee2e6;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.card-header h3 {
  margin: 0;
  font-size: 1.1rem;
  color: #2c3e50;
}

.card-body {
  padding: 16px;
}

.info-grid {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.info-item {
  display: flex;
  align-items: center;
  gap: 10px;
}

.info-item label {
  font-weight: 600;
  color: #495057;
  min-width: 120px;
}

.phone-input-row {
  display: flex;
  gap: 8px;
  margin-bottom: 6px;
}

.phone-input-row input {
  flex: 1;
}

.badge {
  padding: 4px 10px;
  border-radius: 4px;
  font-size: 0.85rem;
}

.badge-warning {
  background: #fff3cd;
  color: #856404;
}

.badge-success {
  background: #d4edda;
  color: #155724;
}

.form-row {
  display: flex;
  gap: 12px;
}

.form-group {
  flex: 1;
}

.form-control {
  width: 100%;
  padding: 6px 10px;
  border: 1px solid #ced4da;
  border-radius: 4px;
}
</style>
