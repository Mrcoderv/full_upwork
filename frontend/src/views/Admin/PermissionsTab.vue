<template>
  <div class="scrollable-view">
    <h3 class="page-title">Behörigheter och roller</h3>

    <div class="card">
      <h4>Rollbehörigheter (standard)</h4>
      <p class="hint">Standardbehörigheter per roll. Individuella överridningar kan ändras per användare via "Redigera" på användarsidan.</p>
      <div class="table-wrapper">
        <table class="matrix-table">
          <thead>
            <tr>
              <th class="feature-col">Feature</th>
              <th v-for="role in roles" :key="role.key" class="role-col">{{ role.label }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="feature in features" :key="feature.key">
              <td class="feature-label">{{ feature.label }}</td>
              <td
                v-for="role in roles"
                :key="role.key"
                :class="['status-cell', getCellClass(role.key, feature.key)]"
              >
                {{ getCellLabel(role.key, feature.key) }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <div class="card">
      <h4>Rollrättigheter (RBAC)</h4>
      <p class="hint">Rollbaserade åtkomstbehörigheter för resurser.</p>
      <div class="table-wrapper">
        <table class="matrix-table">
          <thead>
            <tr>
              <th class="feature-col">Behörighet</th>
              <th v-for="role in roles" :key="role.key" class="role-col">{{ role.label }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="perm in rbacPermissions" :key="perm.key">
              <td class="feature-label">{{ perm.label }}</td>
              <td
                v-for="role in roles"
                :key="role.key"
                :class="['status-cell', hasRbacPerm(role.key, perm.key) ? 'granted' : 'denied']"
              >
                {{ hasRbacPerm(role.key, perm.key) ? 'Ja' : 'Nej' }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>

<script>
const ROLE_OPTIONS = [
  { key: 'systemadmin', label: 'Systemadmin' },
  { key: 'admin', label: 'Admin' },
  { key: 'teacher', label: 'Lärare' },
  { key: 'coordinator', label: 'Koordinator' },
  { key: 'syv', label: 'SYV' },
  { key: 'specped', label: 'Specped' },
  { key: 'student', label: 'Elev' },
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

const PERMISSION_MATRIX = {
  calendar_final_exam: { systemadmin: true, admin: true, teacher: true, syv: true, specped: true, coordinator: false, student: false },
  search_content: { systemadmin: true, admin: true, teacher: true, syv: true, specped: true, coordinator: true, student: false },
  search_users: { systemadmin: true, admin: true, teacher: true, syv: true, specped: true, coordinator: true, student: false },
  statistics: { systemadmin: true, admin: true, teacher: true, syv: true, specped: true, coordinator: false, student: false },
  manage_users_permissions: { systemadmin: true, admin: true, teacher: false, syv: false, specped: false, coordinator: false, student: false },
  hierarchy_management: { systemadmin: true, admin: false, teacher: false, syv: false, specped: false, coordinator: false, student: false },
  own_settings: { systemadmin: true, admin: true, teacher: true, syv: true, specped: true, coordinator: true, student: true },
  add_municipalities_courses: { systemadmin: true, admin: false, teacher: false, syv: false, specped: false, coordinator: false, student: false },
  course_templates: { systemadmin: true, admin: true, teacher: true, syv: false, specped: false, coordinator: false, student: false },
}

const RBAC_PERMISSIONS = {
  systemadmin: ['users:create', 'users:read', 'users:update', 'users:delete', 'teachers:read', 'teachers:create', 'teachers:update', 'teachers:delete', 'teachers:unassign', 'assignments:create', 'assignments:read:own', 'assignments:update:own', 'assignments:grade', 'students:view_list:assigned', 'students:view_grades:assigned', 'analytics:read', 'inactivity:read', 'courseTemplates:create', 'courseTemplates:read', 'courseTemplates:update', 'courseTemplates:delete'],
  admin: ['users:create', 'users:read', 'users:update', 'users:delete', 'teachers:read', 'teachers:create', 'teachers:update', 'teachers:delete', 'teachers:unassign', 'analytics:read', 'inactivity:read', 'courseTemplates:create', 'courseTemplates:read', 'courseTemplates:update', 'courseTemplates:delete'],
  teacher: ['inactivity:read', 'assignments:create', 'assignments:read:own', 'assignments:update:own', 'assignments:grade', 'students:view_list:assigned', 'students:view_grades:assigned', 'courseTemplates:create', 'courseTemplates:read', 'courseTemplates:update'],
  coordinator: ['students:view_list:assigned', 'students:view_grades:assigned', 'analytics:read', 'inactivity:read'],
  syv: ['students:view_list:assigned', 'students:view_grades:assigned', 'analytics:read', 'inactivity:read'],
  specped: ['students:view_list:assigned', 'students:view_grades:assigned', 'analytics:read', 'inactivity:read'],
  student: ['viewOwnGrades', 'viewOwnSchedule', 'viewOwnProfile', 'viewCourseInfo', 'viewNotifications'],
}

const ALL_RBAC_KEYS = [...new Set(Object.values(RBAC_PERMISSIONS).flat())].sort()

const RBAC_LABELS = {
  'users:create': 'Skapa användare',
  'users:read': 'Visa användare',
  'users:update': 'Uppdatera användare',
  'users:delete': 'Ta bort användare',
  'teachers:read': 'Visa lärare',
  'teachers:create': 'Skapa lärare',
  'teachers:update': 'Uppdatera lärare',
  'teachers:delete': 'Ta bort lärare',
  'teachers:unassign': 'Avlotta lärare',
  'assignments:create': 'Skapa uppgifter',
  'assignments:read:own': 'Visa egna uppgifter',
  'assignments:update:own': 'Uppdatera egna uppgifter',
  'assignments:grade': 'Betygsätt',
  'students:view_list:assigned': 'Visa elever (tilldelade)',
  'students:view_grades:assigned': 'Visa betyg (tilldelade)',
  'analytics:read': 'Statistik & analys',
  'inactivity:read': 'Inaktivitetsrapport',
  'courseTemplates:create': 'Skapa kursmallar',
  'courseTemplates:read': 'Visa kursmallar',
  'courseTemplates:update': 'Uppdatera kursmallar',
  'courseTemplates:delete': 'Ta bort kursmallar',
  'viewOwnGrades': 'Visa egna betyg',
  'viewOwnSchedule': 'Visa eget schema',
  'viewOwnProfile': 'Visa egen profil',
  'viewCourseInfo': 'Visa kursinfo',
  'viewNotifications': 'Visa aviseringar',
}

export default {
  name: 'PermissionsTab',
  setup() {
    const roles = ROLE_OPTIONS
    const features = FEATURE_OPTIONS

    const rbacPermissions = ALL_RBAC_KEYS.map((key) => ({
      key,
      label: RBAC_LABELS[key] || key,
    }))

    const getCellClass = (roleKey, featureKey) => {
      return PERMISSION_MATRIX[featureKey]?.[roleKey] ? 'granted' : 'denied'
    }

    const getCellLabel = (roleKey, featureKey) => {
      return PERMISSION_MATRIX[featureKey]?.[roleKey] ? 'Ja' : 'Nej'
    }

    const hasRbacPerm = (roleKey, permKey) => {
      return (RBAC_PERMISSIONS[roleKey] || []).includes(permKey)
    }

    return { roles, features, rbacPermissions, getCellClass, getCellLabel, hasRbacPerm }
  },
}
</script>

<style scoped>
.scrollable-view { padding: 20px; max-width: 1200px; margin: 0 auto; }
.page-title { margin-bottom: 20px; }
.card { background: #fff; border-radius: 8px; box-shadow: 0 2px 6px rgba(0,0,0,0.08); padding: 24px; margin-bottom: 20px; }
.card h4 { margin: 0 0 8px; font-size: 16px; }
.hint { font-size: 13px; color: #666; margin-bottom: 16px; }
.table-wrapper { overflow-x: auto; }
.matrix-table { width: 100%; border-collapse: collapse; font-size: 13px; }
.matrix-table th, .matrix-table td { padding: 8px 12px; text-align: center; border: 1px solid #e0e0e0; }
.matrix-table th { background: #f5f5f5; font-weight: 600; position: sticky; top: 0; }
.feature-col { text-align: left; min-width: 200px; }
.role-col { min-width: 90px; }
.feature-label { text-align: left; font-weight: 500; }
.status-cell.granted { background: #e8f5e9; color: #2e7d32; font-weight: 500; }
.status-cell.denied { background: #fafafa; color: #999; }
</style>
