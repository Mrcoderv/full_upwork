# Frontend / Backend Gap Analysis

Read-only audit (no code changes). Backend API surface was inventoried from
`backend/src/router/*.js` (mount prefixes in `backend/src/router/router.js`);
frontend usage from `frontend/src/**` (axios `client`, raw `axios`, `fetch`).

Base URL: `/api` (mounted per `router.js`; `/api/uploads`, `/api/stats`,
`/api/analytics`, `/api/inactivity` are their own prefixes).

Legend:
- **A** – backend route has no frontend caller at all.
- **B** – feature is only partially wired into the frontend (some routes used, others not).
- **C** – frontend calls a route that does not exist / is not mounted (broken).

---

## Category C — Frontend calls with no matching backend route (BROKEN)

| Frontend call (file) | What happens | Backend reality |
|---|---|---|
| `POST /course-matching/process-education`<br>— `views/Student/tabs/StudyPlanTab.vue:607`<br>— `components/Teacher/StudentEnrollmentForm.vue:266` | Vite proxy forwards verbatim; Express has no `/api/course-matching/*` → **404** | Route is `POST /api/process-education` (`courseMatchingRoutes.js:51`, mounted at `/api` in `router.js:54`). The `/course-matching/` prefix is not defined anywhere in the backend. |
| `GET /auditlogs/:studentId`<br>— `views/Admin/AuditLogView.vue:117` | **404** | `auditRoutes.js:11` defines `GET /:studentId` (FileAuditLog) but `router.js` never mounts it; also no `/auditlogs` prefix exists. |

---

## Category B — Features only partially exposed

### Students & study plan
Used by frontend:
- `GET /students` (studentRoutes.js:139), `POST /student` (467), `PATCH /students/:id` (894), `PUT /student/:id` (1015), `DELETE /student/:id` (828), `DELETE /students` (863), `GET /student/:id/basic` (731), `GET /students/earnings` (1454), `GET /students/dropouts` (443), `GET /all-programs` (1372), `GET /all-courses` (1402), `GET /all-course-packages` (1387), `PUT /students/:studentId/education/:educationId/status` (84), `PUT /student/:id/education/:courseId/grade` (1417), `POST/DELETE /students/:id/comment` (928/989).
  - Comment POST/DELETE used (`components/APLBoard.vue:674,687,729`); **PUT /students/:id/comment (963) unused** → A/B.
- Not exposed (A):
  - `GET /students/by-teacher/:teacherId` (49) – no UI filters students by teacher.
  - `GET /student/:id` (710) – single-student GET; UI uses `/student-details/:id` or `/student/:id/basic`.
  - `POST /student/:studentId/setprogram` (638) – program assignment done via course-matching instead.
  - `POST /student/:studentId/addcoursepackage` (662) – add course package to student: **no UI**.
  - `DELETE /student/:id/courses/:courseId` (687) – removal goes through enrollment delete instead.
  - `PATCH /student/:studentId/education/:educationId/grade` (1320) – PATCH variant unused; PUT at 1417 is used.

### Courses, packages, programs
- `GET /courses` used (courseRoutes.js:15) in CourseInstances/CourseTemplates/CourseMatching/ManualAddStudent/NavBar.
- Not exposed (A):
  - `GET /courses/:courseId` (27), `GET /courses/id` (44), `GET /course/:id` (60), `POST /course` (76) – course CRUD has no UI.
  - `GET /coursepackages` (coursePackageRoutes.js:12), `GET /coursepackages/:id` (28), `GET /coursepackages/:id/courses` (53) – entirely unused; UI uses `GET /all-course-packages` (studentRoutes.js:1387) for display only.
  - `GET /course-templates/:templateId` (courseTemplateRoutes.js:20) – list/create/update/delete used; single GET unused.

### Grades & grading scale
Used: `GET /students/ungraded` (gradeRoutes.js:34), `GET /students-to-grade` (206), `POST /teacher/save-grade` (481), `POST /teacher/lock-grade` (531), `PUT /admin/unlock-grade` (134), `DELETE /enrollments/:id` (617), `PUT /update-grade/:enrollmentId` (877), `GET/POST/PUT/DELETE /grading-scale*` (938–1030).
- Not exposed (A):
  - `GET /locked-grades` (637) – locked grade list, no UI.
  - `GET /student/:studentId/grades` (715) – per-student grades, no UI.
  - `GET /course-instance/:courseInstanceId/grades` (786) – per-instance grades, no UI.
  - `GET /debug/students-to-grade` (816), `GET /debug/students-past-end-date` (846) – debug only.

