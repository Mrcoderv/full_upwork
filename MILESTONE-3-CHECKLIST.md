**Milestone 3 — Etapp 1 & Etapp 2 Verification Checklist**  
**Project:** Mindful Learning (/media/mrrv/X/upwork/mindful-new)  
  
**Spec source:** Etapp 1: backend/docs/Etapp 1.docx (Swedish) / backend/docs/Etapp_1_English.pdf · Etapp 2: the Etapp 2 requirement list (items 26–43 of this checklist)  
  
**Verification method:** Static code review of backend (Express/Mongoose, ESM) + frontend (Vue 3/Vuetify). No live browser walkthrough performed; all findings below are code-verified with file:line references.  
![](data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAnEAAAACCAYAAAA3pIp+AAAABmJLR0QA/wD/AP+gvaeTAAAACXBIWXMAAA7EAAAOxAGVKw4bAAAANUlEQVR4nO3OMQ2AABAAsSNBCkJfE1pYGfHAiAU2QtIq6DIzW7UHAMBfnGt1V8fXEwAAXrse4dwF6o2O55YAAAAASUVORK5CYII=)  
**Coverage summary**  
| **Spec** | **Implemented** | **Partially Implemented** | **Not Implemented** | **Total** |   
|-|-|-|-|-|  
| Etapp 1 (items 1–25) | **24** | **1** | **0** | **25** |   
| Etapp 2 (items 26–43) | **0** | **3** | **15** | **18** |   
| **Combined (items 1–43)** | **24** | **4** | **15** | **43** |   

