import { createRouter, createWebHistory } from 'vue-router'
import store from '@/store/store.js'

// Public Views
import Home from '@/views/Home.vue'
import LoginPage from '@/views/Auth/Login.vue'
import ResetPassword from '@/views/Auth/ResetPassword.vue'
import Register from '@/views/Auth/Register.vue'

// Lazy-loaded Admin Views
const ExcelUpload = () => import('@/views/Admin/ExcelUpload.vue')
const AddStudent = () => import('@/views/Admin/AddStudent.vue')
const ManualAddStudent = () => import('@/views/Admin/ManualAddStudent.vue')
const AddTeacher = () => import('@/views/Admin/AddTeacher.vue')
const EducationEditor = () => import('@/views/Admin/EducationEditor.vue')
const ProgramsAndCourses = () => import('@/views/Admin/ProgramsAndCourses.vue')
const ProgramsAndPackages = () => import('@/views/Admin/ProgramsAndPackages.vue')
const AddUser = () => import('@/views/Admin/AddUser.vue')
const EditStudent = () => import('@/views/Admin/EditStudent.vue')
const SearchUser = () => import('@/views/Admin/SearchUser.vue')
const SearchResultDetails = () => import('@/views/Admin/SearchResultDetails.vue')
const EarningsOverview = () => import('@/views/Admin/EarningsOverview.vue')
const CoursesStats = () => import('@/views/Admin/CoursesStats.vue')
const CourseInstances = () => import('@/views/Admin/CourseInstances.vue')
const CourseMatching = () => import('@/views/Admin/CourseMatching.vue')
const StudentEnrollments = () => import('@/views/Admin/StudentEnrollments.vue')
const TeacherManagement = () => import('@/views/Admin/TeacherManagement.vue')
const TEST = () => import('@/views/Admin/TEST.vue')

// Lazy-loaded Teacher Views
const FullCalendar = () => import('@/views/Teacher/ExamCalendar.vue')
const BetygSattning = () => import('@/views/Teacher/BetygSattning.vue')
const ProfilePage = () => import('@/views/Teacher/ProfilePage.vue')
const RoleBasedAppointments = () => import('@/views/Appointments/RoleBasedAppointments.vue')

// Student Views
import StudentDetails from '@/views/Student/StudentDetails.vue'
import APLView from '@/views/APLView.vue'
import GradeStudent from '../views/Admin/gradeStudent.vue'
import ExamForm from '../views/Exams/ExamOverview.vue'
import EducationDetails from '../views/Admin/EducationDetails.vue'

