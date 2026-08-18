<template>
  <div class="scrollable-view">
    <div class="header-bar">
      <router-link to="/admin/users" class="back-link">Tillbaka till Användare</router-link>
    </div>

    <div v-if="loading" class="loading-state">Laddar...</div>
    <div v-else-if="error" class="error-state">{{ error }}</div>

    <template v-else-if="user">
      <h3 class="page-title">Redigera användare: {{ user.name || user.email }}</h3>

      <div class="card">
        <h4>Grundläggande information</h4>
        <div class="field-grid">
          <div class="field">
            <label>Namn</label>
            <input type="text" v-model="user.name" class="form-control" />
          </div>
          <div class="field">
            <label>E-post</label>
            <input type="email" v-model="user.email" class="form-control" />
          </div>
          <div class="field">
            <label>Användarnamn</label>
            <input type="text" v-model="user.username" class="form-control" />
          </div>
        </div>
      </div>

      <div class="card">
        <h4>Roller</h4>
        <p class="hint">Välj en eller flera roller för användaren.</p>
        <div class="role-grid">
          <label
            v-for="role in availableRoles"
            :key="role.value"
            class="role-checkbox"
          >
            <input
              type="checkbox"
              :value="role.value"
              v-model="selectedRoles"
            />
            <span class="role-label">{{ role.label }}</span>
          </label>
        </div>
        <div class="actions">
          <button
            class="btn btn-primary"
            @click="saveRoles"
            :disabled="savingRoles || !hasRoleChanges"
          >
            {{ savingRoles ? 'Sparar...' : 'Spara roller' }}
          </button>
        </div>
        <div v-if="roleMessage" :class="['message', roleMessageType]">{{ roleMessage }}</div>
      </div>

      <div class="card">
        <h4>Individuella behörighetsöverridningar</h4>
        <p class="hint">Överstyr standardbehörigheter för denna användare. Ett启用 betyder att featuren är på, ett inaktiverat betyder att den är av. Om ingen ändring görs används rollens standard.</p>
        <div class="permission-grid">
          <div
            v-for="feature in features"
            :key="feature.key"
            class="permission-row"
          >
            <div class="perm-info">
              <span class="perm-label">{{ feature.label }}</span>
              <span class="perm-role-default">Standard för roll: {{ getRoleDefault(feature.key) }}</span>
            </div>
            <div class="perm-controls">
              <label class="toggle-switch">
                <input
                  type="checkbox"
                  :checked="getPermissionOverride(feature.key)"
                  @change="setPermissionOverride(feature.key, $event.target.checked)"
                />
                <span class="slider"></span>
              </label>
              <button
                v-if="hasPermissionOverride(feature.key)"
                class="btn-reset"
                @click="clearPermissionOverride(feature.key)"
                title="Återställ till roll-standard"
              >
                Återställ
              </button>
            </div>
          </div>
        </div>
        <div class="actions">
          <button
            class="btn btn-primary"
            @click="savePermissions"
            :disabled="savingPermissions"
          >
            {{ savingPermissions ? 'Sparar...' : 'Spara behörigheter' }}
          </button>
        </div>
        <div v-if="permMessage" :class="['message', permMessageType]">{{ permMessage }}</div>
      </div>

      <div class="card">
        <h4>Åtgärder</h4>
        <div class="actions">
          <button class="btn btn-warning" @click="resetPassword" :disabled="resettingPassword">
            {{ resettingPassword ? 'Återställer...' : 'Återställ lösenord' }}
          </button>
        </div>
        <div v-if="resetMessage" :class="['message', resetMessageType]">{{ resetMessage }}</div>
      </div>
    </template>
  </div>
</template>

