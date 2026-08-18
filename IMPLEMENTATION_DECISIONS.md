# Implementation decisions — remaining Category A routes

Companion to `FRONTEND_BACKEND_GAP_ANALYSIS.md`. Steps 1–3 of the secure-implementation
work are shipped and verified. This document is the written decision list (Step 4) for
every backend route that still has no frontend UI. No code changes accompany this list.

## Already handled by Steps 1–3 (not repeated here)

| Feature | Outcome |
| --- | --- |
| Teacher schedule parameters | Exposed: admin-only CRUD screen `/schedule-parameters`, role-gated + validated + audited |
| Student logbook | Exposed: `Loggbok` tab in `StudentDetails`, staff-gated + audited; also fixed a latent `ReferenceError` (module-level `Student` import missing) |
| Course & course-package CRUD | Exposed: `/programsandcourses`, `/programsandpackages`, admin-gated + validated + audited |
| Grades by student / by instance / locked | Exposed: `/grade-lookups` read-only admin view; the two `/debug/*` grade routes were deleted (were live at `/api`) |
| Category C call sites + dead-code cleanup | Shipped and verified (see `FRONTEND_BACKEND_GAP_ANALYSIS.md` Steps 1–2) |

---

## Remaining Category A routes — decisions

Legend: **(a)** what it does, **(b)** who it is for, **(c)** decision, **(d)** audit requirement if exposed.

### 1. Course-instance content & activity feed
`courseMatchingRoutes.js:155/160/177/184`
- (a) `GET/PUT /course-instances/:instanceId/content` — per-instance course content; `GET/PUT /course-instances/:instanceId/activity-feed` — notice board (staff post, students read).
- (b) Staff (admin/systemadmin/teacher) write; students read.
- (c) **Stay backend-only** — larger feature; natural home is the existing `CourseInstances` admin screen + `CourseCards` student view, but those already cover the standard paths. Schedule as a follow-up feature, not a gap fix.
- (d) If exposed: `PUT` on both routes must add `recordAudit` (`entityType: "CourseInstance"`, actions `content:update` / `activity:post`).

### 2. Course statistics
`courseMatchingRoutes.js:167` — `GET /course-statistics`
- (a) Aggregated course statistics endpoint.
- (b) admin/systemadmin.
- (c) **Delete** — no frontend calls it and the `Rapporter & Analys` module (`/admin/analytics`) already provides the statistics surface.
- (d) n/a (read-only, and it is a delete candidate).

### 3. Student course-cards (admin view)
`courseMatchingRoutes.js:150` — `GET /students/:studentId/course-cards`
- (a) Returns one student's course cards for an admin preview.
- (b) Staff/admin.
- (c) **Stay backend-only** — the admin already sees the same data via `StudentDetails` → `Studieplan`. Low value, no UI planned.
- (d) n/a (read-only).

### 4. Action-plan JSON / question-template edit
`actionPlanRoutes.js:34/195/237`
- (a) `GET /actionplan/:studentId` (latest plan JSON); `PUT /form-questions/:type` (systemadmin edits the question templates); `POST /update-actionplan` (updates an existing plan). The adjacent `POST /form-questions`, `GET /form-questions/:type` and `POST /save-actionplan` **are** used by `SearchTabs/ActionPlanQuestions.vue` and `SearchTabs/ChangeActionPlan.vue` and must stay.
- (b) GET: staff; PUT: systemadmin; POST: teacher/staff.
- (c) `GET /actionplan/:studentId` → **stay backend-only** (the PDF route is what the UI consumes). `PUT /form-questions/:type` → **expose** in the existing `ActionPlanQuestions.vue` admin screen (it is the template-editing counterpart of the already-exposed form-questions flow) — small, self-contained. `POST /update-actionplan` → **stay backend-only** until an "edit plan" flow exists (today the UI creates plans via `save-actionplan`).
- (d) If exposed: `PUT /form-questions/:type` and `POST /update-actionplan` must add `recordAudit`.

### 5. Learning: submissions-by-instance, comments, macro reports
`learningRoutes.js:34/55/60/76`
- (a) `GET /learning/instances/:instanceId/submissions` (per-instance list); `GET/POST /learning/submissions/:submissionId/comments` (per-submission thread); `GET /learning/instances/:instanceId/reports` (macro report for many students).
- (b) Staff (teacher/admin); the pending-submissions route (`/learning/submissions/pending`) **is** used by `Submissions.vue` and stays.
- (c) **Stay backend-only** — the existing `Submissions.vue` covers the teacher's own-pending flow; the instance-level variants are enhancements, not fixes.
- (d) If exposed: `POST .../comments` is a student-data write → add `recordAudit`.