const routes = [
  // Public Routes
  { path: '/', name: 'home', component: Home, meta: { title: 'Home - Mindful Learning' } },
  {
    path: '/unauthorized',
    name: 'Unauthorized',
    component: () => import('@/views/Unauthorized.vue'),
  },
  {
    path: '/login',
    name: 'login',
    component: LoginPage,
    meta: { title: 'Login - Mindful Learning' },
  },
  // { path: '/register', name: 'Register', component: Register, meta: { title: 'Register - Mindful Learning' } }, // Registration disabled
  {
    path: '/reset-password',
    component: ResetPassword,
    meta: { title: 'Reset Password - Mindful Learning' },
  },

  // Admin Dashboard: Move CoursesStats to top
  {
    path: '/stats/courses',
    name: 'CoursesStats',
    component: CoursesStats,
    meta: { title: 'Kursstatistik', role: 'admin' },
  },

  // Admin Routes (Requires "admin" or higher)
  { path: '/lagg-till-anvandare', component: AddUser, meta: { title: 'Add User', role: 'admin' } },
  {
    path: '/lagg-till-larare',
    component: AddTeacher,
    meta: { title: 'Add Teacher', role: 'admin' },
  },
  { path: '/anvandare', component: SearchUser, meta: { title: 'Search Users', role: 'admin' } },
  { path: '/admin/users', component: SearchUser, meta: { title: 'Admin Users', role: 'admin' } },
  {
    path: '/addstudent',
    name: 'AddStudent',
    component: AddStudent,
    meta: { title: 'Add Student', role: 'admin' },
  },
  {
    path: '/manual-add-student',
    name: 'ManualAddStudent',
    component: ManualAddStudent,
    meta: { title: 'Manual Add Student', role: 'admin' },
  },
  // Redirect /detaljer/Elev/:id to /student/:id
  {
    path: '/detaljer/Elev/:id',
    redirect: (to) => {
      // Preserve query parameters if any
      return {
        path: `/student/${to.params.id}`,
        query: to.query
      }
    }
  },
  // Redirect /detaljer/Kursinstans/:id to /education/:id?type=instance
  {
    path: '/detaljer/Kursinstans/:id',
    redirect: (to) => {
      return {
        path: `/education/${to.params.id}`,
        query: { ...to.query, type: 'instance' }
      }
    }
  },
  {
    path: '/detaljer/:type/:id',
    component: SearchResultDetails,
    props: true,
    meta: { title: 'Search Result Details', role: ['teacher', 'syv', 'specped'] },
    beforeEnter: (to, from, next) => {
      // Redirect Elev type to student view
      if (to.params.type === 'Elev' || to.params.type === 'Student') {
        next({
          path: `/student/${to.params.id}`,
          query: to.query
        })
      } else if (to.params.type === 'Kursinstans' || to.params.type === 'CourseInstance') {
        // Redirect Kursinstans to education view
        next({
          path: `/education/${to.params.id}`,
          query: { ...to.query, type: 'instance' }
        })
      } else {
        next()
      }
    }
  },
  {
    path: '/education/:id',
    name: 'EducationDetials',
    component: EducationDetails,
    props: true,
    meta: { title: 'Education Details', role: ['admin', 'syv', 'specped'] },
  },
  {
    path: '/students',
    name: 'Students',
    component: ExcelUpload,
    meta: { title: 'Student List', role: ['admin', 'teacher'] },
  },
  {
    path: '/education',
    name: 'EducationEditor',
    component: EducationEditor,
    meta: { title: 'Education Editor', role: 'admin' },
  },
  {
    path: '/programsandcourses',
    name: 'ProgramsAndCourses',
    component: ProgramsAndCourses,
    meta: { title: 'Programs & Courses', role: 'admin' },
  },
  {
    path: '/programsandpackages',
    component: ProgramsAndPackages,
    meta: { title: 'Programs & Packages', role: 'admin' },
  },
  {
    path: '/editstudent',
    name: 'EditStudent',
    component: EditStudent,
    meta: { title: 'Edit Student', role: 'admin' },
  },
  {
    path: '/earnings',
    name: 'Earnings',
    component: EarningsOverview,
    meta: { title: 'Earnings Overview', role: 'admin' },
  },
  {
    path: '/course-instances',
    name: 'CourseInstances',
    component: CourseInstances,
    meta: { title: 'Course Instances', role: 'admin' },
  },
  {
    path: '/course-matching',
    name: 'CourseMatching',
    component: CourseMatching,
    meta: { title: 'Course Matching', role: 'admin' },
  },
  {
    path: '/student-enrollments',
    name: 'StudentEnrollments',
    component: StudentEnrollments,
    meta: { title: 'Student Enrollments', role: 'admin' },
  },
  {
    path: '/teacher-management',
    name: 'TeacherManagement',
    component: TeacherManagement,
    meta: { title: 'Teacher Management', role: 'admin' },
  },
  {
    path: '/test',
    name: 'TestCourseMatching',
    component: TEST,
    meta: { title: 'Testa kursmatchning', role: 'admin' },
  },
  {
    path: '/admin/betygsrapporter',
    name: 'Betygsrapporter',
    component: () => import('@/views/Admin/Betygsrapporter.vue'),
    meta: { title: 'Betygsrapporter', role: ['admin', 'systemadmin'] },
  },
  {
    path: '/admin/analytics',
    name: 'AnalyticsDashboard',
    component: () => import('@/views/Admin/AnalyticsDashboard.vue'),
    meta: { title: 'Rapporter & Analys', role: ['admin', 'systemadmin'] },
  },

  {
    path: '/provningar',
    name: 'ProvningarCrud',
    component: () => import('@/views/Provningar/ProvningarCrud.vue'),
    meta: { title: 'Hantera Prövningar', role: ['admin', 'systemadmin'], requiresAuth: true }
  },

  // Teacher Routes (Requires "teacher" or higher)
  {
    path: '/larare/kurser',
    name: 'TeacherKurser',
    component: () => import('@/views/Teacher/TeacherKurserPage.vue'),
    meta: { title: 'Kurser', role: 'teacher' }
  },
  {
    path: '/kalender',
    component: FullCalendar,
    meta: { title: 'Kalender', role: ['teacher', 'syv', 'specped', 'admin', 'systemadmin'] },
  },
  {
    path: '/syv/appointments',
    name: 'SyvAppointments',
    component: RoleBasedAppointments,
    meta: { title: 'SYV Samtal', role: 'syv', requiredRoles: ['syv', 'admin', 'systemadmin'] },
  },
  {
    path: '/specped/appointments',
    name: 'SpecpedAppointments',
    component: RoleBasedAppointments,
    meta: { title: 'Specped Samtal', role: 'specped', requiredRoles: ['specped', 'admin', 'systemadmin'] },
  },
  { path: '/betyg', component: BetygSattning, meta: { title: 'Grade Setting', role: 'teacher' } },
  {
    path: '/profile',
    name: 'profile',
    component: ProfilePage,
    meta: { title: 'My Profile', requiresAuth: true },
  },

  // Student Routes
  {
    path: '/student/:id',
    name: 'StudentDetails',
    component: StudentDetails,
    props: true,
    meta: {
      title: 'Student Details',
      role: ['student', 'teacher', 'syv', 'specped', 'admin', 'systemadmin'],
    },
  },

  {
    path: '/examform',
    name: 'ExamForm',
    component: ExamForm,
    meta: { title: 'Exam Form', role: 'student' },
  },

  // Utility Routes (General Access)
  {
    path: '/apl',
    name: 'APLView',
    component: APLView,
    meta: { title: 'APL List', role: ['admin', 'teacher', 'coordinator'] },
  },
  // Remove duplicate /betyg route
  // { path: '/betyg', name: 'Betyg', component: GradeStudent, meta: { title: 'Grade Student', role: 'teacher' } },
]

const router = createRouter({
  history: createWebHistory(),
  routes,
})

// Global Navigation Guards
router.beforeEach((to, from, next) => {
  document.title = to.meta.title || 'Mindful Learning' // Dynamically set page titles

  const isAuthenticated = store.getters.isLoggedIn
  const hasPermission = store.getters.hasPermission

  // Any route that restricts by role implicitly requires being logged in —
  // an anonymous "guest" role should never satisfy a role check, but we
  // enforce it explicitly here too so a route can't be reached just because
  // someone forgot to also set meta.requiresAuth.
  const needsAuth = to.meta.requiresAuth || !!to.meta.role

  if (needsAuth && !isAuthenticated) {
    next('/login') // Redirect unauthenticated users
  } else if (to.meta.role && !hasPermission(to.meta.role)) {
    next('/unauthorized') // Redirect if role is insufficient
  } else {
    next() // Allow access
  }
})

export default router
