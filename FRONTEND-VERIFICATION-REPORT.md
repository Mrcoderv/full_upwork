# FRONTEND VERIFICATION REPORT — MILESTONE 3

**Date:** 2026-08-26
**Branch:** `feat/milestone-3`
**Frontend ESLint:** 0 errors, 0 warnings

---

## Executive Summary

The frontend has **68 active routes** across Admin, Teacher, Student, and shared views. All major features from the MILESTONE-3 checklist have corresponding frontend views, components, and API wiring. However, the codebase contains several notable issues: **4 critical bugs**, multiple dead/stub files, debug styling left in production, and significant code duplication.

| Category | Count |
|----------|-------|
| Total routes | 68 |
| Eagerly loaded components | 10 (+2 dead imports) |
| Lazily loaded components | 43 |
| Admin view files | 58 |
| Teacher view files | 13 |
| Student view files | 14 |
| Shared component files | 16 |
| **Total frontend files audited** | **101+** |

---

## Critical Bugs Found

### 1. NavBar.vue — Debug Styling in Production
**File:** `frontend/src/components/NavBar.vue:1974-1997`
**Severity:** Critical (UI visible to all users)
**Description:** Red overlay and red mobile menu left in production CSS. Lines 1974-1997 override the correct styles via `!important`:
```css
.mobile-overlay { background: rgba(255, 0, 0, 0.8) !important; }
.mobile-menu { background: red !important; border: 5px solid blue !important; }
```
The correct styles exist at lines 1868-1886 but are overridden by these debug rules.

### 2. PermissionsTab.vue — Password Disappears Immediately
**File:** `frontend/src/views/Student/tabs/PermissionsTab.vue:289`
**Severity:** Critical (user can never see created password)
**Description:** After creating a user account, `createdUserPassword` is set then `window.location.reload()` fires immediately. The password flashes briefly then disappears on reload. User never sees it.

### 3. AplTab.vue — File Upload Buttons Broken
**File:** `frontend/src/views/Student/tabs/AplTab.vue:123,140`
**Severity:** Critical (CV and contract upload non-functional)
**Description:** `$refs.cvFileInput` and `$refs.contractFileInput` are used in the template but not returned from `setup()`. In Vue 3 Options API `setup()`, template refs must be explicitly returned. These file upload buttons will fail silently.

### 4. StudentEnrollmentForm.vue — Null Reference After Submit
**File:** `frontend/src/components/Teacher/StudentEnrollmentForm.vue:283`
**Severity:** Critical (runtime crash if APL status is not GRAY)
**Description:** After successful form submission, `selectedStudent.value` is set to `null` (line 271), then `selectedStudent.value._id` is accessed (line 283). This throws `Cannot read properties of null`.

---

## High-Severity Issues

### 5. GeneralTab.vue — Raw HTML Display Bug
**File:** `frontend/src/views/Student/tabs/GeneralTab.vue:849`
**Description:** `formatChangeValue` returns `'<em>tomt</em>'` as a string. Vue renders this as literal text, not italic. Users see `<em>tomt</em>` instead of italicized "tomt".

### 6. ListStudent.vue — Uses Raw fetch() Instead of Shared Client
**File:** `frontend/src/views/Student/ListStudent.vue`
**Description:** Uses `fetch()` with `VITE_API_URL` instead of the shared `@/api/client.js` axios instance. Bypasses auth interceptors, error handling, and base URL proxy. Inconsistent with rest of codebase.

### 7. StudentQuestionBank.vue — Hardcoded /api URL
**File:** `frontend/src/views/Student/StudentQuestionBank.vue:198-199`
**Description:** PDF download uses `window.open('/api/question-bank/...')` with hardcoded prefix instead of the shared client. Will break behind reverse proxies.

### 8. MessageInput.vue — Hardcoded Current User
**File:** `frontend/src/components/MessageInput.vue:28-39`
**Description:** Emitted message hardcodes `senderId: 'currentUser'`, `senderRole: 'user'` instead of reading from auth store.

---

## Admin Views — Issues Found