### 6. Exam / calendar housekeeping
`examRoutes.js:1914/2032/2113/2141/2199`
- (a) `POST /calendar-events/fix-titles` and `DELETE /calendar-events/cleanup-slutprov` (one-off bulk repair/cleanup of calendar events); `PUT /update-exam/:id` (exam time/municipality/location on a student); `PUT /mark-attendance/:personalNumber` (attendance); `GET /attendance-stats/:studentId` (attendance stats). Note the separate `POST /calendar-events/mark-attendance` **is** used by `EventModal.vue` and stays.
- (b) admin (repair/cleanup); staff (exam update, attendance).
- (c) **Delete** `fix-titles` and `cleanup-slutprov` — one-off destructive bulk operations with no UI; if ever needed again they can be re-added intentionally. `update-exam`, `mark-attendance`, `attendance-stats` → **stay backend-only** (complement the existing exam screens).
- (d) If kept/exposed: all three write routes must add `recordAudit`.

### 7. Analytics students metric
`analyticsRoutes.js:20` — `GET /analytics/students`
- (a) Student-related analytics metric.
- (b) analytics:read (admin).
- (c) **Delete** — no frontend call; `AnalyticsDashboard.vue` uses the other `/analytics/*` endpoints.
- (d) n/a (read-only, delete candidate).

### 8. Notification reset
`notificationRoutes.js:273` — `PUT /notifications/:id/reset`
- (a) Un-resolves a notification for the current user.
- (b) Any authenticated user (own notifications only).
- (c) **Stay backend-only** — benign, self-service; the existing notification UI has no reset action and none is required.
- (d) If exposed later: add `recordAudit` (touches student notification state).

### 9. Teachers debug variant
`teacherRoutes.js:81` — `GET /debug-teachers`
- (a) Debug dump of teacher→user population.
- (b) teachers:read.
- (c) **Delete** — pure debug, superseded by `GET /teachers` (which the admin screens already use). Same treatment as the grade `/debug/*` routes in Step 3d.
- (d) n/a.

### 10. Single-student fetch
`studentRoutes.js:710` — `GET /student/:id`
- (a) Fetches one student with `commentHistory.seenBy`.
- (b) Staff.
- (c) **Stay backend-only** — `StudentDetails.vue` consumes the richer `GET /student-details/:id`; no second consumer needed.
- (d) n/a (read-only).

### 11. Legacy per-student program/package/course management
`studentRoutes.js:638/662/687/1320` and `GET /students/by-teacher/:teacherId` (49)
- (a) `POST /student/:studentId/setprogram`, `POST /student/:studentId/addcoursepackage`, `DELETE /student/:id/courses/:courseId`, `PATCH /student/:studentId/education/:educationId/grade` — writes to the legacy `student.program` / `coursePackages` / `courses` / `education` arrays; `GET /students/by-teacher/:teacherId` — students belonging to one teacher.
- (b) Staff.
- (c) **Delete** the four legacy write endpoints — the `StudentEnrollment`/`process-education` system (`StudyPlanTab.vue`) is the live mechanism and supersedes these arrays. `GET /students/by-teacher/:teacherId` → **stay backend-only** (no UI calls it; the `Elever` view lists all students).
- (d) All four writes mutate student data → if kept, each must add `recordAudit`.

---

## Summary

- **Exposed this work:** schedule parameters, logbook, course/package CRUD, grade lookups.
- **Delete now (safe):** grade `/debug/*` (done), `course-statistics`, analytics `/students`, `/debug-teachers`, exam `fix-titles` + `cleanup-slutprov`, legacy `setprogram`/`addcoursepackage`/`remove-course`/`education-grade` PATCH.
- **Stay backend-only:** instance content/activity-feed, student course-cards, `GET /actionplan/:studentId`, `POST /update-actionplan`, learning instance/comment/macro routes, exam `update-exam`/`mark-attendance`/`attendance-stats`, notification reset, `GET /student/:id`, `GET /students/by-teacher/:teacherId`.
- **Candidate follow-up expose:** `PUT /form-questions/:type` (into `ActionPlanQuestions.vue`).
- **Rule going forward:** any write route that is ever exposed must pass through `isAuthenticated` + a role gate + `validate`, and call `recordAudit`.
