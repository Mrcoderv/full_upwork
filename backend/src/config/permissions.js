/**
 * Permission Matrix Configuration
 * Based on the permission matrix requirements
 */

export const PERMISSION_FEATURES = {
  CALENDAR_FINAL_EXAM: 'calendar_final_exam',
  SEARCH_CONTENT: 'search_content',
  SEARCH_USERS: 'search_users',
  STATISTICS: 'statistics',
  MANAGE_USERS_PERMISSIONS: 'manage_users_permissions',
  HIERARCHY_MANAGEMENT: 'hierarchy_management',
  OWN_SETTINGS: 'own_settings',
  ADD_MUNICIPALITIES_COURSES: 'add_municipalities_courses',
  COURSE_TEMPLATES: 'course_templates',
};

export const ROLES = {
  SYSTEMADMIN: 'systemadmin',
  ADMIN: 'admin',
  TEACHER: 'teacher',
  SYV: 'syv',
  SPECPED: 'specped',
  COORDINATOR: 'coordinator',
  STUDENT: 'student',
};

/**
 * Permission matrix based on the requirements
 * Key: feature, Value: array of roles that have access
 */
export const PERMISSION_MATRIX = {
  [PERMISSION_FEATURES.CALENDAR_FINAL_EXAM]: {
    [ROLES.SYSTEMADMIN]: 'Skapa, redigera, ändra till tidigare version',
    [ROLES.ADMIN]: 'Skapa, redigera',
    [ROLES.TEACHER]: 'Endast titta',
    [ROLES.SYV]: 'Lägga in mö',
    [ROLES.SPECPED]: 'Lägga in mö',
    [ROLES.COORDINATOR]: 'Nej',
    [ROLES.STUDENT]: 'Endast deras egna inbokade slutprov',
  },
  [PERMISSION_FEATURES.SEARCH_CONTENT]: {
    [ROLES.SYSTEMADMIN]: 'Ja',
    [ROLES.ADMIN]: 'Ja',
    [ROLES.TEACHER]: 'Ja',
    [ROLES.SYV]: 'Ja',
    [ROLES.SPECPED]: 'Ja',
    [ROLES.COORDINATOR]: 'Ja',
    [ROLES.STUDENT]: 'Nej',
  },
  [PERMISSION_FEATURES.SEARCH_USERS]: {
    [ROLES.SYSTEMADMIN]: 'Ja',
    [ROLES.ADMIN]: 'Ja',
    [ROLES.TEACHER]: 'Ja',
    [ROLES.SYV]: 'Ja',
    [ROLES.SPECPED]: 'Ja',
    [ROLES.COORDINATOR]: 'Ja',
    [ROLES.STUDENT]: 'Nej',
  },
  [PERMISSION_FEATURES.STATISTICS]: {
    [ROLES.SYSTEMADMIN]: 'Ja',
    [ROLES.ADMIN]: 'Ja',
    [ROLES.TEACHER]: 'Ja',
    [ROLES.SYV]: 'Ja',
    [ROLES.SPECPED]: 'Ja',
    [ROLES.COORDINATOR]: 'Nej',
    [ROLES.STUDENT]: 'Nej',
  },
  [PERMISSION_FEATURES.MANAGE_USERS_PERMISSIONS]: {
    [ROLES.SYSTEMADMIN]: 'Ja',
    [ROLES.ADMIN]: 'Ja',
    [ROLES.TEACHER]: 'Nej',
    [ROLES.SYV]: 'Nej',
    [ROLES.SPECPED]: 'Nej',
    [ROLES.COORDINATOR]: 'Nej',
    [ROLES.STUDENT]: 'Nej',
  },
  [PERMISSION_FEATURES.HIERARCHY_MANAGEMENT]: {
    [ROLES.SYSTEMADMIN]: 'Ja',
    [ROLES.ADMIN]: 'Nej',
    [ROLES.TEACHER]: 'Nej',
    [ROLES.SYV]: 'Nej',
    [ROLES.SPECPED]: 'Nej',
    [ROLES.COORDINATOR]: 'Nej',
    [ROLES.STUDENT]: 'Nej',
  },
  [PERMISSION_FEATURES.OWN_SETTINGS]: {
    [ROLES.SYSTEMADMIN]: 'Ja',
    [ROLES.ADMIN]: 'Ja',
    [ROLES.TEACHER]: 'Ja',
    [ROLES.SYV]: 'Ja',
    [ROLES.SPECPED]: 'Ja',
    [ROLES.COORDINATOR]: 'Ja',
    [ROLES.STUDENT]: 'Ja',
  },
  [PERMISSION_FEATURES.ADD_MUNICIPALITIES_COURSES]: {
    [ROLES.SYSTEMADMIN]: 'Ja',
    [ROLES.ADMIN]: 'Nej',
    [ROLES.TEACHER]: 'Nej',
    [ROLES.SYV]: 'Nej',
    [ROLES.SPECPED]: 'Nej',
    [ROLES.COORDINATOR]: 'Nej',
    [ROLES.STUDENT]: 'Nej',
  },
  [PERMISSION_FEATURES.COURSE_TEMPLATES]: {
    [ROLES.SYSTEMADMIN]: 'Ja',
    [ROLES.ADMIN]: 'Ja',
    [ROLES.TEACHER]: 'Skapa (utvalda lärare)',
    [ROLES.SYV]: 'Nej',
    [ROLES.SPECPED]: 'Nej',
    [ROLES.COORDINATOR]: 'Nej',
    [ROLES.STUDENT]: 'Nej',
  },
};