| # | Severity | File | Issue |
|---|----------|------|-------|
| 9 | Dead code | 5 root-level stubs | `ActionPlanQuestions.vue`, `ActionPlanTab.vue`, `ChangeActionPlan.vue`, `DocumentSection.vue`, `StudyPlan.vue` are stubs (5 lines each). Real implementations live in `SearchTabs/`. |
| 10 | Missing registration | `SearchResultDetails.vue` | Imports `ActionPlanTab` but does NOT register it in `components` — component silently won't render. |
| 11 | Non-standard JS | `EditStudent.vue` | Uses `|>` pipe syntax (not supported in browsers). |
| 12 | Inconsistent API | `AddUser.vue` | Uses older Bootstrap UI pattern, inconsistent with Vuetify. |
| 13 | Options API only | `MeetingModal.vue` | Only admin file using Options API (`export default {}`). |
| 14 | Dead import | `AuditLogView.vue` | `showProfileMenu` ref declared but never used. |
| 15 | Dev/test file | `TEST.vue` | Appears to be a development test page. Should not be in production. |
| 16 | Debug logs | `EarningsOverview.vue:38,40` | `console.log` and `console.error` in production. |
| 17 | Debug logs | `SearchTabs/AccountTab.vue` | 11+ `console.log` statements for permission change debugging. |
| 18 | Debug logs | `SearchTabs/DocumentSection.vue` | 6 `console.log` statements for upload debugging. |
| 19 | Debug logs | `SearchTabs/StudyPlan.vue:78,81` | `console.log('Uppdaterad:...')` and `console.error`. |

---

## Teacher Views — Issues Found

| # | Severity | File | Issue |
|---|----------|------|-------|
| 20 | Dead code | `EnrollSingleCourse.vue` | Unreachable component — tab is commented out in `TeacherKurserPage.vue`. |
| 21 | alert() | `StaffGeneralTab.vue:184,205,220` | Uses `alert('Kunde inte spara profil.')` instead of toast. |
| 22 | Reactivity bug | `ExamCalendar.vue` | `currentTeacherId` set in `mounted()` but never in `data()`. Vue 3 reactivity won't track it. |
| 23 | Code duplication | `ExamCalendar.vue` | Meeting title formatting logic duplicated between `addEventToCalendar()` and `fetchEvents()`. |
| 24 | Dead code | `BetygSattning.vue` | `shouldShowCourse()` defined but never called. `useRouter` imported but unused. |
| 25 | Duplicate empty state | `BetygSattning.vue` | Two "no students" messages render simultaneously and overlap. |
| 26 | Dead CSS | `BetygSattning.vue:435-508` | Native HTML table styles (`.table`, `.btn-success`, `input[type='text']`) — entirely unused since component uses Vuetify. |
| 27 | Global CSS leak | `ExamCalendar.vue` | `<style>` block has NO `scoped` attribute — all `.fc-*` rules leak globally. |
| 28 | Cross-concern import | `StaffDocumentsTab.vue` | Imports `DocumentSection` from `@/views/Admin/SearchTabs/`. |

---

## Student Views — Issues Found

| # | Severity | File | Issue |
|---|----------|------|-------|
| 29 | Null safety | `StudentDetails.vue:67` | `student.enrollments.length` not null-safe. |
| 30 | No trigger element | `StudentDetails.vue:43-47,59-63` | `<v-tooltip>` with `#content` slot but no trigger element — tooltip never appears. |
| 31 | N+1 requests | `CourseCards.vue:396` | `loadLearning` called in a `for` loop without awaiting — fires N parallel requests with no concurrency control. |
| 32 | Date bug | `CourseCards.vue:299` | `formatDate` uses `.toISOString().slice(0, 10)` which converts to UTC — can show wrong dates near midnight. |
| 33 | Dead code | `CoursePlacementWizard.vue:400` | `filterCourses()` defined but does nothing (actual filtering is in `filteredCourses` computed). |
| 34 | Anti-pattern | `StudentQuestionBank.vue:204` | `loadCourses()` called directly in `setup()` instead of `onMounted`. |
| 35 | Rendering bug | `GeneralTab.vue:846` | `formatChangeValue` returns `'<em>tomt</em>'` as raw HTML — renders as literal text. |
| 36 | Duplicate watch | `GeneralTab.vue:667,1040` | Two `watch` on `props.student` doing essentially the same thing. |
| 37 | Stale data risk | `LogbookTab.vue`, `CourseArchiveTab.vue` | No `watch` on `props.student` — won't reload if parent swaps student. |
| 38 | Dead import | `StudyPlanTab.vue:257` | `useRoute` imported but never used. |
| 39 | Fragile reorder | `StudyPlanTab.vue:367` | `handleEducationReorder` sends individual PUT requests in a loop with `setTimeout(100)` delays. |
| 40 | Duplicate utils | Multiple files | `getEducationName`, `getStatusLabel`, `formatDate` copied across 4+ files. Should be extracted to shared composables. |