All 43 requirements across both specs were traced against the codebase. **Etapp 1** is fully covered: 24 implemented, 1 partially implemented, none absent. **Etapp 2** is largely unbuilt: **15 of 18 requirements are Not Implemented** (course cards, templates, lessons/assignments, certificates, chat, chatbot, question bank, inactivity automation, outbound email) and 3 are partially implemented (#35 date planning, #38 participants, #40 APL activity). Every item's own entry carries its Status, Location, Rules, and navigation guide (or an explicit "not implemented, no guide" note).  
**Known spec mismatches / gaps (top-level):**  
**Etapp 1 (items 1–25) — partially-implemented and closed gaps:**  
1. Exam decision (Godkänn/Flytta/Neka): ✅ Implemented — teacher + admin/systemadmin can decide (/exams/:id/decision, hasRole includes teacher; teacher scoped to own exams); `move` → status moved + requestedMonth → next month (originalRequestedMonth kept); frontend option added. Online payment gateway is beyond spec scope (spec only requires payment-date entry, which exists).  
2. Prövning "flytta till nästkommande månad": ✅ Implemented — decision `move` (examRoutes.js) sets status `moved` + requestedMonth = next month; getNextMonth() now returns Swedish month name (wraps December→Januari); moved exams re-notified 3–4 weeks before month-end.
3. Annual grading-scale editing by System Admin (e.g. HT24): ✅ Implemented — /grading-scale CRUD + /suggest routes (admin writes, staff reads), GradingScaleAdmin.vue admin UI, BetygSattning.vue NP-poäng column & suggested grade popup.  
4. Scrive signing of grade catalogs (#19): ⚠️ **Partial (built, not live-verified)** — upload-one-by-one + send-for-signing flow is implemented end-to-end (backend Scrive client/routes/model, Betygsrapporter.vue UI, SIGNING_REQUIRED notification) against Scrive Document API v2 with mocked HTTP in tests; remains Partial only until real SCRIVE_* credentials enable a live sandbox round-trip.  
5. Action-plan **PDF export** after completion: ✅ Implemented — dependency-free server-side generator (pdfGenerator.js/actionPlanPdf.js), GET /api/actionplan/:studentId/pdf, "Ladda ner PDF" button in ActionPlanQuestions.vue.  
7. Returning-student **auto-fill on manual creation**: ✅ Implemented — POST /student dedupes by personalNumber/email and auto-fills the existing record (studentRoutes.js:464-538); "Lästa kurser" re-enroll list in StudyPlanTab.vue.
9. Revidering (#13): ✅ Implemented — student+teacher confirmation via `meta.studentUserId` (notificationController.js:246, notificationRoutes.js:25-33); explicit APL-end-date rule via CoursePackage refId dedupe in GET /students (studentRoutes.js:344-354).  
10. Minor: coordinator (Praktiksamordnare) is excluded from the /student/:id route meta roles. frontend/src/router/router.js:276  
11. **Lås betyg (#18): ✅ Implemented** — lock now teacher+admin/systemadmin per spec (ALLOWED_GRADING_ROLES, gradeRoutes.js:31), and every lock creates a `grade_locked` admin notification (gradeRoutes.js:595-606, notificationTypes.js `GRADE_LOCKED`). Unlock stays admin/systemadmin-only (spec).  
**Etapp 2 (items 26–43) — not-implemented and partial gaps:**  
1. **#26 Sollentuna auto-email (Lärteamet):** Not implemented — the app sends no email at all (dead nodemailer transporter, userRoutes.js:24-30).
2. **#27 Internal messaging/chat + email copies + SMS-style:** Not implemented — no chat model, no sockets; no email copies possible.
3. **#28 Chatbot:** Not implemented.
4. **#29 Learning platform (study plan, course cards, lessons, assignments, feedback, progress):** Not implemented — students have no course-card view; only "Prövningar"/"Min profil" in the menu (NavBar.vue:756).
5. **#30 Course templates (5 modules × 2 sections, Module 3 partial exams, Module 5 case study):** Not implemented — Course.js has no content structure.
6. **#31 Course cards:** Not implemented — CourseInstance/StudentEnrollment backbone exists, but no card entity/view.
7. **#32 Inactive-student automation (5-day/14-day):** Not implemented — no last-login tracking, no thresholds, no emails, no email templates.
8. **#33 Course card overview (activity feed, notice board):** Not implemented.
9. **#34 Course card assignments (return/revision, inline/tied comments, threads):** Not implemented — only person-level comments exist.
10. **#35 Date planning:** Partially implemented — exam-date drag & drop + hardcoded per-teacher exam-date rules; no section schedule, no stored teacher parameters.
11. **#36 Course card content (edit components, hide from students):** Not implemented.
12. **#37 Course card reports (per-component ✓/✗, scheduled-date column):** Not implemented.
13. **#38 Participants:** Partially implemented — enrollment add/remove exists; no card-level auto-removal on withdrawal, no last-access column.
14. **#39 APL logbook / kits:** Not implemented.
15. **#40 APL activity colors:** Partially implemented — manual color statuses exist; no automatic behind-schedule coloring.
16. **#41 Study certificate (one-click):** Not implemented — completionCertificate field unused.
17. **#42 Diploma (verify courses + APL approved, signed, emailed):** Not implemented.
18. **#43 Question bank & exam generation:** Not implemented — only action-plan questions exist.
![](data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAnEAAAACCAYAAAA3pIp+AAAABmJLR0QA/wD/AP+gvaeTAAAACXBIWXMAAA7EAAAOxAGVKw4bAAAANklEQVR4nO3OQQmAABRAsSfYxZo/jVEMYQLPJrCCNxG2BFtmZquOAAD4i3Ot7mr/egIAwGvXA4rLBc059ysnAAAAAElFTkSuQmCC)  
**Per-requirement checklist**  
**1. Profiler med olika behörigheter (Elev, Lärare, Admin, Systemadmin, SYV, Specialpedagog, Praktiksamordnare) + personanpassning**  
**Status: ✅ Implemented**  
All 7 profiles exist (coordinator = Praktiksamordnare; plus a tester role):  
- backend/src/config/roles.js — role constants incl. systemadmin/admin/teacher/syv/specped/coordinator/student  
- backend/src/config/permissions.js — feature-based permission keys (e.g. ANALYTICS:READ, SEARCH_CONTENT)  
- backend/src/middleware/auth.js — authenticateUser, hasRole  
- backend/src/router/analyticsRoutes.js:17-23 — per-feature gating via can("analytics:read")  
Per-person customization (spec: "Angelina får ändra i slutprovslistan / Mirsada får tillgång till gemensamt dokument"):  
- frontend/src/views/Student/tabs/PermissionsTab.vue — admin-only per-feature checkbox matrix on each user/student profile (Flik 4).  
**Click path:** Logga in som admin/systemadmin → sök en person → öppna profilen → flik **Behörigheter** → kryssa i/ur funktioner.  
![](data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAnEAAAACCAYAAAA3pIp+AAAABmJLR0QA/wD/AP+gvaeTAAAACXBIWXMAAA7EAAAOxAGVKw4bAAAANUlEQVR4nO3OMQ2AUBBAsUfyNTCi9VwgEA3sWGAjJK2CbjNzVGcAAPzFtapV7V9PAAB47X4AEW4ELQDBN+AAAAAASUVORK5CYII=)  
**2. Sökruta — datum, elev, lärare, kurs; räcker med tre tecken**  
**Status: ✅ Implemented**  
- frontend/src/components/NavBar.vue:43-56 — search types **Alla / Användare / Kurs / Datum**  
- frontend/src/components/NavBar.vue:637 — 3-character minimum enforced client-side  
- frontend/src/components/NavBar.vue:618-627 — date search uses type=Datum&date=YYYY-MM-DD  
- frontend/src/components/NavBar.vue:550-583 — results navigate to /student/:id, /education/:id?type=course|instance, /detaljer/:type/:id  
- backend/src/router/searchRoutes.js:93 — GET /search; students by first/middle/last name; teachers scoped to their own students (studentQuery.teacherId = teacher._id, lines 100-111); date search over StudentEnrollment.startDate/endDate day-range (113-147); 3-char minimum in search logic  
**Click path:** Sökrutan i toppmenyn → välj **Elev/Datum/Lärare/Kurs** → skriv minst 3 tecken → klicka på träff.  
![](data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAnEAAAACCAYAAAA3pIp+AAAABmJLR0QA/wD/AP+gvaeTAAAACXBIWXMAAA7EAAAOxAGVKw4bAAAANklEQVR4nO3OQQmAABRAsSfYxZo/jVEMYQLPJrCCNxG2BFtmZquOAAD4i3Ot7mr/egIAwGvXA4rLBc059ysnAAAAAElFTkSuQmCC)  
**3. Elevprofil — Flik 1 Allmänt (kontaktuppgifter, kommentarer, behov av stöd, avvikelse)**  
**Status: ✅ Implemented**  
- frontend/src/views/Student/tabs/GeneralTab.vue:35-110 — contact info  
- frontend/src/views/Student/tabs/GeneralTab.vue:209-266 — staff comments (add/edit/delete for teacher/admin/systemadmin); canComment 396, canEdit/Delete 502-508  
- Free-text exam accommodations via specialNeeds field  
- Avvikelse: student.dropout shown as **INAKTIV** banner frontend/src/views/Student/StudentDetails.vue:25-28  
- Edit mode admin-only; dropout checkbox GeneralTab.vue:190-200,621-692  
- Backend comments: backend/src/router/studentDetailsRoutes.js:30-45  
**Click path:** Sök elev → **Allmänt**-fliken → redigera uppgifter (admin) / lägg kommentar (lärare/admin).  
![](data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAnEAAAACCAYAAAA3pIp+AAAABmJLR0QA/wD/AP+gvaeTAAAACXBIWXMAAA7EAAAOxAGVKw4bAAAANElEQVR4nO3OQQmAABRAsSdYxKY/jMFMIZ7ECt5E2BJsmZmt2gMA4C+Otbqr8+sJAACvXQ85QgYXd/O+eQAAAABJRU5ErkJggg==)  
**4. Elevprofil — Flik 2 Studieplan (kurser/kurspaket, lärare, status, reviderad)**  
**Status: ✅ Implemented**  
- frontend/src/views/Student/tabs/StudyPlanTab.vue:104,372 — status dropdown values: **Antagen / Betygsatt / Avbrott / Ej påbörjad / Reviderad** (code values incl. inactive → "Ej påbörjad", reviderad styling)  
- Courses/packages + linked teacher shown; course links navigate to /education/:courseInstanceId?type=instance (click-through to course page with all students + teacher, spec §Flik 5 navigation)  
- Backend statuses incl. reviderad in backend/src/controllers/courseMatchingController.js:1513  
**Click path:** Elevprofil → **Studieplan** → klicka på en kurs → utbildningssidan med lärare + alla kopplade elever.  
![](data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAnEAAAACCAYAAAA3pIp+AAAABmJLR0QA/wD/AP+gvaeTAAAACXBIWXMAAA7EAAAOxAGVKw4bAAAANUlEQVR4nO3OQQ2AQBAAsSHhiQI0IWp9ngBsYIEfIWkVdJuZs5oAAPiLe6+O6vp6AgDAa+sBhYwEOqBD7p8AAAAASUVORK5CYII=)  
**5. Elevprofil — Flik 3 APL (bara för kurspaketselever, inte personal)**  
**Status: ✅ Implemented**  
- Tab is conditionally rendered: only for CoursePackage students, students with aplStatusHistory/non-null aplStatus, or manually added APL IDs. frontend/src/views/Student/StudentDetails.vue:128-261 (tabs defined 121-126, push at 230)  
- Not shown when searching staff (staff profile ≠ student tabs)  
- AplTab.vue — APL status + history  
- Model: backend/src/models/Student.js:94-104 (aplStatus enum + aplStatusHistory)  
**Click path:** Elevprofil → **APL**-fliken (visas endast för kurspaketselever).  
![](data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAnEAAAACCAYAAAA3pIp+AAAABmJLR0QA/wD/AP+gvaeTAAAACXBIWXMAAA7EAAAOxAGVKw4bAAAANklEQVR4nO3OMQ2AABAAsSNBCkLfFDZwwIgHRiywEZJWQZeZ2ao9AAD+4lyruzq+ngAA8Nr1AOH0BedHjjlfAAAAAElFTkSuQmCC)  
**6. Elevprofil — Flik 4 Behörigheter (se/ändra behörigheter)**  
**Status: ✅ Implemented**  
- frontend/src/views/Student/tabs/PermissionsTab.vue — admin-only, per-feature checkbox matrix (per-person permission customization)  
- Combined with backend/src/config/permissions.js feature keys  
**Click path:** Profil → **Behörigheter** → markera/avmarkera funktioner (admin/systemadmin).  
![](data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAnEAAAACCAYAAAA3pIp+AAAABmJLR0QA/wD/AP+gvaeTAAAACXBIWXMAAA7EAAAOxAGVKw4bAAAAM0lEQVR4nO3KsQ0AIRAEsUW6Qij1KvnevhMSYmKQ7GiCGd09k3wBAOAVf+2o4wYAwE1qAdYuAy151mgcAAAAAElFTkSuQmCC)  
**7. Elevprofil — Flik 5 Dokument (handlingsplan, CV, APL-kontrakt osv.)**  
**Status: ✅ Implemented**  
- frontend/src/views/Student/tabs/DocumentsTab.vue + frontend/src/components/FileUploaderDownloader.vue  
- Per-student GridFS upload/download/delete: backend/src/router/uploadRoutes.js:185+ (POST /:studentId), 247 (GET), 262 (GET download), 285 (DELETE); checkStudentAccess guards  
- APL contracts archive: frontend/src/components/APLFileArchive.vue  
**Click path:** Elevprofil → **Dokument** → Ladda upp / ladda ner filer.  
![](data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAnEAAAACCAYAAAA3pIp+AAAABmJLR0QA/wD/AP+gvaeTAAAACXBIWXMAAA7EAAAOxAGVKw4bAAAANUlEQVR4nO3OQQ2AQBAAsSHhiQI0IWp9ngBsYIEfIWkVdJuZs5oAAPiLe6+O6vp6AgDAa+sBhYwEOqBD7p8AAAAASUVORK5CYII=)  
**8. Elevprofil — Flik 6 Kursarkiv (slutprov, delprov etc.)**  
**Status: ✅ Implemented**  
- frontend/src/views/Student/tabs/CourseArchiveTab.vue — course-related files (slutprov/delprov)  
**Click path:** Elevprofil → **Kursarkiv**.  
![](data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAnEAAAACCAYAAAA3pIp+AAAABmJLR0QA/wD/AP+gvaeTAAAACXBIWXMAAA7EAAAOxAGVKw4bAAAANklEQVR4nO3OQQmAABRAsSfYxZo/kSGMYQLPJrCCNxG2BFtmZquOAAD4i3Ot7mr/egIAwGvXA4qrBdGuSdJuAAAAAElFTkSuQmCC)  
**9. Kurser — samlad sida + "lägg till" kursplacering (datahämtning Alvis)**  
**Status: ✅ Implemented**  
- /course-instances → frontend/src/views/Admin/CourseInstances.vue (all course instances + enrollments)  
- /education → frontend/src/views/Admin/EducationEditor.vue (courses/packages admin)  
- Add placement: /addstudent (AddStudent.vue), /manual-add-student (ManualAddStudent.vue)  
- Alvis data import: frontend/src/views/Admin/ExcelUpload.vue + backend/src/controllers/studentController.js:148 (uploadXlsx) — XLSX parsing via parseStudentExcel.js, strict course matching, pre-validation abort on unmatched courses (lines 237-355)  
**Click path:** **Kurser**-menyn → **Lägg till (+)** → manuell inmatning eller uppladdning av XLSX från Alvis.  
![](data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAnEAAAACCAYAAAA3pIp+AAAABmJLR0QA/wD/AP+gvaeTAAAACXBIWXMAAA7EAAAOxAGVKw4bAAAAM0lEQVR4nO3KsQ0AIRAEsUW6Qij1KvnevhMSYmKQ7GiCGd09k3wBAOAVf+2o4wYAwE1qAdYuAy151mgcAAAAAElFTkSuQmCC)  
**10. Kursplacering — Kurs (startdatum, 5/10/20 v, personuppgifter, slutprov auto, stöd, plats/distans)**  
**Status: ✅ Implemented**  
Implemented:  
- frontend/src/views/Admin/ManualAddStudent.vue:252-280 — study-pace radios **5v (100%) / 10v (50%) / 20v (25%)** with auto-calculated end date  
- Student name/personnummer/telefon/mejl fields  
- Support-need checkbox (routes to specialNeeds)  
- Slutprov date auto-calculated: backend/src/utils/courseMatchingService.js:29,346 (getWednesdayOfWeek) + CourseInstance pre-save hook  
- **Plats/distans auto-set from municipality:** Upplands Bro → remote (Distans), all other municipalities → on-site (Plats). Frontend: ManualAddStudent.vue:315-342 (radio group, admin can override) + :812-820 (getDefaultExamMode) + :1010-1015 (watcher on municipality) + :953 (payload sends examMode). Backend enforcement: courseMatchingService.js:44-55 (getDefaultExamMode static helper, normalized "upplandsbro" match) applied at all 5 enrollment-construction sites (:350,606,742,984,1080); studentRoutes.js:455-458 passes { needsSupport, examMode } from POST /student.  
**Click path:** **Kurser** → **Lägg till (+)** → kryssa i **Kurs** → välj startdatum → välj 5/10/20 veckor → fyll personuppgifter → välj slutprovsdag → kryssa i "behov av stöd" → välj plats/distans.  
![](data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAnEAAAACCAYAAAA3pIp+AAAABmJLR0QA/wD/AP+gvaeTAAAACXBIWXMAAA7EAAAOxAGVKw4bAAAANklEQVR4nO3OYQ1AABSAwc8mi5wvkwZyCKCAACr4Z7a7BLfMzFYdAQDwF+da3dX+9QQAgNeuB6feBdUJcyS2AAAAAElFTkSuQmCC)  
**11. Kursplacering — Kurspaket (studietakt 100/50/25 %, fullt/reviderat paket, auto datum, auto APL, tidigare praktik)**  
**Status: ✅ Implemented**  
Implemented:  
- frontend/src/views/Admin/ManualAddStudent.vue — studietakt 100/50/25 %  
- Auto start/end dates for package courses: backend/src/utils/courseMatchingService.js (per-course date derivation, e.g. 5-week grouped extent 521)  
- Student auto-registered in APL list (CoursePackage students get aplStatus: "GRAY" default: studentController.js:531, parseStudentExcel.js:170)  
- Auto enrollment + duplicate suppression (courseMatchingService.js:299-309,545-553)  
- **Revidera bort kurser via checklista:** frontend ManualAddStudent.vue — when a package is selected each course gets a checkbox in "Revidera kurspaket" (:226); unchecking a course sends excludedCourseIds on the CoursePackage education entry (submit flow :1002-1011). Backend skips excluded courses during package expansion and emits a package_revised warning: courseMatchingService.js:481-504 (excludedCourseIds filter + filtered packageCourses loop + revised warning message). Grouping of 2.5-week courses still works on the filtered list.  
- **"Eleven har redan utfört praktik via annan skola" + intyg upload → Dokument-fliken:** checkbox priorAplCompleted + intyg file input in ManualAddStudent.vue ("Tidigare praktik", :430-455). On submit the intyg is uploaded to POST /documents/upload (type GENERAL, so it shows in Dokument-fliken) and linked via priorAplIntygDocId (PUT /student/:id) — ManualAddStudent.vue:1053,1065-1076. Student model fields: backend/src/models/Student.js:101-106 (priorAplCompleted, priorAplIntygDocId). Route whitelists: studentRoutes.js (create :434, update :937-938).  
**Click path:** **Kurser** → **Lägg till (+)** → välj program → välj **Kurspaket** → (valfritt) bocka ur kurser i **"Revidera kurspaket"** → välj startdatum → välj studietakt → fyll personuppgifter → (valfritt) kryssa i **"Eleven har redan utfört praktik via annan skola"** + ladda upp intyg → spara → kontrollera APL-listan (GRAY) och elevens Dokument-flik.  
![](data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAnEAAAACCAYAAAA3pIp+AAAABmJLR0QA/wD/AP+gvaeTAAAACXBIWXMAAA7EAAAOxAGVKw4bAAAANUlEQVR4nO3OQQmAABRAsSd49m4tA8nPaQJjWMGbCFuCLTOzV2cAAPzFvVZbdXw9AQDgtesBorcEPwOKyvQAAAAASUVORK5CYII=)  
**12. Avbrott (bekräftelse till lärare, bort från slutprov/APL, markering/inaktiv lista)**  
**Status: ✅ Implemented**  
Implemented:  
- Set/reactivate dropout (admin+): backend/src/router/studentDetailsRoutes.js:61-74; backend/src/controllers/studentDetailsController.js:486 (setStudentDropout) + 836 (removeStudentDropout)  
- **Automatisk bekräftelse till lärare:** dropout notification created to teacher (type dropout) studentDetailsController.js:706-772; notification type in backend/src/controllers/notificationTypes.js:19  
- **Markering:** INAKTIV banner StudentDetails.vue:25-28; dropout checkbox GeneralTab.vue:190-200  
- **APL-listan:** dropout students filtered out — frontend/src/components/APLBoard.vue:344, Modals/AddMeetingModal.vue:165, Modals/AddEventModal.vue:145  
- **Bort från slutprovslistan (durable):** setStudentDropout now removes the student from persisted calendar slutprov events (`$pull` on extendedProps.students) and deletes now-empty events — studentDetailsController.js:640-677; read endpoints also filter dropout (examRoutes.js:891 syncable, :2121 attendance); removeStudentDropout re-syncs enrollment-based + finalExamDate events (studentDetailsController.js:901-926, via utils/calendarEventSync.js)  
- **Separat "inaktiva elever"-lista:** backend GET /students/dropouts (admin+, studentRoutes.js:416-438) + frontend view frontend/src/views/Admin/InactiveStudents.vue (search, reactivate via DELETE /student-details/:id/dropout), route /inaktiva-elever (router.js) + menu item "Inaktiva elever" (NavBar.vue)  
- Change-history log for admin audit studentDetailsController.js:521-528  
- Tests: backend/tests/unit/studentDetailsController.test.js (calendar event cleanup + re-sync after reactivation)  
**Click path:** Sök elev → **Allmänt** → kryssa i **"Markera som avbrott"** (admin) → lärare får notis → elev tas bort från slutprov/APL → återaktivera via **Inaktiva elever**-listan eller elevkortet.  
![](data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAnEAAAACCAYAAAA3pIp+AAAABmJLR0QA/wD/AP+gvaeTAAAACXBIWXMAAA7EAAAOxAGVKw4bAAAANElEQVR4nO3OQQmAABRAsad4EjtY9fewnUms4E2ELcGWmTmrKwAA/uLeqrU6vp4AAPDa/gDzWAM6QQXRdAAAAABJRU5ErkJggg==)  
**13. Revidering (planera om studieplan, auto-uppdatera slutprov/APL, bekräftelse till lärare+elev)**  
**Status: ✅ Implemented**  
- "Reviderad" status in StudyPlanTab dropdown + styling; reviderad valid enrollment status (courseMatchingController.js:1513)  
- Study-plan change notification infrastructure: backend/src/controllers/notificationController.js:246 (sendStudyplanChangedNotification)  
- **Confirmation to teacher AND student end-to-end:** the notification is addressed to the enrollment's teacherId (staff bell) and to the student's login account via `meta.studentUserId` (Student ↔ User matched by email, notificationController.js:246-276). Students see their own notifications only (GET /notifications student-role filter, notificationRoutes.js:31-38; student bell enabled in NavBar.vue:403). Revision messages include the new course dates ("Studieplan reviderad för … Nya datum: …").  
- **Explicit APL-end-date rule:** GET /students dedupes CoursePackage education entries by package id (studentRoutes.js:344-354) so the APL board's end date always reflects the current enrollment dates — a revised course end date flows straight into the APL period (single source of truth = StudentEnrollment).  
- Slutprov/APL lists are enrollment-driven (calendar sync utils/calendarEventSync.js, APL board) so they update when enrollments change  
- Tests: notificationController.test.js (studentUserId + revision-message cases), notificationRoutes.test.js (student-only filter), studentRoutes.test.js (CoursePackage dedupe keeps enrollment end date)
![](data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAnEAAAACCAYAAAA3pIp+AAAABmJLR0QA/wD/AP+gvaeTAAAACXBIWXMAAA7EAAAOxAGVKw4bAAAANklEQVR4nO3OQQmAABRAsSfYxZo/kC1sYQLPJrCCNxG2BFtmZquOAAD4i3Ot7mr/egIAwGvXA4qzBdC53Vr8AAAAAElFTkSuQmCC)  
**14. Inaktiva elever / återkommande elev (auto-fyll uppgifter, lista lästa kurser)**  
**Status: ✅ Implemented**  
Implemented:  
- Reactivation: removeStudentDropout (studentDetailsRoutes.js:69-74) + GeneralTab.vue checkbox "Ta bort avbrott-status"  
- XLSX upload merges existing students by email (upsert + education merge): backend/src/controllers/studentController.js:192-193,540-545  
- Enrollment dedupe/merge on re-registration: courseMatchingService.js:299-309  
- **Auto-fyll vid manuell inmatning:** POST /student checks personalNumber/email via Student.findOne ($or), and if the student already exists it auto-fills/merges the submitted details into the existing record, clears the dropout flag and registers the new courses — returns HTTP 200 with `alreadyExists: true` instead of creating a duplicate (studentRoutes.js:464-538). ManualAddStudent.vue reports "Eleven fanns redan — uppgifterna är uppdaterade och nya kurser har registrerats."  
- **Lista på elevens lästa kurser med klick-för-ny-antagning:** StudyPlanTab.vue "Lästa kurser" section lists completed enrollments (status `completed`) with a **"Ny antagning"** button per course that re-enrolls via POST /course-matching/process-education (dates follow the last scheduled course at the current study tempo)  
- Tests: studentRoutes.test.js (auto-fill by personalNumber, email match, re-register courses, alreadyExists response) + frontend StudyPlanTab.test.js (completed-course list + re-enroll)
![](data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAnEAAAACCAYAAAA3pIp+AAAABmJLR0QA/wD/AP+gvaeTAAAACXBIWXMAAA7EAAAOxAGVKw4bAAAAM0lEQVR4nO3OUQmAABBAsaeI2MKqV8RyJrGCfyJsCbbMzFldAQDwF/dWrdXx9QQAgNf2B/NkAzRb7P0YAAAAAElFTkSuQmCC)  
**15. APL-listan (flikar, 6 färger + filter, auto-röd)**  
**Status: ✅ Implemented**  
- frontend/src/views/APLView.vue + frontend/src/components/APLBoard.vue (color summary counts + filter) + APLFileArchive.vue (kontrakt-filer = flik 3)  
- 6 färger: backend/src/models/Student.js:94-104 — ["GRAY","BLUE","YELLOW","PURPLE","RED","GREEN"] (Grå/Blå/Gul/Lila/Röd/Grön)  
- Status change with history: studentDetailsController.js:182-191, studentRoutes.js:789-803  
- **Auto-RÖD ("Röd – Varning, snart slut"):** backend/src/utils/aplAutoStatus.js derives an APL period (earliest start / latest end across CoursePackage education entries) and computes an effective status — `aplStatus` becomes `"RED"` with `aplStatusAuto: true` and `aplWeeksRemaining` (ceil) when the end date is within `APL_AUTO_RED_WEEKS` (default 3, env override `APL_AUTO_RED_WEEKS`). Attached in GET /students (studentRoutes.js) and GET /student-details/:id (studentDetailsController.js) as aplStatus/aplStatusStored/aplStatusAuto/aplWeeksRemaining/aplStartDate/aplEndDate; stored status + history are never mutated (manual change still takes precedence)  
- Frontend: APLBoard.vue AUTO-badge on auto-red student cards + APL-period row in the detail dialog; AplTab.vue (elevens APL-flik) shows APL-period dates, weeks remaining and an "Auto-röd" note  
- Tests: aplAutoStatus.test.js (unit), studentRoutes.test.js + studentDetailsController.test.js (auto-RED integration), frontend AplTab.test.js (auto-röd note + APL-period display)  
**Click path:** Menyn **APL** (/apl, admin/lärare/praktiksamordnare) → filtrera per färg → öppna elevens APL-flik.  
![](data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAnEAAAACCAYAAAA3pIp+AAAABmJLR0QA/wD/AP+gvaeTAAAACXBIWXMAAA7EAAAOxAGVKw4bAAAANklEQVR4nO3OQQmAABRAsSfYxZo/jVEMYQLPJrCCNxG2BFtmZquOAAD4i3Ot7mr/egIAwGvXA4rLBc059ysnAAAAAElFTkSuQmCC)  
**16. Betygssättning (auto-påminnelse, sida per lärare, A–F, motivering, kommentarer, obligatoriskt)**  
**Status: ✅ Implemented**  
- /betyg → frontend/src/views/Teacher/BetygSattning.vue — teacher gets their own students-to-grade list  
- Backend: /students/ungraded (gradeRoutes.js:28), /students-to-grade (gradeRoutes.js:172, teacher scoping 182-189), /teacher/save-grade (gradeRoutes.js:445, saves grade, reason (motivation), comments, npScore)  
- Grade select A–F + free-text motivation + comments; grade is required (obligatoriskt) — BetygSattning.vue save flow  
- Auto-påminnelse: evaluateGradingStatusAndNotify (gradeRoutes.js:33,485) + notificationTypes.js:22FINAL_EXAM_SOON (14 dagar)  
**Click path:** Lärare → **Betyg** → lista över elever som behöver betygsättas → välj A–F → fyll motivering/kommentarer → Spara.  
![](data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAnEAAAACCAYAAAA3pIp+AAAABmJLR0QA/wD/AP+gvaeTAAAACXBIWXMAAA7EAAAOxAGVKw4bAAAALUlEQVR4nO3OQQ0AIAwEsAMlSJ0UrOFkGngRklZBR1WtJDsAAPzizNcDAADuNcKwAyU+nb+5AAAAAElFTkSuQmCC)  
**17. Nationella prov (Engelska/Svenska/Matematik poäng) + betygsskala ändras årligen (systemadmin)**  
**Status: ✅ Implemented**  
Implemented:  
- National-test points stored and rendered: `npScore` input field in `BetygSattning.vue` for national courses (Engelska/Svenska/Matematik); persisted in `StudentEnrollment.nationalTestPoints` and legacy education `npScore` (`gradeRoutes.js`)  
- Annual grading scale CRUD per term and subject: `/grading-scale` backend endpoints (`gradeRoutes.js`) gated for systemadmin/admin; `GradingScaleAdmin.vue` UI (`/admin/betygsskala`) with threshold chips (A ≥ min, etc.)  
- Auto-suggested grade: `GET /grading-scale/suggest` auto-calculates suggested grade based on national test points, term, and subject; "Visa förslag"-button in `BetygSattning.vue`  
**Click path:** Admin/systemadmin → **Betygsskala** (/admin/betygsskala) → Lägg till/redigera betygsskala för termin (HT24/VT25) och ämne. Lärare → **Betyg** → ange NP-poäng → klicka "Visa förslag".  
![](data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAnEAAAACCAYAAAA3pIp+AAAABmJLR0QA/wD/AP+gvaeTAAAACXBIWXMAAA7EAAAOxAGVKw4bAAAANklEQVR4nO3OMQ2AABAAsSNBACPiUML0NpGACyywEZJWQZeZ2aszAAD+4l6rrTq+ngAA8Nr1AL/SBEZwuCSwAAAAAElFTkSuQmCC)  
**18. Lås/upplås betyg (lärare låser, admin meddelas, systemadmin/admin låser upp)**  
**Status: ✅ Implemented**  
Implemented:  
- **Lås av läraren själv (spec-korrekt):** /teacher/lock-grade (gradeRoutes.js:531-613) gated by ALLOWED_GRADING_ROLES = systemadmin/admin/teacher (gradeRoutes.js:31) — the teacher who graded the student locks the grade (spec: "När lärarna betygsatt och är klara, måste läraren låsa betygen"). Admin/systemadmin can still lock on a teacher's behalf (spec workflow: admin enters grades into the municipality system after being notified). The committed admin-only restriction had no documented rationale and contradicted the route name + spec; it is resolved in favour of the spec.
- **Admin notified on every lock:** successful lock creates exactly one `grade_locked` notification addressed to admins — gradeRoutes.js:595-606; type registered as `GRADE_LOCKED` in backend/src/controllers/notificationTypes.js (SIGNING_REQUIRED was not reused — it means "teacher must sign the grade catalog" (Scrive, item #19) and is a different event). Notification contains student, course, locker identity+role, and createdAt; meta carries studentId/courseId/enrollmentId/teacherId (same shape as grade_unlocked). Lock route returns 400 without notifying when no student/enrollment is supplied (gradeRoutes.js:589-593).
- Unlock (admin/systemadmin only, per spec "Behöver en lärare låsa upp ett betyg så kan systemadmin/admin göra det åt dem"): gradeRoutes.js:133-203 (/admin/unlock-grade); `grade_unlocked` notification created (191-196; type registered in notificationTypes.js).
- Locked grades view: /locked-grades (gradeRoutes.js:781)
- Update blocked when locked: gradeRoutes.js:886-888 (PUT /update-grade/:enrollmentId → 403 "Grade is locked and cannot be modified")
- Frontend: lock checkbox exposed to teachers in BetygSattning.vue (toggleLock, :387-414, toast "Meddelande skickat till administratörer"); admin/systemadmin lock via gradeStudent.vue (:230-233); both post to /teacher/lock-grade. Unlock UI admin-only.
- Admin bell: GET /notifications shows all non-dropout notifications to admin/systemadmin (notificationRoutes.js:41-53) and notificationBox.vue renders the message; teachers/students are filtered out via teacher/meta.studentUserId, so the lock notification reaches admins only.
- Tests: backend/tests/unit/gradeRoutes.test.js — teacher lock → exactly one grade_locked notification with correct type/content/meta; systemadmin lock still notifies; legacy student.education lock path notifies; missing-args → 400 + no notification; admin unlock → grade_unlocked unchanged; non-grading role rejected (403); update-blocked-when-locked still 403.
**Click path:** Lärare → **Betyg** (/betyg) → fyll betyg → kryssa **Lås** → läraren får bekräftelse och **admin/systemadmin får notis** (klocka). Admin/systemadmin kan även låsa från Admin → Betygssättning. Upplåsning: admin/systemadmin via /admin/unlock-grade. Låsta betyg ses under /locked-grades.  
![](data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAnEAAAACCAYAAAA3pIp+AAAABmJLR0QA/wD/AP+gvaeTAAAACXBIWXMAAA7EAAAOxAGVKw4bAAAANElEQVR4nO3OQQmAABRAsSdYxKa/i8WMIR7ECt5E2BJsmZmt2gMA4C+Otbqr8+sJAACvXQ85PAYartXEogAAAABJRU5ErkJggg==)  
**19. Signering av betygskataloger (Scrive — ladda upp PDF:er en och en, skicka för digital signering)**  
**Status: ⚠️ Partial** (integration byggd mot Scrive Document API v2 — kvarstår: riktiga SCRIVE_*-uppgifter + live round-trip)  
Implemented:  
- Scrive info alert (sign on scrive.com, lock after signing): frontend/src/views/Admin/gradeStudent.vue:7-14  
- **Scrive-klient:** backend/src/services/scriveClient.js — OAuth 1.0 PLAINTEXT-auth (SCRIVE_APITOKEN/APISECRET/ACCESSTOKEN/ACCESSECRET, `oauth_signature="${apisecret}&${accesssecret}"`), POST /api/v2/documents/new (multipart PDF), /documents/{id}/update (signatory-JSON + api_callback_url), /documents/{id}/start, GET /documents/{id}/get, /getpersonaltoken; status-mappning DocumentStatus → lokal (preparation→uploaded, pending/awaiting_start→pending, closed→closed, …) och SCRIVE_TERMINAL_STATUSES (förhindrar återskick).
- **Data & API:** backend/src/models/GradeCatalog.js (status uploaded/sending/pending/closed/canceled/timedout/rejected/document_error/failed; locked/lockedAt/signedAt vid signering); backend/src/router/gradeCatalogRoutes.js — GET /grade-catalogs (lista utan PDF-bytes), POST /grade-catalogs (PDF en i taget, admin/systemadmin, PDF-only + 10MB), POST /grade-catalogs/:id/send (skapar doc i Scrive → update med lärare som signatory → start → NOTIS), POST /grade-catalogs/:id/refresh (poll Scrive; closed → katalog låst), POST /grade-catalogs/scrive-callback (webhook från Scrive, uppdaterar status + låser vid closed), GET /grade-catalogs/:id (PDF som base64).
- **SIGNING_REQUIRED kopplad (notificationTypes.js:25):** skapas i gradeCatalogRoutes.js vid send, adresserad till läraren (`teacher` = Teacher._id → syns i lärarens klocka via notificationRoutes.js:56-72) och synlig för admins (notificationRoutes.js:41-53 visar alla icke-dropout); meta.url → /admin/betygsrapporter. Notification.meta utökad med catalogId/documentId.
- **Frontend:** frontend/src/views/Admin/Betygsrapporter.vue omskriven från tom stub — uppladdning en PDF i taget (+ elevsökning, kurs, lärar-e-post), statuslista, "Skicka för signering", "Uppdatera status", PDF-nedladdning, toasts via useToast (client.js /api). Befintlig route /admin/betygsrapporter (router.js:222-227) + NavBar-länk.
- **Konfiguration:** backend/.env.example — SCRIVE_API_BASE_URL (default api-testbed.scrive.com), SCRIVE_APITOKEN/APISECRET/ACCESSTOKEN/ACCESSECRET, SCRIVE_CALLBACK_URL. Utan credentials → send/refresh svarar 503 med tydligt meddelande.
- **Felhantering:** Scrive-fel → status failed + errorMessage + 502; återskick tillåts från failed/uploaded; 409 om redan skickad (terminal); 400 om ingen signeringsmottagare (läraren hämtas annars via student → teacher); callback kvitterar okänt document_id med 2xx (Scrive slutar retry:a); mongoSanitize globalt.
- **Tests:** backend/tests/unit/scriveClient.test.js (auth-header, samtliga endpoints, status-mappning, isScriveConfigured) + backend/tests/unit/gradeCatalogRoutes.test.js (upload/send/refresh/callback/list/detail, NOTIS-typ+meta, felbanor 400/404/409/500/502/503, roll 403). Backend totalt 1001/1001 (58 filer); frontend 154/154; lint 0 errors (endast befintliga warnings).
Gap:  
- **Scrive live/sandbox round-trip ej verifierat** — inga SCRIVE_*-uppgifter finns i repot eller .env (placeholder-kreds enligt beslut). Kräver: hämta personal access credentials (POST /api/v2/getpersonaltoken), sätta SCRIVE_* i backend/.env.development, skicka en testkatalog mot api-testbed.scrive.com och verifiera status via refresh/callback (SCRIVE_CALLBACK_URL måste vara publikt nåbar).
- Notis-länk-etikett i notificationBox.vue är generisk ("Se elev") — gäller även katalog-notisen; kosmetisk förbättring.  
![](data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAnEAAAACCAYAAAA3pIp+AAAABmJLR0QA/wD/AP+gvaeTAAAACXBIWXMAAA7EAAAOxAGVKw4bAAAANUlEQVR4nO3OQQmAABRAsSd49m4v6wg/pwmMYQVvImwJtszMXp0BAPAX91pt1fH1BACA164Hoq8EQMMPmF8AAAAASUVORK5CYII=)  
**20. Handlingsplan (F → påminnelse kvar tills ifylld, frågeformulär, PDF, systemadmin ändrar frågorna)**  
**Status: ✅ Implemented**  
Implemented:  
- F in grade triggers persistent action_plan_required notification (resolved only when plan filled): gradeRoutes.js:469-482; createNotification/resolveNotification (notificationController.js:67,95)  
- Questionnaire: backend/src/router/actionPlanRoutes.js — POST /form-questions, GET/PUT /form-questions/:type, POST /save-actionplan, POST /update-actionplan; Swedish default questions (teacherName/date/reason); ActionPlan model has locked field  
- Frontend: SearchTabs/ActionPlanTab.vue, ActionPlanQuestions.vue, ChangeActionPlan.vue (admin edit)  
- Systemadmin can edit questions: actionPlanRoutes.js:157 (PUT /form-questions/:type)  
- **PDF export implemented ("När den är ifylld skapas en pdf som går att hämta på sidan")**: dependency-free server-side PDF generator backend/src/services/pdfGenerator.js (pure JS, Helvetica/WinAnsi, A4) + backend/src/services/actionPlanPdf.js (plan → PDF). New routes GET /api/actionplan/:studentId (latest plan JSON, 404 om ingen) and GET /api/actionplan/:studentId/pdf (application/pdf download, 404 om ingen). Frontend "Ladda ner PDF"-knapp i SearchTabs/ActionPlanQuestions.vue (blob-download via client.get). Verified: 1018/1018 backend tests, thresholds met (Stmts 79.92 / Branch 66.83 / Func 84.39 / Line 80.46); PDF validates (pdfinfo 1 page, pdftotext extracts Swedish text); frontend 154/154, vite build OK, lint 0 errors. Note: saved plan currently only stores allowedActionPlanFields (studentName/meeting-radio answers are not persisted) — PDF reflects stored fields.
![](data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAnEAAAACCAYAAAA3pIp+AAAABmJLR0QA/wD/AP+gvaeTAAAACXBIWXMAAA7EAAAOxAGVKw4bAAAANElEQVR4nO3OQQmAABRAsSdYxKY/jbnMIJ7FCt5E2BJsmZmt2gMA4C+Otbqr8+sJAACvXQ85TgYRMv3/cwAAAABJRU5ErkJggg==)  
**21. Prövningar (bokning, intresselista, notis 3–4 v före månadsslut, Godkänn/Flytta/Neka, material, betalning, auto till slutprov)**  
**Status: ✅ Implemented**  
Implemented:  
- Student booking form: /examform → frontend/src/views/Exams/ExamOverview.vue (student-facing); registration fields per spec (namn, personnummer, telefon, mejl, adress, kurs, månad, kommun, lärare) in ExamForm.vue  
- Interest list + admin table: ExamAdminTable.vue (filter name/month/status; options Intresse/Godkänd/Flyttad/Nekad)  
- **Lärare-notis 3–4 veckor före månadsslut**: examRoutes.js (diffDays 21–30 → Notification to teacher); now covers both `intresse` AND `moved` exams so moved students get re-notified next month; dedupe via Notification.examId + unresolved (`resolvedByUsers` empty); examId added to Notification schema  
- Decision endpoint: /exams/:id/decision (examRoutes.js) — **teacher + admin/systemadmin** may decide (spec: "Läraren ska kunna göra olika val"); teacher scoped to own exams (403 otherwise). accept auto-creates/upserts student + sets finalExamDate (15th of month via calculateExamDate); **`move` case implemented**: status `moved`, requestedMonth → next month (Swedish name via getNextMonth, wraps December→Januari), originalRequestedMonth preserved; deny sets denied. Decision marks the exam's notification resolved for the deciding user (Notification.updateMany examId → $addToSet resolvedByUsers)  
- Material pickup (SVE/SVA) + payment date fields: Student model exam/attendedExam/paidExamFee (whitelist studentRoutes.js:434)  
Notes:  
- **Online payment gateway** is beyond spec scope — the spec only requires entering the date the student paid (paymentDate/paidExamFee, implemented). Verified: backend 1027/1027 tests, thresholds met (Stmts 80.06 / Branch 66.96 / Func 84.53 / Line 80.59); frontend 154/154, vite build OK; lint 0 errors (only pre-existing warnings).
![](data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAnEAAAACCAYAAAA3pIp+AAAABmJLR0QA/wD/AP+gvaeTAAAACXBIWXMAAA7EAAAOxAGVKw4bAAAANklEQVR4nO3OQQmAABRAsSeYxZw/lVeDGMACBrCCNxG2BFtmZquOAAD4i3Ot7mr/egIAwGvXA6fOBdd+dKAKAAAAAElFTkSuQmCC)  
**22. Slutprovssida / kalendern (månadsvis, lärarens färg, lista elever, närvaro, anpassning, lärare ändrar datum, admin väljer plats/rum)**  
**Status: ✅ Implemented**  
- /kalender → frontend/src/views/Teacher/ExamCalendar.vue (calendar, one month at a time)  
- Slutprov events auto-synced from enrollments: /calendar-events/syncable (examRoutes.js:872) + backend/src/utils/calendarEventSync.js  
- Teacher own color: Teacher.colorCode (backend/src/utils/teacherService.js:54-66)  
- Click teacher name → student list + attendance checkboxes: frontend/src/views/Modals/EventModal.vue; attendance endpoint /mark-attendance/:personalNumber (examRoutes.js:2160)  
- Teacher can move own events: /calendar-events/move-group allows **admin OR responsible teacher** (examRoutes.js:330-349); PUT /calendar-events/:id (examRoutes.js:723)  
- Admin/systemadmin choose place + room: EventModal.vue:188-189 — **Sollentuna: 308, 310, lilla rummet, Aniara, Kung Agnes** · **Akalla: Vision, Hässja, Arkarli, 316** (9 rooms; spec says 7 total, code lists 9 — minor numeric mismatch, all named rooms exist)  
- Accommodations (specialNeeds — mer skrivtid/dator/enskilt) editable on student card, visible on student profile  
**Click path:** **Kalender** (lärare/syv/specped/admin) → klicka på lärarens datum/färg → lista med elever + närvaro-kryss + anpassningar. Admin: välj kommun (Akalla/Sollentuna) + rum.  
![](data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAnEAAAACCAYAAAA3pIp+AAAABmJLR0QA/wD/AP+gvaeTAAAACXBIWXMAAA7EAAAOxAGVKw4bAAAANUlEQVR4nO3OQQmAABRAsSd4EKxgBjP+Asa0hxW8ibAl2DIzR3UFAMBf3Gu1VefXEwAAXtsfSqwDVbgKngwAAAAASUVORK5CYII=)  
**23. SYV (se elev, boka möten i kalender, info i elevkort, revidera studieplaner)**  
**Status: ✅ Implemented**  
- /syv/appointments → frontend/src/views/Appointments/RoleBasedAppointments.vue (meta role: 'syv')  
- Meetings: frontend/src/views/Modals/AddMeetingModal.vue, MeetingModal.vue; backend /meetings CRUD backend/src/router/meetingroutes.js  
- Student card info + study-plan revision: syv included in staff roles for student routes (studentRoutes.jsALLOWED_STAFF_ROLES, includes syv); /student/:id route meta includes syv (router.js:276)  
**Click path:** SYV → **SYV Samtal** (/syv/appointments) → boka möte → sök elev → redigera elevkort/studieplan.  
![](data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAnEAAAACCAYAAAA3pIp+AAAABmJLR0QA/wD/AP+gvaeTAAAACXBIWXMAAA7EAAAOxAGVKw4bAAAANklEQVR4nO3OQQmAABRAsSeYxZw/lieLGMACBrCCNxG2BFtmZquOAAD4i3Ot7mr/egIAwGvXA6fGBdgoVMwYAAAAAElFTkSuQmCC)  
**24. Specialpedagog (se elev, boka möten, info i elevkort, anpassningar för slutprov)**  
**Status: ✅ Implemented**  
- /specped/appointments → RoleBasedAppointments.vue (meta role: 'specped')  
- Meetings + student card: same infrastructure as SYV  
- Exam accommodations: specialNeeds free-text field on student (editable; used for slutprovs-anpassningar), specped in ALLOWED_STAFF_ROLES and /student/:id meta  
**Click path:** Specped → **Specped Samtal** (/specped/appointments) → boka möte → öppna elev → lägg anpassningar.  
![](data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAnEAAAACCAYAAAA3pIp+AAAABmJLR0QA/wD/AP+gvaeTAAAACXBIWXMAAA7EAAAOxAGVKw4bAAAALUlEQVR4nO3OQQ0AIAwEsAMlSJ0UrOFkGngRklZBR1WtJDsAAPzizNcDAADuNcKwAyU+nb+5AAAAAElFTkSuQmCC)  
**25. Ekonomi och rapporter (intäkter per kommun/kurs, månadsprognos, elevstatistik, avbrott, F-betyg, betygskurva)**  
**Status: ✅ Implemented**  
- /admin/analytics → frontend/src/views/Admin/AnalyticsDashboard.vue (meta ['admin','systemadmin'], router.js:223-227)  
- Backend: backend/src/router/analyticsRoutes.js:17-23 — 7 endpoints, all gated can("analytics:read") (admin/systemadmin only per roles.js:20,38 + authorization.js:33-36)  
- Service logic backend/src/services/analyticsService.js:  
 - **Intäkter per kommun + kurs** after grading (graded vs forecast): 95-200  
 - **Månadsprognos intäkter** (trailing 3-month avg): 209-261  
 - **Elevstatistik** by month/teacher/course/termin (VT–HT): 267-382  
 - **Avbrottsstatistik**: /dropouts  
 - **F-betyg + betygskurva** A–E/F distribution per course/teacher/municipality: 384, 400-529  
- Client-side PDF export (jspdf + autotable): AnalyticsDashboard.vue (intakter-per-kommun.pdf, betygsfordelning.pdf, avbrottsrapport.pdf)  
**Click path:** Admin/systemadmin → **Rapporter & Analys** (/admin/analytics) → välj flik (Intäkter/Prognos/Elever/Betyg/Utbildning/Avbrott) → filtrera → exportera PDF.  
![](data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAnEAAAACCAYAAAA3pIp+AAAABmJLR0QA/wD/AP+gvaeTAAAACXBIWXMAAA7EAAAOxAGVKw4bAAAANklEQVR4nO3OQQmAABRAsSfYxZo/jVEMYQLPJrCCNxG2BFtmZquOAAD4i3Ot7mr/egIAwGvXA4rLBc059ysnAAAAAElFTkSuQmCC)  
**Gap Summary (all Partial items, consolidated)**  
| **#** | **Requirement** | **Missing piece** | **Evidence** |   
|-|-|-|-|  
| 11 | Kursplacering Kurspaket | Package revision-by-checklist; "redan utfört praktik" checkbox + intyg upload | ✅ Implemented — ManualAddStudent.vue (reviderings-checklista + prior-APL/intyg), courseMatchingService.js (excludedCourseIds), Student.js (priorAplCompleted/priorAplIntygDocId) |   
| 12 | Avbrott | Remove from slutprov list on dropout; dedicated inactive-students list page | ✅ Implemented — setStudentDropout $pulls student from persisted slutprov calendar events + deletes empty events (studentDetailsController.js:640-677); GET /students/dropouts (studentRoutes.js) + InactiveStudents.vue (/inaktiva-elever) |   
| 13 | Revidering | Confirmation to student (not just staff); explicit APL-end-date update rule | ✅ Implemented — `meta.studentUserId` + student-only GET /notifications filter (notificationRoutes.js:31-38, NavBar.vue:403); CoursePackage refId dedupe keeps APL dates enrollment-driven (studentRoutes.js:344-354) |   
| 14 | Inaktiva elever | Auto-fill on manual create (personalNumber dedupe); "lästa kurser" re-enroll list | ✅ Implemented — POST /student dedupes by personalNumber/email and auto-fills the existing record (studentRoutes.js:464-538, `alreadyExists` response); "Lästa kurser" + "Ny antagning" re-enroll in StudyPlanTab.vue |   
| 15 | APL | Auto-RÖD when X weeks remain | aplAutoStatus.js: effective RED when ≤3 weeks left (env APL_AUTO_RED_WEEKS), GET /students + GET /student-details/:id |   
| 17 | Nationella prov + skala | NP poäng input UI; annual grading-scale admin UI (HT24) | ✅ Implemented — BetygSattning.vue NP-poäng input column + grade suggest button; GradingScaleAdmin.vue (/admin/betygsskala) CRUD for per-year grading scales; /grading-scale API routes |   
| 18 | Lås betyg | Admin notification when grades locked; lock permission per spec | ✅ Implemented — /teacher/lock-grade allows teacher + admin/systemadmin (ALLOWED_GRADING_ROLES, gradeRoutes.js:31); every lock creates a `grade_locked` admin notification (gradeRoutes.js:595-606, notificationTypes.js `GRADE_LOCKED`); unlock admin/systemadmin-only with `grade_unlocked` |   
| 19 | Scrive | PDF upload one-by-one + send-for-signing | Betygsrapporter.vue empty stub |   
| 20 | Handlingsplan | PDF created when filled | ✅ Implemented — GET /api/actionplan/:studentId (+ /pdf) server-generated via pdfGenerator.js/actionPlanPdf.js (no deps); "Ladda ner PDF" button in ActionPlanQuestions.vue |   |
| 21 | Prövningar | Teacher (not admin) decides; "flytta till nästa månad"; online payment | ✅ Implemented — teacher + admin/systemadmin decide (/exams/:id/decision, teacher scoped to own exams); Flytta till nästa månad (status moved, requestedMonth→next, originalRequestedMonth kept); re-notification for moved exams; UI option in ExamAdminTable.vue; payment-date entry per spec |   |
  
**Notes / cross-cutting**  
- **Roles coverage:** all 7 spec profiles present. Minor: coordinator (Praktiksamordnare) missing from /student/:id route meta (router.js:276).  
- **PDF:** client-side jspdf (AnalyticsDashboard); backend action-plan PDF is generated dependency-free via backend/src/services/pdfGenerator.js (no backend PDF libs needed).  
- **App not launched** during this review — behavioral claims are from code inspection; a live ./launch.sh + browser walkthrough is recommended to validate click-paths end-to-end.  
- **Run checks:**make citest (tests) and make format (linter) per AGENTS.md.  
![](data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAnEAAAACCAYAAAA3pIp+AAAABmJLR0QA/wD/AP+gvaeTAAAACXBIWXMAAA7EAAAOxAGVKw4bAAAANUlEQVR4nO3OQQmAABRAsSd49m4tA8nPaQJjWMGbCFuCLTOzV2cAAPzFvVZbdXw9AQDgtesBorcEPwOKyvQAAAAASUVORK5CYII=)  
**MILESTONE 3 — Etapp 2 (Learning platform, email/chat, course cards, automation)**  
**Spec source:** Etapp 2 requirement list (items 26–43 of this checklist).  
  
**Verification method:** Static code review of backend + frontend, same as Etapp 1. No browser/computer-use tooling was available in this session, so all findings are code-verified with file:line references; where a feature does not exist, the code absence is cited rather than a navigation guide being invented.  
**Coverage summary — Etapp 2**  
| **Status** | **Count** |   
|-|-|  
| Implemented | **0** |   
| Partially Implemented | **3** (35, 38, 40) |   
| Not Implemented | **15** |   
| **Total** | **18/18** |   
  
Etapp 2 is almost entirely **not yet built**. The learning-platform layer (course cards, templates, lessons, assignments, certificates, chat, chatbot, question bank, inactivity automation, outbound email) does not exist in the codebase. The only partial overlaps are: manual final-exam-date scheduling + hardcoded per-teacher exam-date rules (#35), course-instance participant management (#38), and the manual APL color-status board (#40).  
**Combined totals (Etapp 1 + Etapp 2):** 22 Implemented / 6 Partially Implemented / 15 Not Implemented = **43/43 requirements covered**.  
![](data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAnEAAAACCAYAAAA3pIp+AAAABmJLR0QA/wD/AP+gvaeTAAAACXBIWXMAAA7EAAAOxAGVKw4bAAAAM0lEQVR4nO3OMQ0AIAwAwZKQ6kBqjSAOJywYYCIkd9OP36pqRMQMAAB+sfqJfLoBAMCN3NYoAzBA+QG0AAAAAElFTkSuQmCC)  
**Gap Summary — Etapp 2**  
| **#** | **Requirement** | **Missing piece** | **Evidence** |   
|-|-|-|-|  
| 26 | Sollentuna auto-email (Lärteamet) | No outbound email at all | transporter defined but never sendMail-called; only ref is backend/src/router/userRoutes.js:24-30,260 (comment "send the password via email" = not done) |   
| 27 | Internal messaging/chat + email copies + SMS-style | No chat/messaging, no sockets, no email | no socket.io/WebSocket/pusher anywhere; only in-app Notification model |   
| 28 | Chatbot | No chatbot / doc-search bot | no matches for chatbot/bot in app code |   
| 29 | Learning platform | No course cards/lessons/assignments/feedback/progress | no models/views; student menu only has "Prövningar" (NavBar.vue:756) |   
| 30 | Course templates (5×2 modules/sections) | No template/module/section model | Course.js = name/code/points/extent only; isCourseTemplate is a search flag (searchRoutes.js:483) |   
| 31 | Course cards | No card model/UI | CourseInstance+StudentEnrollment backbone exists but no cards |   
| 32 | Inactive-student automation (5/14 days) | No last-login tracking, no scheduler, no emails, no email templates | grep lastLogin/inactivity: no matches |   
| 33 | Course card overview (activity feed, notice board, submissions, section position) | Nothing | no activity feed / anslagstavla code |   
| 34 | Course card assignments (return/revision, inline comments, threads) | Nothing | staff comment history is on the student card, not assignment-tied |   
| 35 | Date planning (section dates 2 wks pre-start, teacher parameters) | Only exam-date scheduling exists; no section schedule, no stored teacher parameters | Teacher.js has no parameter fields; slutprovDateCalculator.js is hardcoded |   
| 36 | Content (edit components, hide from students) | Nothing | no card components |   
| 37 | Reports (per-component completion, ✓/✗, scheduled-date column) | Nothing | completionCertificate field unused (StudentEnrollment.js:138); analytics are macro-level only |   
| 38 | Participants (add/remove, auto-remove on withdrawal, last-access) | Enrollment add/remove exists; no auto-remove, no last-access | CourseInstances.vue add/delete enrollment; dropout keeps enrollments |   
| 39 | APL logbook / kits | No kits, no student home page | no kit/loggbok code |   
| 40 | APL activity (auto behind-schedule colors) | Manual color statuses only | APLBoard.vue:324-331 manual status labels; no schedule-derived color |   
| 41 | Study certificate (one-click) | Nothing | completionCertificate never used |   
| 42 | Diploma (package end, verify courses+APL approved, signed, emailed) | Nothing | no diploma/certificate flow |   
| 43 | Question bank & exam generation | Nothing | FormQuestion model is action-plan only |   
  
![](data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAnEAAAACCAYAAAA3pIp+AAAABmJLR0QA/wD/AP+gvaeTAAAACXBIWXMAAA7EAAAOxAGVKw4bAAAANUlEQVR4nO3OMQ2AABAAsSNhZscaUpheJwqQgQU2QtIq6DIze3UGAMBf3Gu1VcfXEwAAXrseopcEQ2uoYnwAAAAASUVORK5CYII=)  
**26. Sollentuna auto-email — "Lärteamet" (Learning Team) after admission**  
**Status: ❌ Not Implemented**  
**Location:**  
- Email infrastructure placeholder: backend/src/router/userRoutes.js:24-30 — nodemailer.createTransport (Gmail, newmindful.development@gmail.com, process.env.GOOGLE_PWD) is **configured but never used** — zero transporter.sendMail() calls exist in the repo.  
- Student admission (the event that should trigger the email): backend/src/router/studentRoutes.js:420 (POST /student), backend/src/controllers/studentController.js:148 (uploadXlsx).  
- Municipality field where "Sollentuna" appears: backend/src/models/Student.js:62.  
**How to reach it:** Not implemented — there is no email feature and no Lärteamet content to reach. The only email-adjacent code (userRoutes.js) is a dead transporter.  
**Rules:**  
- No trigger exists: student creation does not branch on municipality.type === "Sollentuna" (grep for Sollentuna outside enum/pricing lists: no match).  
- No "admission email" exists to sequence after, and no Lärteamet/support-service text anywhere (grep "Lärteamet"/"larteamet": 0).  
- Hard requirement: any future implementation needs (a) an SMTP/transporter used in a service, (b) a post-create hook on POST /student/uploadXlsx, (c) municipality filter, (d) the Lärteamet template.  
![](data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAnEAAAACCAYAAAA3pIp+AAAABmJLR0QA/wD/AP+gvaeTAAAACXBIWXMAAA7EAAAOxAGVKw4bAAAANUlEQVR4nO3OMQ2AUBBAsUfyRTCh9VRgEBGsWGAjJK2CbjNzVGcAAPzFtapV7V9PAAB47X4AEWgEMAY9+pUAAAAASUVORK5CYII=)  
**27. Internal messaging/chat (staff–staff, school–student, email copies, SMS-style exploration)**  
**Status: ❌ Not Implemented**  
**Location:**  
- Only "message"-adjacent system is the staff **notification** center: backend/src/models/Notification.js (in-app, fields: type, message, teacher, resolvedByUsers, meta), surfaced by frontend/src/components/notificationBox.vue.  
- Student card staff **comments**: backend/src/models/Student.js:111-132 (commentHistory) + studentDetailsRoutes.js:30-45. This is a one-way staff→student card annotation, not messaging.  
- Meetings (SYV/specped): backend/src/models/Meeting.js + meetingroutes.js.  
**How to reach it:** Not implemented — there is no chat/messaging UI. The closest live feature is the notification bell (notis) in the top menu, which shows system notifications to staff, and the "Kommentarer" section on a student's Allmänt tab.  
**Rules:**  
- No chat/message/conversation model, no WebSocket/socket.io/Pusher/FCM service worker (grep across backend/src, frontend/src, both package.json: 0).  
- No email copies can exist because no email is sent anywhere (see #26).  
- No SMS/push exploration code exists.  
![](data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAnEAAAACCAYAAAA3pIp+AAAABmJLR0QA/wD/AP+gvaeTAAAACXBIWXMAAA7EAAAOxAGVKw4bAAAANklEQVR4nO3OMQ2AABAAsSPBCj7fFRYQwYwEZiywEZJWQZeZ2ao9AAD+4lyruzq+ngAA8Nr1AMTJBeJDClAyAAAAAElFTkSuQmCC)  
**28. Chatbot (answers common student questions from existing documentation)**  
**Status: ❌ Not Implemented**  
**Location:** none. Grep for chatbot, bot, knowledge-base search: no implementation (the only bot hits are e.g. dist/github folders and unrelated text).  
**How to reach it:** Not implemented, no guide.  
**Rules:** None — no retrieval/QA layer over the school's documentation exists.  
![](data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAnEAAAACCAYAAAA3pIp+AAAABmJLR0QA/wD/AP+gvaeTAAAACXBIWXMAAA7EAAAOxAGVKw4bAAAAM0lEQVR4nO3OMQ0AIAwAwdIgBKl1gjacsGCAiZDcTT9+q6oRETMAAPjF6ify6QYAADdyA9Y0AypN+bdfAAAAAElFTkSuQmCC)  
**29. Learning platform (student sees study plan + course cards; lessons, instructions, assignments; teacher feedback; per-course progress)**  
**Status: ❌ Not Implemented**  
**Location:**  
- Student accounts *can* exist: backend/src/router/userRoutes.js:206-269 (POST /users/create-for-student, roles ["student"], temp password returned in the API response, **not emailed** — line 259 comment confirms this).  
- Student's only menu item: "Prövningar" → /examform (NavBar.vue:756); plus /profile (Min profil).  
- Student's only course-related view: the study-plan tab of /student/:id (frontend/src/views/Student/tabs/StudyPlanTab.vue) — read-only statuses, no content.  
- No lesson/assignment/progress models or views anywhere (Lesson/Assignment/Uppgift grep: only the teacher Task to-do model backend/src/models/Task.js and action-plan question text).  
**How to reach it:** Not implemented. A student can log in and see "Prövningar" and "Min profil", and (if an admin has navigated them there) their /student/:id study plan — but there is no home page with course cards, no lessons, no assignments, no feedback, no progress.  
**Rules:**  
- Student creation does not auto-create a User login; it's a separate admin action (create-for-student), and the generated temp password is returned to the admin in JSON rather than sent to the student.  
- No backend route returns lessons/assignments for a course card; no teacher-feedback endpoint beyond the grade comments/motivation fields (StudentEnrollment.js:108-109, gradeRoutes.js).  
![](data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAnEAAAACCAYAAAA3pIp+AAAABmJLR0QA/wD/AP+gvaeTAAAACXBIWXMAAA7EAAAOxAGVKw4bAAAANklEQVR4nO3OMQ2AABAAsSNBCkJfFEIwwIgHRiywEZJWQZeZ2ao9AAD+4lyruzq+ngAA8Nr1AOHsBegrsOrIAAAAAElFTkSuQmCC)  
**30. Course templates (admin-created, per-course; select teachers can create; 5 modules × 2 sections; Module 3 = partial exams, Module 5 = case study; duplicated into course cards)**  
**Status: ❌ Not Implemented**  
**Location:**  
- backend/src/models/Course.js — only courseName, courseCode, coursePoints, courseExtent, isActive, programs. No modules/sections/content.  
- backend/src/models/CourseInstance.js — temporal instance fields only (dates, teacher, slutprovDate); no content structure.  
- isCourseTemplate: true flag in backend/src/router/searchRoutes.js:483 is **only a search-result marker** distinguishing a static Course from a CourseInstance — not a template entity.  
**How to reach it:** Not implemented. The closest screens are "Kurser" (/programsandcourses, ProgramsAndCourses.vue) and "Kurspaket" (/programsandpackages) which manage only name/code/points/extent — no module/section builder.  
**Rules:**  
- No template model, no "duplicate template → course card" logic, no teacher permission grant for template authoring, no 5-module/2-section default, no Module-3/Module-5 placement rules anywhere.  
![](data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAnEAAAACCAYAAAA3pIp+AAAABmJLR0QA/wD/AP+gvaeTAAAACXBIWXMAAA7EAAAOxAGVKw4bAAAANUlEQVR4nO3OMQ2AABAAsSNhwgJuUPYDMpnRgQU2QtIq6DIze3UGAMBf3Gu1VcfXEwAAXrseaHEEM+cJoFcAAAAASUVORK5CYII=)  
**31. Course cards (created at admission, follow study plan; same course+dates share a card with responsible teacher; shows course name, start, end, study period, weeks; auto-generate from templates + enrollment dates)**  
**Status: ❌ Not Implemented**  
**Location:**  
- Data backbone exists: StudentEnrollment (courseInstanceId, mainCourseId, startDate, endDate, teacherId, status — StudentEnrollment.js:4-162) and CourseInstance (start/end/points/extent/teacher/slutprovDate). Course instances are shared by course+date+teacher (CourseInstance.js:149-152 unique index).  
- But there is **no course-card entity or view**. The course page that exists is frontend/src/views/Admin/EducationDetails.vue — a course/instance overview listing students and teacher, not a student-facing card with card components.  
**How to reach it:** Not implemented. Admins can view instances under "Kursinstanser" (/course-instances) and open a course via search → "/education/:id", but this is an administration screen, not a course card for students.  
**Rules:**  
- Card fields (course name/start/end/period/weeks) are derivable from existing enrollment data, but no card aggregation endpoint/view exists.  
- No "generate card from template at admission" automation (no template, no card).  
![](data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAnEAAAACCAYAAAA3pIp+AAAABmJLR0QA/wD/AP+gvaeTAAAACXBIWXMAAA7EAAAOxAGVKw4bAAAANElEQVR4nO3OQQmAABRAsSdYxKY/jbnMIJ7FCt5E2BJsmZmt2gMA4C+Otbqr8+sJAACvXQ85TgYRMv3/cwAAAABJRU5ErkJggg==)  
**32. Inactive-student automation (no login within first 5 days → mandatory withdrawal; 14 days inactivity → warning email; detect via last login, lesson-date adherence, assignment-schedule adherence; admin chooses immediate withdraw [auto-email + teacher notification, cascade to package courses] or warning email with named future withdrawal date from saved email templates)**  
**Status: ❌ Not Implemented**  
**Location:**  
- No lastLogin/lastSeen/lastAccess tracking on User (backend/src/models/User.js) or Student (Student.js — no login fields) or StudentEnrollment.  
- No inactivity scheduler/cron (no setInterval/node-cron usage; grep for "inactivity"/"inaktivitet": only the enrollment status: "inactive" enum value StudentEnrollment.js:72).  
- Dropout primitives that *could* be reused exist (Etapp 1): studentDetailsRoutes.js:61-74, studentDetailsController.js:485-790 (creates in-app teacher notification).  
- No email templates/signatures saved anywhere (no EmailTemplate model).  
**How to reach it:** Not implemented. Manual withdrawal exists via a student's Allmänt tab ("Markera som avbrott", admin), but there is no automation and no email.  
**Rules:**  
- Hardcoded thresholds 5 days / 14 days: **not present anywhere** (no constants, no config).  
- No detection inputs (login, lesson dates, assignment schedule) are recorded, so no adherence computation is possible.  
- No admin choice UI (immediate withdraw vs. warning-with-date) exists.  
![](data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAnEAAAACCAYAAAA3pIp+AAAABmJLR0QA/wD/AP+gvaeTAAAACXBIWXMAAA7EAAAOxAGVKw4bAAAANklEQVR4nO3OYQ1AABSAwc8mi5wvlAB6CKCAACr4Z7a7BLfMzFYdAQDwF+da3dX+9QQAgNeuB6fWBdZMUxZ2AAAAAElFTkSuQmCC)  
**33. Course card — overview/first page (activity feed; staff-only notice board [students read, cannot post] for welcome/exam info/announcements; which assignments submitted; which section each student is on)**  
**Status: ❌ Not Implemented**  
**Location:** none. Grep for anslagstavla (notice board), "activity feed", "notice": 0 matches in frontend/src and backend/src.  
**How to reach it:** Not implemented, no guide.  
**Rules:** No activity feed, no notice-board entity with staff-write/student-read permissions, no submission/section-position tracking.  
![](data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAnEAAAACCAYAAAA3pIp+AAAABmJLR0QA/wD/AP+gvaeTAAAACXBIWXMAAA7EAAAOxAGVKw4bAAAAM0lEQVR4nO3OMQ0AIAwAwZIgBKm1gjSMNCwYYCIkd9OP3zJzRMQMAAB+sfqJeroBAMCN2pTWBSSZVtjzAAAAAElFTkSuQmCC)  
**34. Course card — assignments (return for correction/revision; inline comments on the assignment or assignment-tied comments; student–teacher discussion thread per assignment)**  
**Status: ❌ Not Implemented**  
**Location:** none. The only comment mechanism is the student-card staff commentHistory (Student.js:111-132; studentDetailsRoutes.js:30-45; GeneralTab.vue:209-266) — comments on the *person*, not tied to any assignment, and students cannot reply in-thread.  
**How to reach it:** Not implemented. The closest live behavior is staff comments on a student's "Allmänt" tab, which supports add/edit/delete/seen but no threading and no assignment context.  
**Rules:** No assignment entity, so no return-for-revision, no inline-vs-tied comment distinction, no per-assignment thread. (Spec asks to check whether the codebase implements inline or assignment-tied comments — it implements neither; only person-level comments.)  
![](data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAnEAAAACCAYAAAA3pIp+AAAABmJLR0QA/wD/AP+gvaeTAAAACXBIWXMAAA7EAAAOxAGVKw4bAAAANUlEQVR4nO3OQQ2AQBAAsSHhiQI0IWp9ngBsYIEfIWkVdJuZs5oAAPiLe6+O6vp6AgDAa+sBhYwEOqBD7p8AAAAASUVORK5CYII=)  
**35. Course card — date planning (teachers manually schedule section dates ~2 weeks before start; desired: reusable per-course teacher "parameters" for 5/10/20-week lengths; auto-generate schedule from teacher's saved parameters + start date)**  
**Status: ⚠️ Partially Implemented** (exam-date scheduling exists; section-schedule parameters do not)  
**Location:**  
- Manual exam-date scheduling: frontend/src/views/Teacher/ExamCalendar.vue — FullCalendar editable: true, selectable: true, eventDrop: this.handleEventDrop (lines 59-64, 160); drop handler at 344 saves via PUT /calendar-events/move-group (384) for group moves or PUT /calendar-events/:id (419).  
- Auto-calculated final-exam date from **hardcoded per-teacher rules**: backend/src/utils/slutprovDateCalculator.js (Allan/Iman/Maja/Mette → Saturday week before end; Eva → Thursday; Mirsada → Wednesday; Elham/Linnéa/Ulrika/Jonathan → Sunday; Angelina → Wednesday; see lines 147-188), invoked from CourseInstance.pre('save') (CourseInstance.js:90-136).  
**How to reach it:** Lärare/admin → **Kalender** (/kalender) → drag a slutprov event to a new date (drag-and-drop enabled for admins and the responsible teacher, ExamCalendar.vue:213-230). Course instance creation auto-computes the slutprov date per the teacher's name rule.  
**Rules (code-verified):**  
- Exam-date auto-rule is keyed on the teacher's **first name** (hardcoded map, not stored parameters) — slutprovDateCalculator.js:136-188.  
- Manual drag is restricted to admins and the responsible teacher (ExamCalendar.vue:213-230; backend move-group checks admin/systemadmin or responsible teacher, examRoutes.js:330-349).  
- **Missing vs spec:** no per-course *section* scheduling (only the final-exam date), no "2 weeks before course start" default, no stored teacher schedule parameters (Teacher.js has only colorCode, subject, phoneNumbers), no 5/10/20-week schedule generator.  
![](data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAnEAAAACCAYAAAA3pIp+AAAABmJLR0QA/wD/AP+gvaeTAAAACXBIWXMAAA7EAAAOxAGVKw4bAAAANElEQVR4nO3OQQmAUBBAwSd8bOHVnBvBkAaxgjcRZhLMNjNHdQUAwF/cq9qr8+sJAACvrQctgQNH4A++9QAAAABJRU5ErkJggg==)  
**36. Course card — content (admins and granted teachers view/edit all components; components can be hidden from student view)**  
**Status: ❌ Not Implemented**  
**Location:** none. No card components exist to view/edit or to hide (no CourseCard, no content model).  
**How to reach it:** Not implemented, no guide.  
**Rules:** No component visibility/permission layer.  
![](data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAnEAAAACCAYAAAA3pIp+AAAABmJLR0QA/wD/AP+gvaeTAAAACXBIWXMAAA7EAAAOxAGVKw4bAAAANklEQVR4nO3OMQ2AABAAsSNBACPq8MH2NpGACyywEZJWQZeZ2aszAAD+4l6rrTq+ngAA8Nr1AL/KBEe6dElaAAAAAElFTkSuQmCC)  
**37. Course card — reports (per-component completion: green ✓ completed / grey ✗ not completed; feeds withdrawal/warning automation; click student for detail; desired: scheduled-date column to distinguish "not done" from "not yet scheduled")**  
**Status: ❌ Not Implemented**  
**Location:**  
- StudentEnrollment.js:136-138 has completedAt + an unused completionCertificate string field, and attendancePercentage/lastAttendanceDate (117-118) — but no per-component completion tracking.  
- frontend/src/views/Admin/AnalyticsDashboard.vue + backend/src/services/analyticsService.js provide **macro** completion/dropout statistics (per month/course/teacher) — not per component, no ✓/✗ matrix, no scheduled-date column.  
**How to reach it:** Not implemented at card level. The existing macro reports are under **Rapporter & Analys** (/admin/analytics).  
**Rules:** No component entity ⇒ no per-component status ⇒ the withdrawal/warning automation (#32) has no per-component input to consume. The desired "scheduled-date" column has no source data.  
![](data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAnEAAAACCAYAAAA3pIp+AAAABmJLR0QA/wD/AP+gvaeTAAAACXBIWXMAAA7EAAAOxAGVKw4bAAAANElEQVR4nO3OQQmAABRAsSdYxKa/i8WMIR7ECt5E2BJsmZmt2gMA4C+Otbqr8+sJAACvXQ85PAYartXEogAAAABJRU5ErkJggg==)  
**38. Course card — participants (view/add/remove students and staff on the card; automatic removal on withdrawal or staff departure; desired: last-access column)**  
**Status: ⚠️ Partially Implemented** (enrollment-level participant management exists; card-level and automation do not)  
**Location:**  
- View/add/remove enrolled students per course instance: frontend/src/views/Admin/CourseInstances.vue (add-student modal addStudentModal at 443, addStudentToList 1149, deleteEnrollment 1241, removeStudentFromList 1155); frontend/src/views/Admin/StudentEnrollments.vue; backend StudentEnrollment CRUD (studentRoutes.js:486 addcourse, gradeRoutes.js:532 DELETE /enrollments/:id).  
- Course-instance teacher: CourseInstance.responsibleTeacher / assistantTeacher (CourseInstance.js:46-53).  
**How to reach it:** Admin → **Kursinstanser** (/course-instances) → öppna en instans → "Lägg till elev" / ta bort inskrivning.  
**Rules (code-verified):**  
- Enrollment add/remove is **manual**; student.dropout does **not** auto-remove or auto-flip enrollments to dropped (dropout only flags the student — Etapp 1 finding; studentDetailsController.js:485-790 sets dropout: true + notification, enrollments untouched).  
- No staff-removal cascade (unassign exists only via PUT /teachers/:id/unassign-all-students, TeacherManagement.vue:835-847).  
- No lastAccess/last-login column (no tracking, per #32).  
![](data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAnEAAAACCAYAAAA3pIp+AAAABmJLR0QA/wD/AP+gvaeTAAAACXBIWXMAAA7EAAAOxAGVKw4bAAAAMUlEQVR4nO3WAQkAIBAEsBPMYs4PZhMDWMAA5njYUmxU1UqyAwBAF2cmeZE4AIBO7gentgXapSWpbgAAAABJRU5ErkJggg==)  
**39. APL — logbook (APL-only students get personalized "kits" instead of standard course cards, sent at internship start, visible on student home page)**  
**Status: ❌ Not Implemented**  
**Location:**  
- APL features that *do* exist (Etapp 1): frontend/src/views/APLView.vue, components/APLBoard.vue, components/APLFileArchive.vue (kontrakt-filer), aplStatus/aplStatusHistory (Student.js:94-109).  
- No "kit" or logbook concept (grep kit/loggbok: 0 in app code), and no student home page on which kits would appear (#29).  
**How to reach it:** Not implemented. The live APL board (/apl, menu **APL**) shows color-coded students + file archive, but there are no kits/logbooks.  
**Rules:** No kit entity, no internship-start trigger, no student-facing placement.  
![](data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAnEAAAACCAYAAAA3pIp+AAAABmJLR0QA/wD/AP+gvaeTAAAACXBIWXMAAA7EAAAOxAGVKw4bAAAANUlEQVR4nO3OMQ2AUBBAsUfyRTCh9VRgEBGsWGAjJK2CbjNzVGcAAPzFtapV7V9PAAB47X4AEWgEMAY9+pUAAAAASUVORK5CYII=)  
**40. APL — activity (color codes indicating whether a student has fallen behind schedule)**  
**Status: ⚠️ Partially Implemented** (manual color-status board exists; automatic schedule-adherence coloring does not)  
**Location:**  
- frontend/src/components/APLBoard.vue:324-331 — 6 statuses: GRAY "Ny Elev", BLUE "Kontaktad", YELLOW "APL på gång", PURPLE "Behöver uppföljning", RED "Snart slut", GREEN "Klar praktik". Students are assigned a color by staff (drag-and-drop handleDrop at 56) or via PUT /students/:id (studentRoutes.js:789-803, aplStatus).  
- Backend enum: Student.js:94-98.  
**How to reach it:** Praktiksamordnare/lärare/admin → **APL** (/apl) → färgöversikt; dra en elev mellan statuskolumnerna eller ändra status i elevkortet (GeneralTab/APL-tab).  
**Rules (code-verified):**  
- Colors are **manual** statuses — nothing computes them from schedule/lateness. RED "Snart slut" is staff-set, not derived from APL end date (no auto-RED logic; Etapp 1 #15 gap).  
- No notion of "fallen behind schedule" exists (no schedule-adherence data per #32/#37).  
![](data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAnEAAAACCAYAAAA3pIp+AAAABmJLR0QA/wD/AP+gvaeTAAAACXBIWXMAAA7EAAAOxAGVKw4bAAAAMUlEQVR4nO3WAQkAIBAEsBPMYs4PZhMDWMAA5njYUmxU1UqyAwBAF2cmeZE4AIBO7gentgXapSWpbgAAAABJRU5ErkJggg==)  
**41. Certificates — study certificate (one-click generation from student profile, Alvis-like)**  
**Status: ❌ Not Implemented**  
**Location:**  
- StudentEnrollment.js:138completionCertificate: String — declared but **never read or written** anywhere (grep: single model occurrence).  
- Student profile: frontend/src/views/Student/StudentDetails.vue — no certificate button/route.  
**How to reach it:** Not implemented, no guide.  
**Rules:** No certificate generation endpoint, no PDF rendering (backend has no PDF libs at all; the only client-side PDF is jspdf in AnalyticsDashboard.vue), no button on the profile.  
![](data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAnEAAAACCAYAAAA3pIp+AAAABmJLR0QA/wD/AP+gvaeTAAAACXBIWXMAAA7EAAAOxAGVKw4bAAAANUlEQVR4nO3OYQ1AABSAwY8JoIGqr4Z6Eoiggn9mu0twy8wc1RkAAH9xbdVa7V9PAAB47X4A9C4EIsmYmgsAAAAASUVORK5CYII=)  
**42. Certificates — diploma (course-package students; notification after package end date once complete; one click generates only after verifying every course approved AND APL approved; signed diploma generated and sent to student)**  
**Status: ❌ Not Implemented**  
**Location:** none.  
- No diploma model/route/view; no post-package-end trigger; no "all courses approved AND APL approved" verification logic; no email send (#26), so no "sent to student".  
**How to reach it:** Not implemented, no guide.  
**Rules:**  
- Verification preconditions from the spec (every course approved AND APL approved) are not coded anywhere.  
- Course-package completion exists only as enrollment status: "completed"/completedAt (StudentEnrollment.js:136-137) with no downstream diploma step.  
![](data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAnEAAAACCAYAAAA3pIp+AAAABmJLR0QA/wD/AP+gvaeTAAAACXBIWXMAAA7EAAAOxAGVKw4bAAAANklEQVR4nO3OYQ1AABSAwc8mi5wvlAB6CKCAACr4Z7a7BLfMzFYdAQDwF+da3dX+9QQAgNeuB6fWBdZMUxZ2AAAAAElFTkSuQmCC)  
**43. Question bank & exam generation (a bank of exam questions exists; the platform can generate new exams by drawing from it)**  
**Status: ❌ Not Implemented**  
**Location:**  
- The only "question" entity is the **action-plan** questionnaire: backend/src/models/ActionPlanQuestions.js (FormQuestion, type: ['ACTION_PLAN'] only) + actionPlanRoutes.js. Not an exam bank.  
- Exam/Prövning model backend/src/models/Provning.js has **no question fields** (name/personalNumber/phone/email/address/course/municipality/teacherId/requestedMonth/materialReceived/paymentDate/decision/status/studentId).  
**How to reach it:** Not implemented. The only questionnaire flow is the action-plan (Handlingsplan) form, which is unrelated to exam generation.  
**Rules:** No exam question model, no draw-from-bank generation endpoint, no question types beyond action-plan form fields (text/date/textarea/checkbox/select/radio in FormQuestion).  