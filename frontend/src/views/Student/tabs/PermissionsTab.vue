<template>
  <div v-if="isAdmin" class="permissions-container">
    <!-- User Creation Section -->
    <div v-if="!hasUser" class="card">
      <div class="card-header">
        <h3>Skapa användare</h3>
      </div>
      <div class="card-body">
        <div class="alert alert-warning">
          <p>Ingen användare hittades för denna elev. En användare måste skapas innan behörigheter kan tilldelas.</p>
        </div>
        <button 
          class="btn btn-primary" 
          :disabled="isCreatingUser"
          @click="createUserForStudent"
        >
          {{ isCreatingUser ? 'Skapar...' : 'Skapa användare för elev' }}
        </button>
        <div v-if="createdUserPassword" class="alert alert-info mt-3">
          <p><strong>Användare skapad!</strong></p>
          <label for="temporary-password">Tillfälligt lösenord</label>
          <div class="temporary-password">
            <input
              id="temporary-password"
              :type="showCreatedPassword ? 'text' : 'password'"
              :value="createdUserPassword"
              readonly
              autocomplete="off"
            />
            <button type="button" class="btn btn-secondary" @click="showCreatedPassword = !showCreatedPassword">
              {{ showCreatedPassword ? 'Dölj' : 'Visa' }}
            </button>
          </div>
          <p class="small">Spara lösenordet säkert. Användaren kan byta lösenord vid första inloggningen.</p>
        </div>
      </div>
    </div>

    <!-- Editable Permissions Section -->
    <div v-if="hasUser" class="card">
      <div class="card-header">
        <h3>Behörigheter</h3>
        <p class="small text-muted">Klicka på kryssrutor för att aktivera/inaktivera behörigheter för denna elev</p>
      </div>
      <div class="card-body">
        <div class="permission-matrix-container">
          <table class="permission-matrix editable">
            <thead>
              <tr>
                <th>Funktion</th>
                <th class="permission-toggle-header">Tillåt</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="feature in features" :key="feature.value">
                <td class="feature-name">{{ feature.label }}</td>
                <td class="permission-cell editable-cell">
                  <label class="permission-checkbox">
                    <input
                      type="checkbox"
                      :checked="hasPermission(feature.value)"
                      @change="togglePermission(feature.value, $event.target.checked)"
                    />
                    <span class="checkmark"></span>
                  </label>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <div class="form-actions mt-3">
          <button 
            class="btn btn-primary" 
            :disabled="isSavingPermissions || !hasPermissionChanges" 
            @click="savePermissions"
          >
            {{ isSavingPermissions ? 'Sparar...' : 'Spara behörigheter' }}
          </button>
        </div>
      </div>
    </div>
  </div>
  <div v-else>
    <p>Du har inte behörighet att se denna sida.</p>
  </div>
</template>

<script>
import { ref, computed, onMounted, watch } from 'vue';
import { useStore } from 'vuex';
import client from '@/api/client.js';
import { useToast } from '@/composables/useToast.js';

// Permission matrix based on requirements
const PERMISSION_MATRIX = {
  calendar_final_exam: {
    systemadmin: 'Skapa, redigera, ändra till tidigare version',
    admin: 'Skapa, redigera',
    teacher: 'Endast titta',
    syv: 'Lägga in mö',
    specped: 'Lägga in mö',
    coordinator: 'Nej',
    student: 'Endast deras egna inbokade slutprov',
  },
  search_content: {
    systemadmin: 'Ja',
    admin: 'Ja',
    teacher: 'Ja',
    syv: 'Ja',
    specped: 'Ja',
    coordinator: 'Ja',
    student: 'Nej',
  },
  search_users: {
    systemadmin: 'Ja',
    admin: 'Ja',
    teacher: 'Ja',
    syv: 'Ja',
    specped: 'Ja',
    coordinator: 'Ja',
    student: 'Nej',
  },
  statistics: {
    systemadmin: 'Ja',
    admin: 'Ja',
    teacher: 'Ja',
    syv: 'Ja',
    specped: 'Ja',
    coordinator: 'Nej',
    student: 'Nej',
  },
  manage_users_permissions: {
    systemadmin: 'Ja',
    admin: 'Ja',
    teacher: 'Nej',
    syv: 'Nej',
    specped: 'Nej',
    coordinator: 'Nej',
    student: 'Nej',
  },
  hierarchy_management: {
    systemadmin: 'Ja',
    admin: 'Nej',
    teacher: 'Nej',
    syv: 'Nej',
    specped: 'Nej',
    coordinator: 'Nej',
    student: 'Nej',
  },
  own_settings: {
    systemadmin: 'Ja',
    admin: 'Ja',
    teacher: 'Ja',
    syv: 'Ja',
    specped: 'Ja',
    coordinator: 'Ja',
    student: 'Ja',
  },
  add_municipalities_courses: {
    systemadmin: 'Ja',
    admin: 'Nej',
    teacher: 'Nej',
    syv: 'Nej',
    specped: 'Nej',
    coordinator: 'Nej',
    student: 'Nej',
  },
};