<script>
import { ref, reactive, computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import client from '@/api/client.js'

const ROLE_OPTIONS = [
  { value: 'systemadmin', label: 'Systemadministratör' },
  { value: 'admin', label: 'Administratör' },
  { value: 'teacher', label: 'Lärare' },
  { value: 'coordinator', label: 'Praktiksamordnare' },
  { value: 'syv', label: 'SYV' },
  { value: 'specped', label: 'Specialpedagog' },
  { value: 'student', label: 'Elev' },
]

const FEATURE_OPTIONS = [
  { key: 'calendar_final_exam', label: 'Kalender (slutprov)' },
  { key: 'search_content', label: 'Söka efter innehåll' },
  { key: 'search_users', label: 'Söka efter användare' },
  { key: 'statistics', label: 'Statistik' },
  { key: 'manage_users_permissions', label: 'Hantering av användare och åtkomstbehörigheter' },
  { key: 'hierarchy_management', label: 'Hierarkihantering' },
  { key: 'own_settings', label: 'Egna inställningar' },
  { key: 'add_municipalities_courses', label: 'Lägga till kommuner, kurser etc.' },
  { key: 'course_templates', label: 'Kursmallar (kursmoduler)' },
]

const ROLE_FEATURE_DEFAULTS = {
  systemadmin: { calendar_final_exam: true, search_content: true, search_users: true, statistics: true, manage_users_permissions: true, hierarchy_management: true, own_settings: true, add_municipalities_courses: true, course_templates: true },
  admin: { calendar_final_exam: true, search_content: true, search_users: true, statistics: true, manage_users_permissions: true, hierarchy_management: false, own_settings: true, add_municipalities_courses: false, course_templates: true },
  teacher: { calendar_final_exam: true, search_content: true, search_users: true, statistics: true, manage_users_permissions: false, hierarchy_management: false, own_settings: true, add_municipalities_courses: false, course_templates: true },
  coordinator: { calendar_final_exam: false, search_content: true, search_users: true, statistics: false, manage_users_permissions: false, hierarchy_management: false, own_settings: true, add_municipalities_courses: false, course_templates: false },
  syv: { calendar_final_exam: true, search_content: true, search_users: true, statistics: true, manage_users_permissions: false, hierarchy_management: false, own_settings: true, add_municipalities_courses: false, course_templates: false },
  specped: { calendar_final_exam: true, search_content: true, search_users: true, statistics: true, manage_users_permissions: false, hierarchy_management: false, own_settings: true, add_municipalities_courses: false, course_templates: false },
  student: { calendar_final_exam: false, search_content: false, search_users: false, statistics: false, manage_users_permissions: false, hierarchy_management: false, own_settings: true, add_municipalities_courses: false, course_templates: false },
}

export default {
  name: 'EditUser',
  setup() {
    const route = useRoute()
    const userId = route.params.id

    const user = ref(null)
    const loading = ref(true)
    const error = ref(null)
    const availableRoles = ROLE_OPTIONS
    const features = FEATURE_OPTIONS

    const selectedRoles = ref([])
    const originalRoles = ref([])
    const savingRoles = ref(false)
    const roleMessage = ref('')
    const roleMessageType = ref('')

    const permissionOverrides = reactive({})
    const originalPermissions = ref({})
    const savingPermissions = ref(false)
    const permMessage = ref('')
    const permMessageType = ref('')

    const resettingPassword = ref(false)
    const resetMessage = ref('')
    const resetMessageType = ref('')

    const hasRoleChanges = computed(() => {
      const sortedNew = [...selectedRoles.value].sort()
      const sortedOld = [...originalRoles.value].sort()
      return JSON.stringify(sortedNew) !== JSON.stringify(sortedOld)
    })

    const fetchUser = async () => {
      loading.value = true
      error.value = null
      try {
        const { data } = await client.get(`/users/${userId}`)
        user.value = data
        selectedRoles.value = [...(data.roles || [])]
        originalRoles.value = [...(data.roles || [])]

        const perms = data.permissions && typeof data.permissions === 'object' ? data.permissions : {}
        Object.keys(perms).forEach((k) => {
          permissionOverrides[k] = perms[k]
        })
        originalPermissions.value = { ...perms }
      } catch (e) {
        error.value = e.message || 'Kunde inte hämta användare'
      } finally {
        loading.value = false
      }
    }

    const saveRoles = async () => {
      savingRoles.value = true
      roleMessage.value = ''
      try {
        await client.put(`/users/${userId}/roles`, { roles: selectedRoles.value })
        originalRoles.value = [...selectedRoles.value]
        roleMessage.value = 'Roller sparade.'
        roleMessageType.value = 'success'
      } catch (e) {
        roleMessage.value = e.message || 'Fel vid sparning av roller'
        roleMessageType.value = 'error'
      } finally {
        savingRoles.value = false
      }
    }

    const getRoleDefault = (featureKey) => {
      const primaryRole = selectedRoles.value[0] || 'student'
      const defaults = ROLE_FEATURE_DEFAULTS[primaryRole] || {}
      return defaults[featureKey] ? 'På' : 'Av'
    }

    const getPermissionOverride = (featureKey) => {
      return permissionOverrides[featureKey] === true
    }

    const hasPermissionOverride = (featureKey) => {
      return Object.prototype.hasOwnProperty.call(permissionOverrides, featureKey)
    }

    const setPermissionOverride = (featureKey, value) => {
      permissionOverrides[featureKey] = value
    }

    const clearPermissionOverride = (featureKey) => {
      delete permissionOverrides[featureKey]
    }

    const savePermissions = async () => {
      savingPermissions.value = true
      permMessage.value = ''
      try {
        const payload = { ...permissionOverrides }
        await client.put(`/users/${userId}/permissions`, { permissions: payload })
        originalPermissions.value = { ...payload }
        permMessage.value = 'Behörigheter sparade.'
        permMessageType.value = 'success'
      } catch (e) {
        permMessage.value = e.message || 'Fel vid sparning av behörigheter'
        permMessageType.value = 'error'
      } finally {
        savingPermissions.value = false
      }
    }

    const resetPassword = async () => {
      resettingPassword.value = true
      resetMessage.value = ''
      try {
        const { data } = await client.post(`/users/${userId}/reset-password`)
        resetMessage.value = `Lösenord återställt. Nytt tillfälligt lösenord: ${data.tempPassword}`
        resetMessageType.value = 'success'
      } catch (e) {
        resetMessage.value = e.message || 'Fel vid lösenordsåterställning'
        resetMessageType.value = 'error'
      } finally {
        resettingPassword.value = false
      }
    }

    onMounted(fetchUser)

    return {
      user,
      loading,
      error,
      availableRoles,
      features,
      selectedRoles,
      savingRoles,
      roleMessage,
      roleMessageType,
      hasRoleChanges,
      permissionOverrides,
      savingPermissions,
      permMessage,
      permMessageType,
      resettingPassword,
      resetMessage,
      resetMessageType,
      getRoleDefault,
      getPermissionOverride,
      hasPermissionOverride,
      setPermissionOverride,
      clearPermissionOverride,
      saveRoles,
      savePermissions,
      resetPassword,
    }
  },
}
</script>

<style scoped>
.scrollable-view { padding: 20px; max-width: 900px; margin: 0 auto; }
.header-bar { margin-bottom: 16px; }
.back-link { text-decoration: none; color: #1976d2; font-weight: 500; }
.page-title { margin-bottom: 20px; }
.card { background: #fff; border-radius: 8px; box-shadow: 0 2px 6px rgba(0,0,0,0.08); padding: 24px; margin-bottom: 20px; }
.card h4 { margin: 0 0 12px; font-size: 16px; }
.hint { font-size: 13px; color: #666; margin-bottom: 12px; }
.field-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
.field label { display: block; font-weight: 500; margin-bottom: 4px; font-size: 13px; }
.form-control { width: 100%; padding: 8px 12px; border: 1px solid #ccc; border-radius: 4px; font-size: 14px; }
.role-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 8px; margin-bottom: 16px; }
.role-checkbox { display: flex; align-items: center; gap: 8px; padding: 8px; border: 1px solid #e0e0e0; border-radius: 4px; cursor: pointer; }
.role-checkbox:hover { background: #f5f5f5; }
.role-label { font-size: 14px; }
.permission-grid { margin-bottom: 16px; }
.permission-row { display: flex; align-items: center; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid #f0f0f0; }
.perm-info { display: flex; flex-direction: column; }
.perm-label { font-weight: 500; font-size: 14px; }
.perm-role-default { font-size: 12px; color: #888; }
.perm-controls { display: flex; align-items: center; gap: 12px; }
.toggle-switch { position: relative; display: inline-block; width: 44px; height: 24px; }
.toggle-switch input { opacity: 0; width: 0; height: 0; }
.slider { position: absolute; cursor: pointer; top: 0; left: 0; right: 0; bottom: 0; background: #ccc; border-radius: 24px; transition: 0.2s; }
.slider:before { content: ""; position: absolute; height: 18px; width: 18px; left: 3px; bottom: 3px; background: #fff; border-radius: 50%; transition: 0.2s; }
.toggle-switch input:checked + .slider { background: #1976d2; }
.toggle-switch input:checked + .slider:before { transform: translateX(20px); }
.btn-reset { background: none; border: 1px solid #ccc; border-radius: 4px; padding: 4px 8px; font-size: 12px; cursor: pointer; color: #666; }
.btn-reset:hover { border-color: #999; color: #333; }
.actions { margin-top: 12px; }
.btn { padding: 8px 16px; border: none; border-radius: 4px; cursor: pointer; font-weight: 500; font-size: 14px; }
.btn-primary { background: #1976d2; color: #fff; }
.btn-primary:hover { background: #1565c0; }
.btn-primary:disabled { background: #9e9e9e; cursor: not-allowed; }
.btn-warning { background: #f57c00; color: #fff; }
.btn-warning:hover { background: #ef6c00; }
.btn-warning:disabled { background: #9e9e9e; cursor: not-allowed; }
.message { margin-top: 8px; padding: 8px 12px; border-radius: 4px; font-size: 13px; }
.success { background: #e8f5e9; color: #2e7d32; }
.error { background: #ffebee; color: #c62828; }
.loading-state, .error-state { padding: 40px; text-align: center; font-size: 16px; }
.error-state { color: #c62828; }
</style>