---

## Shared Components — Issues Found

| # | Severity | File | Issue |
|---|----------|------|-------|
| 41 | Major | `NavBar.vue:1974-1997` | Debug styling (red overlay, red menu, blue border) overrides correct styles via `!important`. |
| 42 | Major | `NavBar.vue` | 2276 lines in a single component — needs decomposition. |
| 43 | Dead code | `FileUploaderDownloader.vue:109-126` | `getFilenameFromDisposition()` defined but never called; logic duplicated inline in `downloadFile()`. |
| 44 | Dead prop | `MessageInput.vue` | `conversationId` prop declared but never used inside component. |
| 45 | Naming violation | `notificationBox.vue` | Filename is camelCase while all other components use PascalCase. Should be `NotificationBox.vue`. |
| 46 | Dead code | `APLFileArchive.vue:77` | `handleSearchInput` defined but never called. |
| 47 | Dead import | `notificationBox.vue` | `toast` imported but never used. |
| 48 | Dead refs | `NavBar.vue:473,480` | `notificationIcon` and `buildVersion` refs declared but never bound in template. |
| 49 | Dead CSS | `NavBar.vue` | Multiple CSS classes defined (`.nav-icon`, `.notification-badge`, `.nav-link`, etc.) but not used in template. |

---

## Feature Coverage Summary

### Admin Features
| Feature | View | Status |
|---------|------|--------|
| User management (CRUD) | `AddUser.vue`, `AddStudent.vue`, `AddTeacher.vue`, `EditUser.vue`, `SearchUser.vue` | ✅ Complete |
| Role management | `EditUser.vue`, `PermissionsTab.vue` | ✅ Complete |
| Program/course management | `ProgramsAndCourses.vue`, `ProgramsAndPackages.vue` | ✅ Complete |
| Course instances | `CourseInstances.vue` | ✅ Complete |
| Student enrollments | `StudentEnrollments.vue` | ✅ Complete |
| Education details | `EducationDetails.vue`, `EducationEditor.vue` | ✅ Complete |
| Grading scales | `GradingScaleAdmin.vue` | ✅ Complete |
| Grade reports | `Betygsrapporter.vue`, `GradeLookups.vue` | ✅ Complete |
| Analytics dashboard | `AnalyticsDashboard.vue` | ✅ Complete |
| Course statistics | `CourseStatisticsAdmin.vue`, `CoursesStats.vue` | ✅ Complete |
| Inactivity report | `InactivityReport.vue` | ✅ Complete |
| Reports | `Reports.vue` | ✅ Complete |
| Course content editor | `CourseContentEditor.vue` | ✅ Complete |
| Learning management | `LearningManagement.vue` | ✅ Complete |
| Student course cards admin | `StudentCourseCardsAdmin.vue` | ✅ Complete |
| Action plan manager | `ActionPlanManager.vue` | ✅ Complete |
| Notification manager | `NotificationManager.vue` | ✅ Complete |
| Calendar housekeeping | `CalendarHousekeeping.vue` | ✅ Complete |
| Activity feed manager | `ActivityFeedManager.vue` | ✅ Complete |
| Chatbot FAQ admin | `FaqManagement.vue` | ✅ Complete |
| Question bank admin | `QuestionBank/QuestionBank.vue` | ✅ Complete |
| Exam generation | `QuestionBank/ExamGeneration.vue` | ✅ Complete |
| Teacher management | `TeacherManagement.vue` | ✅ Complete |
| Inactive students | `InactiveStudents.vue` | ✅ Complete |
| Schedule parameters | `ScheduleParameters.vue` | ✅ Complete |
| Earnings overview | `EarningsOverview.vue` | ✅ Complete |
| Audit logs | `AuditLogView.vue` | ✅ Complete |
| Course matching | `CourseMatching.vue` | ✅ Complete |
| Course templates | `CourseTemplates.vue` | ✅ Complete |
| Statistics | `CoursesStats.vue` | ✅ Complete |
| Provningsmallar | `ProvningarCrud.vue` | ✅ Complete |