### Course instances / matching
Used: `GET /course-instances` (69), `GET /course-instances/mine` (60), `POST /course-instances` (71), `PUT /course-instances/:instanceId` (77), `DELETE /course-instances/all` (85), `DELETE /course-instances/:instanceId` (92), `GET /course-instances/:instanceId/enrollments` (107), `POST /course-instances/:instanceId/add-students` (112), `PUT /enrollments/:enrollmentId/status` (118), `PUT /enrollments/:enrollmentId` (124), `DELETE /students/:studentId/enrollments/:enrollmentId` (130), `PUT /students/:studentId/studyplan-tempo` (136), `GET /course-cards/mine` (144), `GET /course-match` (39, TEST.vue:83), `POST /upload-students` (44).
- Not exposed (A):
  - `GET /course-statistics` (167).
  - `GET/PUT /course-instances/:instanceId/content` (155/160) – instance content editor, no UI.
  - `GET/PUT /course-instances/:instanceId/activity-feed` (177/184) – notice board, no UI.
  - `GET /students/:studentId/course-cards` (150) – only `/course-cards/mine` used.

### Exams & calendar
Used: `POST/GET /exams`, `PUT/DELETE /exams/:id`, `GET /admin/exams`, `PUT /exams/:id/decision`, `GET /exams/student/:studentId`, `POST/GET /calendar-events`, `PUT/DELETE /calendar-events/:id`, `GET /calendar-events/syncable`, `PUT /calendar-events/move-group`, `GET /calendar-events/attendance/:date/:teacherId`, `POST /calendar-events/mark-attendance`, `POST /examtime-location`.
- Not exposed (A):
  - `POST /calendar-events/fix-titles` (1914).
  - `DELETE /calendar-events/cleanup-slutprov` (2032).
  - `PUT /update-exam/:id` (2113).
  - `PUT /mark-attendance/:personalNumber` (2141).
  - `GET /attendance-stats/:studentId` (2199).

### Action plan & form questions
Used: `POST /form-questions` (47), `GET /form-questions/:type` (70), `POST /save-actionplan` (219), `GET /actionplan/:studentId/pdf` (11).
- Not exposed (A):
  - `GET /actionplan/:studentId` (34) – only the PDF variant is used.
  - `PUT /form-questions/:type` (195) – question template edit, no UI.
  - `POST /update-actionplan` (237) – UI uses save-actionplan only.

### Learning / submissions
Used: `GET /learning/instances/:instanceId/modules`, `POST /learning/instances/:instanceId/modules/:moduleNumber/submissions` (CourseCards.vue:222,267), `GET /learning/submissions/pending`, `PUT /learning/submissions/:submissionId/feedback` (Submissions.vue), `GET /learning/instances/:instanceId/report/:studentId` (Reports.vue:227).
- Not exposed (A):
  - `GET /learning/instances/:instanceId/submissions` (34).
  - `GET/POST /learning/submissions/:submissionId/comments` (55/60).
  - `GET /learning/instances/:instanceId/reports` (76) – macro report, no UI.

### Analytics
Used: `GET /api/analytics/filters`, `/revenue`, `/forecast`, `/grades`, `/popular-courses`, `/dropouts` (AnalyticsDashboard.vue:492–570).
- Not exposed (A): `GET /api/analytics/students` (analyticsRoutes.js:20).

### Notifications
Used: `GET /notifications`, `PUT /notifications/:id/resolve`, `PUT /notifications/resolve/:studentId` (notificationRoutes.js:16/179/194; note 179 & 208 are a duplicate pair).
- Not exposed (A): `PUT /notifications/:id/reset` (273).

### Documents & uploads
All used: `POST /documents/upload`, `GET/DELETE /documents/:id`, `POST /upload/xlsxupload`, `POST/GET /uploads/:studentId`, `GET /uploads/download/:fileId`, `DELETE /uploads/:fileId`, `GET /uploads/all/apl`, `DELETE /uploads/cleanup/orphaned`.