const FEATURES = [
  { value: 'calendar_final_exam', label: 'Kalender (slutprov)' },
  { value: 'search_content', label: 'Söka efter innehåll' },
  { value: 'search_users', label: 'Söka efter användare' },
  { value: 'statistics', label: 'Statistik' },
  { value: 'manage_users_permissions', label: 'Hantering av användar och åtkomstbehörigheter' },
  { value: 'hierarchy_management', label: 'Hierarkihantering?' },
  { value: 'own_settings', label: 'Egna inställningar (ex profilbild)' },
  { value: 'add_municipalities_courses', label: 'Lägga till kommuner, kurser etc' },
];

export default {
  name: 'PermissionsTab',
  props: {
    student: {
      type: Object,
      required: true,
    },
  },
  emits: ['user-created'],
  setup(props, { emit }) {
    const store = useStore();
    const route = useRoute();
    const toast = useToast();
    const isSavingPermissions = ref(false);
    const isCreatingUser = ref(false);
    const createdUserPassword = ref(null);
    const showCreatedPassword = ref(false);
    const features = ref(FEATURES);
    
    // Custom permissions state
    const customPermissions = ref({});
    const originalPermissions = ref({});

    const isAdmin = computed(() => store.getters.isAdmin);
    const hasUser = computed(() => {
      return props.student && props.student.user && props.student.user._id;
    });

    // Check if user has custom permission for a feature
    const hasPermission = (feature) => {
      // Check custom permissions first - if explicitly set (true or false), use that
      if (customPermissions.value && customPermissions.value.hasOwnProperty(feature)) {
        return customPermissions.value[feature] === true;
      }
      // If no custom permission set, check if any of the user's roles have this permission
      const userRoles = props.student?.user?.roles || [];
      for (const role of userRoles) {
        const rolePermission = PERMISSION_MATRIX[feature]?.[role];
        if (rolePermission && rolePermission !== 'Nej') {
          return true;
        }
      }
      return false;
    };

    // Toggle permission for a feature
    const togglePermission = (feature, enabled) => {
      // Create a new object to ensure reactivity
      customPermissions.value = {
        ...customPermissions.value,
        [feature]: enabled
      };
    };

    // Check if permissions have changed
    const hasPermissionChanges = computed(() => {
      // Normalize both objects - remove undefined and null values, sort keys
      const normalize = (obj) => {
        if (!obj || typeof obj !== 'object') return {};
        const normalized = {};
        Object.keys(obj).sort().forEach(key => {
          const value = obj[key];
          // Only include truthy values or explicit false (but not undefined/null)
          if (value !== undefined && value !== null) {
            normalized[key] = value;
          }
        });
        return normalized;
      };
      
      const currentNormalized = normalize(customPermissions.value);
      const originalNormalized = normalize(originalPermissions.value);
      
      const current = JSON.stringify(currentNormalized);
      const original = JSON.stringify(originalNormalized);
      
      return current !== original;
    });

    // Load permissions when user data is available
    const loadPermissions = () => {
      if (props.student?.user?.permissions) {
        const permissions = props.student.user.permissions;
        customPermissions.value = permissions && typeof permissions === 'object' 
          ? JSON.parse(JSON.stringify(permissions))
          : {};
        originalPermissions.value = JSON.parse(JSON.stringify(customPermissions.value));
      } else {
        customPermissions.value = {};
        originalPermissions.value = {};
      }
    };

    onMounted(() => {
      loadPermissions();
    });

    // Watch for student changes
    watch(() => props.student, (newStudent) => {
      loadPermissions();
      createdUserPassword.value = null;
    }, { deep: true });

    const createUserForStudent = async () => {
      if (!props.student || !props.student._id) {
        toast.error('Student information saknas.');
        return;
      }

      isCreatingUser.value = true;
      try {
        const response = await client.post('/users/create-for-student', {
          studentId: props.student._id,
          email: props.student.email,
          name: props.student.name,
        });
        
        createdUserPassword.value = response.data.tempPassword;

        emit('user-created');
      } catch (error) {
        toast.error('Kunde inte skapa användare. ' + error.message);
      } finally {
        isCreatingUser.value = false;
      }
    };

    const savePermissions = async () => {
      if (!props.student || !props.student.user || !props.student.user._id) {
        toast.error('Ingen användare hittades för denna elev. Kan inte spara behörigheter.');
        return;
      }
      isSavingPermissions.value = true;
      try {
        await client.put(`/users/${props.student.user._id}/permissions`, {
          permissions: customPermissions.value,
        });
        originalPermissions.value = JSON.parse(JSON.stringify(customPermissions.value));
        toast.success('Behörigheterna har uppdaterats!');
      } catch (error) {
        console.error('Error saving permissions:', error);
        toast.error('Kunde inte spara behörigheter.');
      } finally {
        isSavingPermissions.value = false;
      }
    };

    return {
      isAdmin,
      hasUser,
      isSavingPermissions,
      isCreatingUser,
  createdUserPassword,
  showCreatedPassword,
  features,
      hasPermission,
      togglePermission,
      savePermissions,
      createUserForStudent,
      hasPermissionChanges,
    };
  },
};
</script>