### Teacher Features
| Feature | View | Status |
|---------|------|--------|
| Course overview | `TeacherKurserPage.vue` → `CourseOverview.vue` | ✅ Complete |
| Grade setting (Betygsättning) | `BetygSattning.vue` | ✅ Complete |
| Calendar (exam + meetings) | `ExamCalendar.vue` | ✅ Complete |
| Submissions review | `Submissions.vue` | ✅ Complete |
| Grade catalog signing | `TeacherSigningView.vue` | ✅ Complete |
| Staff profile | `StaffProfile.vue` + 4 tabs | ✅ Complete |
| Course student lists | `StaffStudentsPage.vue` + `StaffStudentsTab.vue` | ✅ Complete |
| Document archive | `StaffDocumentsTab.vue` | ✅ Complete |
| Profile editing | `StaffGeneralTab.vue` | ✅ Complete |
| Vacation management | `StaffGeneralTab.vue` | ✅ Complete |
| Chatbot FAQ | `FaqManagement.vue` (shared) | ✅ Complete |
| Question bank | `QuestionBank.vue` (shared) | ✅ Complete |
| Single course enrollment | `EnrollSingleCourse.vue` | ❌ Dead code (commented out) |

### Student Features
| Feature | View | Status |
|---------|------|--------|
| Student dashboard | `Dashboard.vue` | ✅ Complete |
| Course cards / portal | `CourseCards.vue` | ✅ Complete |
| Student details | `StudentDetails.vue` | ✅ Complete |
| General info editing | `GeneralTab.vue` | ✅ Complete |
| Study plan management | `StudyPlanTab.vue` + `CoursePlacementWizard.vue` + `StudyPlanRevisionModal.vue` | ✅ Complete |
| Course archive | `CourseArchiveTab.vue` | ✅ Complete |
| Document management | `DocumentsTab.vue` | ✅ Complete |
| APL management | `AplTab.vue` | ✅ Complete |
| Logbook / kits | `LogbookTab.vue` | ⚠️ Basic (add-only, no edit/delete) |
| Permissions | `PermissionsTab.vue` | ✅ Complete (with bug) |
| Chatbot / study assistant | `ChatbotView.vue` | ✅ Complete |
| Question bank | `StudentQuestionBank.vue` | ✅ Complete |
| Certificates / diplomas | `StudentDetails.vue` + `StudyPlanTab.vue` + `CourseCards.vue` | ✅ Complete |
| Deviations / exceptions | `GeneralTab.vue` | ✅ Complete |
| Comments | `GeneralTab.vue` | ✅ Complete |
| Support contacts | `GeneralTab.vue` | ✅ Complete |
| Dropout management | `GeneralTab.vue` + `StudentDetails.vue` | ✅ Complete |
| Exam accommodations | `GeneralTab.vue` | ✅ Complete |
| Change history | `GeneralTab.vue` + `StudyPlanTab.vue` | ✅ Complete |