### User admin
Used: `POST /reset-password` (userRoutes.js:55), `PUT /users/:userId/roles` (85), `PUT /users/:userId/permissions` (123), `POST /users/:userId/reset-password` (161), `POST /users/create-for-student` (199), `PUT /update-user/:id` (searchRoutes.js:660, AccountTab.vue:1112).
- Not exposed (A):
  - `POST /register` (userRoutes.js:25) – duplicate of `POST /auth/register` (authRoutes.js:37).
  - `GET /students/:studentId/logbook` (282), `POST /students/:studentId/logbook` (302), `GET /student-details/:studentId/logbook` (346) – student logbook feature, no UI.

### Messaging / tasks / meetings / inactivity / grade catalogs / study certificate
Fully used by the frontend (no gaps):
- `messagingRoutes.js` – all 6 routes (MessagingView.vue + api/messaging.js).
- `taskRoutes.js` – all 5 routes (store/store.js).
- `meetingroutes.js` – all 4 routes.
- `inactivityRoutes.js` – all 5 routes (InactivityReport.vue, InactiveStudents.vue).
- `gradeCatalogRoutes.js` – all used except `POST /grade-catalogs/scrive-callback` (335) which is an external webhook.
- `studyCertificateRoutes.js` – used.

---

## Category A — Backend features with zero frontend exposure

1. **Teacher schedule parameters** – entire feature unused
   `teacherScheduleParameterRoutes.js:17/28/39/49/59` (GET list, GET one, POST, PUT, DELETE). No UI exists.
2. **Student logbook** – `userRoutes.js:282/302/346` (GET/POST `/students/:studentId/logbook`, GET `/student-details/:studentId/logbook`).
3. **Course package CRUD** – `coursePackageRoutes.js:12/28/53` (only the flat `/all-course-packages` list is used elsewhere).
4. **Course CRUD** – `courseRoutes.js:27/44/60/76` (only `GET /courses` list is used).
5. **Grades by student/instance, locked grades** – `gradeRoutes.js:637/715/786` (+ debug 816/846).
6. **Course-instance content & activity feed** – `courseMatchingRoutes.js:155/160/177/184`.
7. **Course statistics** – `courseMatchingRoutes.js:167`.
8. **Student course-cards (admin view)** – `courseMatchingRoutes.js:150`.
9. **Action plan JSON / update / question-template edit** – `actionPlanRoutes.js:34/195/237`.
10. **Learning submissions-by-instance, comments, macro reports** – `learningRoutes.js:34/55/60/76`.
11. **Exam/calendar housekeeping** – `examRoutes.js:1914/2032/2113/2141/2199`.
12. **Analytics students metric** – `analyticsRoutes.js:20`.
13. **Notification reset** – `notificationRoutes.js:273`.
14. **`GET /teachers` debug variant** – `teacherRoutes.js:81` (`/debug-teachers`).
15. **`GET /student/:id`** – `studentRoutes.js:710`.
16. **Per-student program/package/course management endpoints** – `studentRoutes.js:638/662/687`, `PATCH .../grade` (1320), `GET /students/by-teacher/:teacherId` (49).

## Dead code in the backend (unmounted route files / shadowed routes)

- **`adminRoutes.js`** – `GET /reports/grades` duplicate of `gradeReportRoutes.js:9`; **never mounted** in `router.js`.
- **`auditRoutes.js`** – `GET /:studentId` (FileAuditLog) **never mounted**; frontend `AuditLogView.vue` expects `GET /api/auditlogs/:studentId` → 404 (see Category C).
- **`educationRoutes.js`** – empty router, **never mounted**.
- **`searchRoutes.js:35` `GET /courses`** – shadowed by `courseRoutes.js:15` `GET /courses` (courseRoutes is mounted first, `router.js:46` vs `:48`); the search-backed `/courses` variant is unreachable.
- **Duplicate route** – `PUT /notifications/:id/resolve` defined twice (`notificationRoutes.js:179` and `:208`).

---

### Summary counts

- Category A (backend-only, no UI): **~40 routes** across 15 feature areas (largest: schedule parameters, logbook, course/course-package CRUD, per-student grade lookups, instance content/feed).
- Category B (partially wired features): students/study plan, courses, course instances, exams/calendar, action plan, learning, analytics, notifications, grades, user admin.
- Category C (broken frontend calls): **2** – `POST /course-matching/process-education` (should be `POST /process-education`) and `GET /auditlogs/:studentId` (auditRoutes not mounted).

Highest-impact fixes if desired (not in scope here): the two Category C call sites, and deciding whether to expose or remove the schedule-parameter / logbook / instance-content features.
