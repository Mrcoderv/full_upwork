# Mindful Learning — Etapp 1 & Etapp 2 UI Walkthrough

## Purpose

This document is the launch and QA guide for the Etapp 1 and Etapp 2 workflows in the Mindful Learning application. It describes the user-visible path, expected result, role requirement, and any dependency that must be configured before commercial launch.

## Current verification status

| Area | Status | Evidence / blocker |
|---|---|---|
| Frontend architecture | Verified | Vue 3, Vite, Vuetify, Vue Router, Axios in `frontend/` |
| Backend architecture | Verified | Express/Mongoose API in `backend/` |
| Authentication and RBAC | Implemented; verify with seeded accounts | Login and role guards are exercised by `e2e/tests/auth.setup.js` and `e2e/tests/milestone3-etapp2.spec.js` |
| Etapp 1 staff workflows | Implemented; UI verification required | Route/component coverage exists across admin, teacher, student, SYV, specialpedagog and coordinator views |
| Etapp 2 course cards/templates | UI verified by automated test coverage | `e2e/tests/milestone3-etapp2.spec.js`, items 30 and 31 |
| Etapp 2 Scrive signing | UI implemented; deployment blocker | Requires Scrive credentials; without them the API correctly returns 503 and keeps the catalog uploaded |
| Etapp 2 calendar planning | UI implemented; automated drag test available | Requires seeded calendar events and writable API access |
| Etapp 2 APL | UI implemented; automated color/status coverage available | Requires course-package data; date-driven auto status depends on configured dates |
| Browser preview in this environment | Blocked | The Vite process started on ports 5173/5174, but the browser sandbox routed to port 3000 and returned `SANDBOX_NOT_LISTENING`; repeat after preview routing is restored |
| Commercial role dashboard | Implemented; browser verification required | `/dashboard` provides role-aware quick actions and preserves existing feature routes |

## Environment prerequisites

1. Start MongoDB on the configured connection string.
2. Start the backend from `backend/` with the repository environment variables.
3. Start the frontend from `frontend/` and expose the Vite port used by the preview.
4. Seed the E2E dataset with `backend/scripts/seedE2EData.js` when running the automated walkthrough.
5. For a full suite, use `API_RATE_LIMIT_MAX=1000` during the test run.
6. Never commit passwords, API keys, Scrive credentials, SMTP credentials, or real student data.

### Seeded demo identities

Use only in local/demo environments:

| Role | Account |
|---|---|
| Administrator | `admin@mindful.se` |
| Teacher | `teacher@mindful.se` |
| Student | `student@mindful.se` |
| Second student | `student2@mindful.se` |
| Third student | `student3@mindful.se` |

Passwords are defined by the seed/setup scripts and must not be copied into production documentation.

## Role and route index

| Role | Main routes |
|---|---|
| All authenticated roles | `/dashboard` for role-aware overview and quick actions |
| Student | `/course-cards`, `/chatbot`, `/messages`, `/kalender`, profile and documents |
| Teacher | `/teacher-dashboard`, `/course-instances`, `/submissions`, `/grade`, `/kalender`, `/messages` |
| Admin | `/admin`, `/course-matching`, `/course-instances`, `/course-templates`, `/course-templates`, `/apl`, `/admin/betygsrapporter`, `/reports`, `/users` |
| System administrator | Admin routes plus permissions, grading configuration, audit and system controls |
| SYV / specialpedagog / coordinator | Role-filtered student, support, APL, document and messaging routes |

## Etapp 1 walkthrough

### 1. Login, profile and permissions

1. Open `/login`.
2. Sign in with a seeded role account.
3. Confirm the role-specific landing page and navigation.
4. Open a student or staff profile from global search.
5. Check General, Study Plan, APL, Documents, Course Archive and Permissions tabs according to role.
6. As an administrator, grant or remove an individual permission and reload the profile.
7. Attempt the same API action as an unauthorized role; it must be rejected server-side, not only hidden in the menu.

Expected result: profile information, study-plan associations, support information, documents and permissions are scoped to the current user and role.

### 2. Search and student management

1. Use the global search with fewer than three characters and confirm validation.
2. Search first, middle and last names, a teacher, a course code/name, and an exact date.
3. Select a result and confirm navigation to the correct student/course/teacher record.
4. From the student study plan, open a course and verify teacher and enrolled students are reachable.

Expected result: search results are relevant, navigable and do not expose unauthorized records.

### 3. Course placement and course packages

1. As admin, open `/course-matching`.
2. Upload a valid admission spreadsheet.
3. Confirm student identity, course/package, start date, end date, teacher, exam information, support and exam location fields.
4. Process the file and inspect validation errors before accepting it.
5. Open `/course-instances` and confirm the created instance and enrollment.
6. Open course-package management, change pace or remove a course, and verify downstream exam/APL lists update.

Expected result: course duration and dependent dates are calculated consistently and admission creates the required enrollment records.

### 4. Withdrawal, revision and inactive students