<style scoped>
.permissions-container {
  max-width: 1200px;
}

.card {
  background: white;
  border-radius: 8px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  margin-bottom: 20px;
}

.card-header {
  background: #f8f9fa;
  padding: 15px 20px;
  border-bottom: 1px solid #dee2e6;
}

.card-header h3 {
  margin: 0;
  color: #2c3e50;
}

.card-body {
  padding: 20px;
}

.form-group {
  margin-bottom: 1.5rem;
}

.form-label {
  display: block;
  margin-bottom: 0.5rem;
  font-weight: 500;
  color: #495057;
}

.form-help {
  display: block;
  margin-top: 0.25rem;
  font-size: 0.875rem;
  color: #6c757d;
}

.roles-list {
  border: 1px solid #ced4da;
  border-radius: 6px;
  max-height: 220px;
  overflow: auto;
  background: white;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding: 12px;
}

.role-item {
  padding: 0.5rem 0.75rem;
  cursor: pointer;
  user-select: none;
  border: 1px solid #ced4da;
  border-radius: 4px;
  transition: all 0.2s;
}

.role-item:hover {
  background: #f1f3f5;
  border-color: #007bff;
}

.role-item.selected {
  background: #e9f7ef;
  border-color: #28a745;
  border-width: 2px;
  font-weight: 500;
}

.form-actions {
  margin-top: 1rem;
}

.btn {
  padding: 8px 16px;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 14px;
}

.btn-primary {
  background: #007bff;
  color: white;
}

.btn-primary:hover:not(:disabled) {
  background: #0056b3;
}

.btn-primary:disabled {
  background: #6c757d;
  cursor: not-allowed;
  opacity: 0.6;
}

.alert {
  padding: 12px 16px;
  border-radius: 4px;
  margin-bottom: 1rem;
}

.alert-warning {
  background-color: #fff3cd;
  border: 1px solid #ffc107;
  color: #856404;
}

.alert-info {
  background-color: #d1ecf1;
  border: 1px solid #bee5eb;
  color: #0c5460;
}

.alert-info code {
  background: #fff;
  padding: 2px 6px;
  border-radius: 3px;
  font-family: monospace;
  font-weight: bold;
}

.mt-3 {
  margin-top: 1rem;
}

.mt-4 {
  margin-top: 1.5rem;
}

.small {
  font-size: 0.875rem;
}

/* Permission Matrix Styles */
.permission-matrix-container {
  overflow-x: auto;
}

.permission-matrix {
  width: 100%;
  border-collapse: collapse;
  font-size: 14px;
}

.permission-matrix.editable {
  width: 100%;
}

.permission-matrix thead {
  background: #007bff;
  color: white;
}

.permission-matrix th {
  padding: 12px 8px;
  text-align: center;
  font-weight: 600;
  border: 1px solid #0056b3;
}

.permission-matrix th:first-child {
  text-align: left;
  background: #0056b3;
}

.permission-toggle-header {
  text-align: center !important;
  width: 100px;
}

.permission-matrix td {
  padding: 10px 8px;
  border: 1px solid #dee2e6;
  text-align: center;
  font-size: 13px;
}

.permission-matrix .feature-name {
  text-align: left;
  font-weight: 500;
  background: #f8f9fa;
  min-width: 300px;
}

.permission-cell {
  vertical-align: middle;
}

.editable-cell {
  text-align: center;
}

/* Custom Checkbox Styles */
.permission-checkbox {
  display: inline-block;
  position: relative;
  cursor: pointer;
  user-select: none;
}

.permission-checkbox input[type="checkbox"] {
  position: absolute;
  opacity: 0;
  cursor: pointer;
  height: 0;
  width: 0;
}

.checkmark {
  position: relative;
  display: inline-block;
  width: 24px;
  height: 24px;
  background-color: #fff;
  border: 2px solid #dee2e6;
  border-radius: 4px;
  transition: all 0.2s;
}

.permission-checkbox:hover .checkmark {
  border-color: #007bff;
  background-color: #f0f8ff;
}

.permission-checkbox input:checked ~ .checkmark {
  background-color: #28a745;
  border-color: #28a745;
}

.permission-checkbox input:checked ~ .checkmark:after {
  content: "";
  position: absolute;
  display: block;
  left: 8px;
  top: 4px;
  width: 6px;
  height: 12px;
  border: solid white;
  border-width: 0 2px 2px 0;
  transform: rotate(45deg);
}

.text-muted {
  color: #6c757d;
  font-size: 0.875rem;
  margin-top: 5px;
}
</style>