### Shared Components
| Component | Status |
|-----------|--------|
| `NavBar.vue` | ✅ Complete (with debug styling bug) |
| `notificationBox.vue` | ✅ Complete |
| `ToastNotification.vue` | ✅ Complete |
| `ErrorBoundary.vue` | ✅ Complete |
| `FileUploaderDownloader.vue` | ✅ Complete |
| `APLBoard.vue` | ✅ Complete |
| `APLFileArchive.vue` | ✅ Complete |
| `MessageBubble.vue` | ✅ Complete |
| `MessageInput.vue` | ✅ Complete (with hardcoded user) |
| `base/ConfirmDialog.vue` | ✅ Complete |
| `base/EmptyState.vue` | ✅ Complete |
| `base/ErrorState.vue` | ✅ Complete |
| `base/PageHeader.vue` | ✅ Complete |
| `base/StatusBadge.vue` | ✅ Complete |
| `Teacher/CourseOverview.vue` | ✅ Complete |
| `Teacher/StudentEnrollmentForm.vue` | ✅ Complete (with null ref bug) |

---

## Code Quality Statistics

| Metric | Count |
|--------|-------|
| Dead/stub files | 7 (`authRoutes.js`, 5 root Admin stubs, `EnrollSingleCourse.vue`) |
| Dead imports | 5 (`Register`, `GradeStudent`, `useRouter`, `useRoute`, `toast`) |
| Dead functions/props | 6 (`shouldShowCourse`, `filterCourses`, `handleSearchInput`, `getFilenameFromDisposition`, `mode` prop, `conversationId` prop) |
| Dead CSS classes | 10+ (NavBar, BetygSattning) |
| Debug `console.log` in production | 30+ instances across 15+ files |
| `alert()` instead of toast | 3 instances (`StaffGeneralTab.vue`) |
| `window.confirm()` instead of ConfirmDialog | 2 instances (`StudentDetails`, `StudyPlanTab`) |
| `window.location.reload()` | 1 instance (`PermissionsTab.vue`) |
| Options API files (inconsistent with codebase) | 7 files |
| Files > 800 lines | 5 (`NavBar.vue:2276`, `GeneralTab.vue:1685`, `StudyPlanTab.vue:1294`, `APLBoard.vue:1264`, `CoursePlacementWizard.vue:987`) |
| Duplicate utility functions | 3 (`getEducationName`, `getStatusLabel`, `formatDate`) copied across 4+ files |

---

## Recommendations

### Immediate (Critical Bugs)
1. **Fix NavBar.vue debug CSS** — Remove lines 1974-1997 (red overlay/menu overrides).
2. **Fix PermissionsTab.vue password display** — Remove `window.location.reload()`, use event bus or emit to parent.
3. **Fix AplTab.vue template refs** — Return `$refs` from `setup()`.
4. **Fix StudentEnrollmentForm.vue null ref** — Don't access `selectedStudent.value._id` after setting it to `null`.

### Short-term (High Impact)
5. **Fix GeneralTab.vue HTML rendering** — Use `v-html` or change to plain text.
6. **Fix ListStudent.vue and StudentQuestionBank.vue API calls** — Use shared `client.js` axios instance.
7. **Fix MessageInput.vue hardcoded user** — Read from auth store.
8. **Remove dead code** — 7 stub files, 5 dead imports, 6 dead functions/props.

### Medium-term (Code Quality)
9. **Extract shared utilities** — `getEducationName`, `getStatusLabel`, `formatDate` should be in a shared composable.
10. **Remove 30+ debug `console.log` statements** — Or guard with `import.meta.env.DEV`.
11. **Replace `alert()` with toast** — 3 instances in `StaffGeneralTab.vue`.
12. **Fix inconsistent component API style** — Standardize on `<script setup>` (Composition API).

### Long-term (Architecture)
13. **Decompose NavBar.vue** — 2276 lines should be split into 5-7 smaller components.
14. **Decompose large files** — `GeneralTab.vue` (1685), `StudyPlanTab.vue` (1294), `APLBoard.vue` (1264).
15. **Add `scoped` to ExamCalendar.vue styles** — Prevent global CSS leakage.

---

*Report generated by verification agents on 2026-08-26. All code references verified against commit `212ce5c` on `feat/milestone-3`.*