1. Search for an enrolled student.
2. Change a course status to Withdrawal and confirm the confirmation flow.
3. Verify teacher/admin notifications, exam/APL removal, inactive marking and the inactive list.
4. Reactivate or re-enroll the student and confirm previous information can be reused.
5. Revise study pace or course selection and confirm the new study plan confirmation and notifications.

### 5. APL, grading, exams and documents

1. Open `/apl` as coordinator/admin and confirm status columns, filtering, contact data, dates and contract/CV actions.
2. Open the teacher grading page, choose a grade, provide mandatory justification, and verify validation and persistence.
3. Lock a grade as teacher, then confirm normal editing is blocked and admin unlock/audit controls are available.
4. Configure national exam points and grading scale as system administrator.
5. Open documents, upload/associate an action plan, CV, contract or course document, and confirm it appears on the student record.
6. Open the calendar and confirm final/partial exam events are visible to authorized roles.

## Etapp 2 walkthrough

| Item | UI path and action | Expected result | Data/dependency |
|---|---|---|---|
| 19 Digital signing | `/admin/betygsrapporter` → open PDF → `Skicka för signering` | Uploaded catalog remains visible; signing status updates when Scrive is configured | Scrive credentials and callback |
| 27 Messaging/email copies | `/messages` → open conversation → send reply | Message appears in thread and configured email copy is sent | SMTP/email provider |
| 30 Course templates | `/course-templates` → `Redigera` | Five modules, sections, Delprov and Case chips are editable and saveable | Template + course association |
| 31 Course cards | Student `/course-cards` | Card shows code, status, period, weeks, dates, teacher, modules, activity feed and document actions | Enrollment, course instance and module data |
| 35 Date planning | `/kalender` → drag a grouped exam event | Event and related group move; backend receives move-group update | Seeded calendar event |
| 38 Participants | `/course-instances` → enrollments button | Enrollment modal shows participants, latest login and add-student flow | Course instance with enrollments |
| 40 APL activity | `/apl` | White/blue/yellow/purple/red/green columns and automatic warning badge are visible | CoursePackage and APL end date |
| Chatbot | Student `/chatbot` | Question submits, loading state appears, answer/error/empty states are clear | Chatbot backend/model configuration |
| Certificates | Student `/course-cards` after completion | Study certificate download is enabled only when eligible | Completed enrollment and PDF service |
| Diplomas | Student `/course-cards` | Diploma action shows eligibility message or downloads a PDF | Diploma/PDF service and completion rules |
| Activity feed | Student `/course-cards` → `Uppdatera` | Course messages load, empty state is safe, refresh is available | Activity-feed endpoint |
| Assignment revisions | `/submissions` | Student/teacher can view submission status, feedback and revision thread | Submission and authorization data |
| Reports | `/reports` or admin reports route | Filters, empty states, export and permission boundaries work | Report endpoints and export support |
| Automatic template admission | `/course-matching` → upload spreadsheet | New instance inherits template modules and course card renders chips | Course + active template |

## Browser QA checklist

### Desktop and mobile

- Verify at 1280px and at a narrow mobile viewport.
- Confirm navigation collapses without hiding required actions.
- Confirm tables scroll or transform into readable cards.
- Confirm dialogs fit the viewport and keyboard focus remains visible.

### Accessibility

- Every input has a visible or programmatic label.
- Buttons communicate loading and disabled state.
- Errors are readable and adjacent to the failed action.
- Keyboard users can navigate menus, dialogs, tables and calendar controls.
- Color-coded APL status is accompanied by text, not color alone.

### Security and permissions

- Test each staff route with a student session.
- Test admin-only mutation endpoints directly.
- Confirm documents and PDFs require the correct authorization.
- Confirm logout clears the session and protected routes redirect to login.

### External dependencies

- Scrive: configure credentials and callback, then test send/sign/status/storage.
- Email: configure SMTP/provider and verify notification and copy recipients.
- MongoDB: verify indexes, backups and restore procedure.
- Production: configure HTTPS, deployment-domain CORS, secure cookies, rate limits, monitoring and error reporting.

## Commercial launch gates

- [ ] Production MongoDB and backup/restore procedure validated.
- [ ] HTTPS, secure cookies, CORS allowlist and rate limits configured.
- [ ] SMTP/email delivery and bounce monitoring validated.
- [ ] Scrive credentials, callback and signed-document retention validated.
- [ ] PDF generation and downloads tested with representative records.
- [ ] Seed/demo accounts removed or disabled in production.
- [ ] Admin, systemadmin and coordinator permissions reviewed.
- [ ] Audit logs and operational monitoring enabled.
- [ ] Browser E2E suite passes against production-like data.
- [ ] Mobile, accessibility and error-state walkthrough signed off.

## Sign-off

- Product owner: ____________________ Date: __________
- QA owner: ________________________ Date: __________
- Technical owner: __________________ Date: __________
- Operations/security owner: ________ Date: __________

The application should not be called commercially launch-ready until all launch gates above are checked and the external integration blockers are verified with real deployment credentials.