/**
 * Get permission for a role and feature
 */
export function getPermission(role, feature) {
  return PERMISSION_MATRIX[feature]?.[role] || 'Nej';
}

/**
 * Check if a role has access to a feature
 */
export function hasPermission(role, feature) {
  const permission = getPermission(role, feature);
  return permission !== 'Nej' && permission !== null && permission !== undefined;
}

/**
 * Get all features for a role
 */
export function getFeaturesForRole(role) {
  const features = {};
  for (const [feature, roles] of Object.entries(PERMISSION_MATRIX)) {
    features[feature] = roles[role] || 'Nej';
  }
  return features;
}

/**
 * Feature labels in Swedish
 */
export const FEATURE_LABELS = {
  [PERMISSION_FEATURES.CALENDAR_FINAL_EXAM]: 'Kalender (slutprov)',
  [PERMISSION_FEATURES.SEARCH_CONTENT]: 'Söka efter innehåll',
  [PERMISSION_FEATURES.SEARCH_USERS]: 'Söka efter användare',
  [PERMISSION_FEATURES.STATISTICS]: 'Statistik',
  [PERMISSION_FEATURES.MANAGE_USERS_PERMISSIONS]: 'Hantering av användar och åtkomstbehörigheter',
  [PERMISSION_FEATURES.HIERARCHY_MANAGEMENT]: 'Hierarkihantering?',
  [PERMISSION_FEATURES.OWN_SETTINGS]: 'Egna inställningar (ex profilbild)',
  [PERMISSION_FEATURES.ADD_MUNICIPALITIES_COURSES]: 'Lägga till kommuner, kurser etc',
  [PERMISSION_FEATURES.COURSE_TEMPLATES]: 'Kursmallar (kursmoduler)',
};

/**
 * Role labels in Swedish
 */
export const ROLE_LABELS = {
  [ROLES.SYSTEMADMIN]: 'Systemadministratör',
  [ROLES.ADMIN]: 'Administratör',
  [ROLES.TEACHER]: 'Lärare',
  [ROLES.SYV]: 'SYV',
  [ROLES.SPECPED]: 'Specped.',
  [ROLES.COORDINATOR]: 'Praktiksamordnar',
  [ROLES.STUDENT]: 'Elev',
};

