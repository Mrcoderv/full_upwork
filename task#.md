
# Mindful Learning — Complete Phase 1 & Phase 2 System Audit Prompt

## ROLE

You are a senior software architect, full-stack engineer, QA engineer, security auditor, and requirements analyst.

Your task is to perform a **complete implementation audit** of the existing Mindful Learning system.

You MUST inspect the actual source code and compare it against the requirements defined in:

1. `Etapp_1_English.pdf` — Mindful Learning Phase 1
2. `Etapp_2_English.pdf` — Mindful Learning Phase 2

Do NOT assume that a feature exists simply because:

* a route exists,
* a database model exists,
* a UI button exists,
* a menu item exists,
* a TODO exists,
* an API endpoint exists,
* or the feature name appears somewhere in the code.

A feature is considered implemented only when the complete required workflow is actually functional across the relevant frontend, backend, database, permissions, validation, automation, notifications, and integrations.

---

# 1. PRIMARY OBJECTIVE

Perform a full audit and answer:

> **How much of Phase 1 and Phase 2 is actually implemented in the current system?**

For every requirement, determine whether it is:

* ✅ FULLY IMPLEMENTED
* 🟡 PARTIALLY IMPLEMENTED
* 🔴 NOT IMPLEMENTED
* ⚠️ IMPLEMENTED BUT INCORRECT
* 🧪 IMPLEMENTED BUT NOT VERIFIED
* ❓ REQUIREMENT CANNOT BE VERIFIED FROM CODE

Do not mark something as fully implemented unless there is sufficient code evidence.

---

# 2. FIRST: UNDERSTAND THE ENTIRE SYSTEM

Before auditing individual requirements, inspect the repository structure.

Identify:

* frontend framework
* backend framework
* programming languages
* database
* ORM
* authentication system
* authorization/RBAC system
* API architecture
* file/document storage
* email service
* notification system
* chat/messaging system
* PDF generation system
* calendar system
* payment system
* background jobs/cron workers
* scheduled tasks
* external integrations
* testing framework
* deployment configuration

Inspect:

* frontend source
* backend source
* database models/schema/migrations
* controllers
* services
* routes
* middleware
* permissions
* components
* pages
* hooks
* API clients
* validation
* utilities
* background jobs
* notification logic
* email templates
* PDF generation
* configuration
* environment variables
* tests

Do not modify code during the audit.

---

# 3. CREATE A REQUIREMENTS TRACEABILITY MATRIX

Create a complete matrix mapping:

`Requirement → Frontend → Backend → Database → Automation → Permissions → Notifications → Tests → Status`

For every requirement include:

| ID | Requirement | Frontend Evidence | Backend Evidence | DB Evidence | Automation | Permission | Test Evidence | Status |
| -- | ----------- | ----------------- | ---------------- | ----------- | ---------- | ---------- | ------------- | ------ |

Use exact file paths and relevant function/component names.

---

# 4. PHASE 1 AUDIT

Audit every requirement from Phase 1.

## 4.1 User Profiles and Permissions

Verify:

* Student role
* Teacher role
* Administrator role
* System Administrator role
* Study and Career Counselor (SYV)
* Special Education Teacher
* Internship Coordinator
* role-specific permissions
* individual/custom permissions
* ability to grant exceptions to individual users
* permission management UI
* backend authorization enforcement
* frontend permission enforcement
* unauthorized API access protection

The document specifically requires different profiles and customizable individual permissions.

Check whether permissions are actually enforced on the backend, not merely hidden in the frontend.

---

# 5. SEARCH SYSTEM

Verify the global search system.

Requirements include searching:

* students
* dates
* teachers
* courses

Verify:

* minimum 3-character search
* first name search
* middle name search
* last name search
* exact date search
* course start date
* course end date
* teacher search
* teacher's active students
* teacher's courses
* completed courses
* course search
* teacher associated with course
* students associated with course
* search result navigation

The Phase 1 document specifies these search behaviors.

Test whether the search works end-to-end rather than merely checking that a search component exists.

---

# 6. USER PROFILE

Audit the student/staff profile pages.

Verify:

### General tab

* contact information
* complete profile information
* staff comments
* student support information
* exam accommodations
* exceptions/deviations
* staff vacation information

### Study Plan

Verify:

* courses
* course packages
* assigned teacher
* course status
* teacher's active courses
* students connected to courses
* status dropdown

Required statuses:

* Admitted
* Graded
* Withdrawal
* Not Started
* Revised

### APL

Verify that APL is available for appropriate students but not staff.

### Permissions

Verify that authorized users can view/change permissions.

### Documents

Verify:

* uploaded documents
* action plans
* CVs
* APL contracts
* document association with students
* document navigation

### Course Archive

Verify:

* final exams
* partial exams
* other course-related documents

The document requires navigation between related records, such as clicking a course from a student's study plan and seeing its students and teacher.

---

# 7. COURSE MANAGEMENT

Verify:

* all courses page
* add/place student
* course placement workflow
* course package placement
* course start date
* study duration
* automatic course end date calculation
* student name
* personal identification number
* phone
* email
* final exam date
* teacher-specific exam days
* automatic exam date calculation
* additional support
* on-site/remote exam
* municipality-based exam location

---

# 8. COURSE PACKAGE MANAGEMENT

Verify:

* start date
* 100% study pace
* 50% study pace
* 25% study pace
* full package selection
* removing individual courses
* synchronization with final exam list
* synchronization with APL list
* automatic course start/end calculation
* automatic APL registration
* previous internship checkbox
* certificate upload
* automatic placement in Documents
* remaining course-placement workflow

Phase 1 explicitly requires course-package selections to communicate with the final exam and APL lists.

---

# 9. WITHDRAWAL WORKFLOW

Verify the complete workflow:

Search student → select course → change status to Withdrawal.

Then verify automatic:

* teacher confirmation
* notification creation
* removal from final exam list
* removal from APL list
* inactive/withdrawn marking
* inactive student list
* reactivation capability

Do not mark this complete unless the entire chain works.

---

# 10. STUDY PLAN REVISION

Verify:

* changing study pace
* removing courses
* rescheduling study plan
* updating final exam list
* updating APL list
* updating course end date
* teacher notification
* student notification
* new study plan confirmation

Phase 1 requires these downstream updates to happen automatically.

---

# 11. INACTIVE STUDENTS

Verify:

* recognition of existing students
* automatic population of previous information
* previous course history
* re-enrollment
* selecting previous courses
* enrolling in new courses

---

# 12. APL SYSTEM

Audit the entire APL module.

Verify:

* APL student list
* automatic student appearance
* Internship Coordinator access
* student's APL requirements
* CV upload
* APL contract upload
* color coding
* filtering by color

Required statuses:

* White — New student
* Blue — Contacted/informed
* Yellow — APL in progress
* Purple — Needs follow-up
* Red — Internship ending soon
* Green — Internship completed

Verify automatic red status based on remaining weeks.

Verify completed/green students automatically appear in the completed list.

Verify:

* contact information
* internship period
* contract uploaded status
* APL contract files

These color/status requirements are explicitly defined in Phase 1.

---

# 13. GRADING

Verify:

* teacher grading page
* students requiring grading
* automatic reminder
* A–F grade dropdown
* mandatory grade justification
* optional comments
* validation
* grade persistence
* grade history
* teacher ownership restrictions

Verify that all required fields except comments are mandatory.

---

# 14. NATIONAL EXAMS

Verify:

* English national exam points
* Swedish national exam points
* Mathematics national exam points
* registration UI
* database storage
* relationship to grading
* annual grading scale
* System Administrator ability to modify grading scale
* versioning by term/year such as HT24

---

# 15. GRADE LOCKING

Verify:

* teacher can lock grades
* locked grades cannot be edited normally
* administrator receives notification
* admin can access locked grades
* System Administrator/Admin can unlock grades
* audit trail exists for lock/unlock

---

# 16. DIGITAL SIGNING

Investigate the Scrive requirement.

Determine whether:

* Scrive integration exists
* PDF generation exists
* PDF upload exists
* documents can be sent for signing
* signing status is tracked
* signed documents are stored
* teachers can sign

If not implemented, clearly report it as missing.

---

# 17. ACTION PLAN

Verify the complete F-grade workflow:

F grade entered
→ notification/reminder
→ reminder remains until completed
→ teacher opens questionnaire
→ questionnaire submitted
→ PDF generated
→ PDF downloadable
→ System Administrator can modify questionnaire

The requirement explicitly states that an F grade should trigger an action-plan reminder and that completing the questionnaire should generate a downloadable PDF.

---

# 18. EXAMINATION / PRØVNINGAR SYSTEM

Verify:

* examination student page
* search
* online registration
* payment
* import/upload
* automatic registration from imported data
* manual editing
* interest list
* automatic notification 4–3 weeks before exam
* teacher acceptance
* move to next month
* rejection
* teacher comment/reason
* required registration fields
* study material tracking
* payment date
* final exam integration

Required registration data includes name, personal ID, phone, email, address, course, month, municipality and responsible teacher.

---

# 19. FINAL EXAM CALENDAR

Verify:

* automatic student appearance
* automatic removal when requirements change
* monthly calendar
* teacher assignment
* teacher-specific colors
* click teacher → students
* attendance checkbox
* exam accommodations
* extra writing time
* computer
* separate seating
* teacher exam-date editing
* administration scheduling
* exam location
* room selection
* all configured rooms

Verify that final-exam membership is automatically synchronized with course/admission/withdrawal changes.

---

# 20. SYV

Verify Study and Career Counselor functionality:

* view students
* schedule meetings
* calendar
* student profile information
* revise study plan

---

# 21. SPECIAL EDUCATION TEACHER

Verify:

* view students
* schedule meetings
* calendar
* profile information
* exam accommodations

---

# 22. FINANCE AND REPORTING

Verify reporting functionality for:

* revenue per municipality
* revenue per course
* monthly revenue forecast
* number of students
* month filter
* teacher filter
* course filter
* term filter
* withdrawal statistics
* F-grade statistics
* grade distribution
* grade curve
* school-level statistics
* course-level statistics

Determine whether these reports are real calculations from database data or merely static UI.

---

# 23. PHASE 2 AUDIT

Now audit every Phase 2 requirement.

Phase 2 is intended to integrate the learning platform, email, and chat and automate communication/reminders.

---

# 24. SOLLENTUNA AUTOMATIC EMAIL

Verify:

* municipality identification
* Sollentuna student detection
* automatic email after admission
* Learning Team information
* correct email template
* duplicate prevention

---

# 25. INTERNAL EMAIL / CHAT

Verify:

* staff-to-student communication
* student-to-staff communication
* internal messaging
* conversation creation
* message sending
* message receiving
* message history
* unread messages
* email copy to students
* notification system
* mobile/SMS-style notification possibility
* permissions

The requirement specifically states that internal communication and school/student communication should remain within the platform, while students should also receive an email copy.

If SMS is not implemented, report it separately rather than assuming email satisfies SMS.

---

# 26. CHATBOT

Verify:

* chatbot exists
* student access
* question input
* knowledge/information retrieval
* relevant answer generation
* source/data retrieval
* permissions
* fallback behavior
* logging
* hallucination/error handling

If there is only a chatbot UI without actual knowledge retrieval, classify it as partial.

---

# 27. LEARNING PLATFORM

Verify student access to:

* study plan
* connected course cards
* active courses
* lessons
* instructions
* assignments
* assignment submission
* teacher feedback
* progress tracking

Phase 2 requires students to be able to access active course cards and complete assignments, while teachers provide feedback and monitor progress.

---

# 28. COURSE TEMPLATES

Verify:

* administrator-created templates
* template permissions
* selected teacher permissions
* template duplication
* 5 modules
* 2 sections per module
* Module 3 partial exams
* Module 5 cases
* custom modules/sections
* reusable template system

---

# 29. COURSE CARDS

Verify:

* automatic creation when student is admitted
* study-plan synchronization
* student-course-card relationships
* teacher relationship
* grouping students with same course/start/end dates
* course name
* start date
* end date
* study period
* number of weeks

Verify automatic creation based on templates and dates.

---

# 30. INACTIVITY AUTOMATION

This is a high-priority audit area.

Verify:

### First 5 days

If student does not log in during the first five days:

* inactivity detected
* withdrawal workflow triggered or administrator decision created

### 14 days

If student inactive for 14 days:

* warning generated
* email sent
* teacher notification
* administrator notification

The system must consider:

* last login
* lesson schedule adherence
* assignment completion

These requirements are explicitly described in Phase 2.

Verify scheduled/background jobs actually run.

---

# 31. INACTIVITY DECISION WORKFLOW

Verify administrator can select:

### Option 1

Withdraw immediately.

Then verify:

* student withdrawn
* email sent
* teacher notified
* all course-package courses withdrawn

### Option 2

Send warning.

Verify:

* warning email
* specified future withdrawal date
* automatic withdrawal if no activity
* stored email template/signature

---

# 32. COURSE CARD OVERVIEW

Verify:

* activity overview
* notice board
* staff-only posting
* student read access
* welcome information
* exam information
* general course information

Students must not be able to write on the notice board.

---

# 33. PRACTICE ASSIGNMENTS

Verify:

* assignment creation
* submission
* teacher review
* return for correction
* additional work
* teacher comments
* inline comments
* assignment-level comments
* student-teacher discussion
* assignment status
* resubmission

---

# 34. DATE PLANNING

Verify:

* course-card schedule
* teacher scheduling parameters
* 5-week schedule
* 10-week schedule
* 20-week schedule
* automatic scheduling
* course-start-date calculation
* teacher-specific schedule parameters

The requirement explicitly asks the system to automatically schedule course components from the start date and teacher parameters.

---

# 35. COURSE CONTENT

Verify:

* admin access
* authorized teacher access
* component editing
* content management
* hiding components from students
* student visibility rules

---

# 36. COURSE REPORTS

Verify:

* student activity
* withdrawal-related information
* warning-related information
* student-level detailed progress
* all course-card components
* completed status
* incomplete status
* scheduled date column

Required indicators:

* Green check = completed
* Grey X = not completed

Also verify that unscheduled assignments can be distinguished from overdue assignments.

---

# 37. PARTICIPANTS

Verify:

* students listed
* staff listed
* add participant
* remove participant
* automatic removal after withdrawal
* automatic removal when staff leaves organization
* last course-card access date

---

# 38. APL LEARNING KIT / LOGBOOK

Verify:

* personalized learning kits
* kit creation
* kit sending
* student first-page visibility
* activity tracking
* color-coded activity status
* behind-schedule detection

---

# 39. STUDY CERTIFICATE

Verify the requirement from Phase 2:

From the student page there should be a button to generate a study certificate.

Audit:

* certificate template
* student name insertion
* student data insertion
* date
* title
* school information
* PDF generation
* download
* storage
* document association
* permission
* duplicate generation behavior

The Phase 2 document explicitly requires a student-page button for generating the study certificate.

---

# 40. DIPLOMA

Verify:

* course-package completion detection
* notification after course end date
* diploma generation button
* all courses approved check
* APL approved check
* final eligibility validation
* signed diploma generation
* delivery to student
* PDF generation
* storage
* download

Do not consider diploma generation complete if the system merely generates a PDF without checking all required conditions.

---

# 41. QUESTION BANK AND EXAMS

Verify:

* question bank
* question CRUD
* question categories
* question storage
* permissions
* exam generation
* random question selection if required by implementation
* exam templates
* generated exams
* relationship between questions and exams

Phase 2 explicitly requires a question bank that can be used to generate new exams.

---

# 42. FRONTEND AUDIT

Perform a dedicated frontend audit.

Inspect every relevant page/component.

For each requirement determine:

* Does the page exist?
* Is the UI connected to real APIs?
* Is the API response displayed?
* Are forms functional?
* Are validation rules implemented?
* Are loading states implemented?
* Are error states implemented?
* Are empty states implemented?
* Are permissions reflected correctly?
* Are unauthorized actions blocked?
* Are buttons actually connected to working functionality?
* Are dropdown values correct?
* Are filters functional?
* Are search results correct?
* Are date calculations visible?
* Are notifications displayed?
* Are generated PDFs downloadable?
* Are tables/pagination/filtering working?
* Is mobile/responsive behavior relevant and functional?

Identify:

* dead buttons
* placeholder pages
* mock data
* hardcoded values
* fake success messages
* TODOs
* commented-out functionality
* incomplete components
* API calls that do not exist
* API calls with incorrect payloads
* UI that expects fields not returned by backend

---

# 43. BACKEND AUDIT

Perform a dedicated backend audit.

Inspect:

* routes
* controllers
* services
* models
* repositories
* middleware
* authorization
* validation
* database queries
* transactions
* background jobs
* scheduled jobs
* email service
* notification service
* PDF service
* file service
* integrations

Verify:

* business rules are enforced server-side
* users cannot bypass permissions through direct API requests
* required fields are validated
* relationships are correct
* cascade behavior is correct
* withdrawal propagation works
* study-plan revisions propagate correctly
* course-package changes propagate correctly
* exam lists stay synchronized
* APL stays synchronized
* notifications are generated correctly
* automated jobs actually execute
* errors are handled correctly

---

# 44. DATABASE AUDIT

Inspect the database schema.

Map requirements to tables/models.

Check for:

* users
* roles
* permissions
* custom permissions
* students
* teachers
* courses
* course packages
* enrollments
* study plans
* study-plan revisions
* APL
* APL contracts
* documents
* grades
* grading scales
* exams
* final exams
* exam rooms
* exam accommodations
* action plans
* notifications
* conversations
* messages
* assignments
* submissions
* course templates
* course cards
* participants
* activity tracking
* certificates
* diplomas
* questions
* reports

Identify missing relationships and data integrity problems.

---

# 45. API AUDIT

Create a list of all relevant APIs.

For each API report:

* HTTP method
* endpoint
* authentication
* authorization
* request body
* response
* validation
* database operation
* frontend caller
* error handling
* status

Identify:

* unused APIs
* frontend APIs that don't exist
* backend APIs with no frontend consumer
* insecure APIs
* incomplete APIs

---

# 46. AUTOMATION AUDIT

Create a dedicated automation matrix.

| Automation | Trigger | Expected Result | Implemented? | Evidence |
| ---------- | ------- | --------------- | ------------ | -------- |

Check all automatic processes, including:

* course end-date calculation
* final exam date calculation
* course package scheduling
* APL registration
* withdrawal notifications
* study-plan revision
* exam-list updates
* APL-list updates
* grading reminders
* grade-lock notifications
* action-plan reminders
* examination notifications
* course-card creation
* inactivity detection
* warning emails
* automatic withdrawal
* certificate generation
* diploma eligibility
* diploma generation

---

# 47. NOTIFICATION AUDIT

Verify:

* in-app notifications
* email notifications
* notification recipients
* duplicate prevention
* notification status/read state
* notification history
* notification triggers
* templates
* automatic reminders

Create a table:

| Trigger | Recipient | Channel | Expected | Actual | Status |

---

# 48. PERMISSION / SECURITY AUDIT

Test role-based access.

At minimum test:

* Student
* Teacher
* Administrator
* System Administrator
* SYV
* Special Education Teacher
* Internship Coordinator

Verify:

* frontend restrictions
* backend restrictions
* direct API protection
* ownership restrictions
* sensitive student information
* document access
* grading access
* exam access
* permission modification
* administrator escalation

Identify privilege escalation possibilities.

---

# 49. TEST COVERAGE AUDIT

Inspect existing tests.

Determine whether requirements have:

* unit tests
* integration tests
* API tests
* frontend tests
* end-to-end tests

Do not count a test as sufficient merely because a test file exists.

Map tests to requirements.

---

# 50. IMPLEMENTATION SCORE

Calculate:

### Phase 1

* Fully implemented: X
* Partially implemented: X
* Incorrect: X
* Missing: X
* Unverified: X

Calculate an approximate Phase 1 implementation percentage.

### Phase 2

Calculate the same metrics.

Then calculate:

**Overall implementation percentage = completed verified requirements / total auditable requirements × 100**

Explain exactly how the percentage was calculated.

Do not inflate the score.

---

# 51. CRITICAL GAPS

Create a prioritized list.

## P0 — Critical

Functionality that blocks core business operations or creates serious security/data-integrity problems.

## P1 — High

Important required functionality that is missing or broken.

## P2 — Medium

Partial functionality, usability issues, or incomplete automation.

## P3 — Low

Minor UI, optimization, or non-critical improvements.

For each issue provide:

* requirement
* current behavior
* expected behavior
* affected frontend files
* affected backend files
* database impact
* recommended fix
* priority

---

# 52. FALSE IMPLEMENTATION DETECTION

Pay special attention to features that appear implemented but are not.

Search for:

* TODO
* FIXME
* mock
* dummy
* placeholder
* hardcoded
* fake
* static
* sample
* coming soon
* console.log
* not implemented
* temporary
* commented code
* empty handlers
* disabled buttons

Also identify UI components that display data but do not persist it.

---

# 53. END-TO-END WORKFLOW AUDIT

Test the most important complete workflows conceptually and, where possible, through the actual system.

### Workflow 1 — New Student

Admission
→ student creation
→ study plan
→ course placement
→ course card
→ teacher assignment
→ APL
→ final exam
→ notifications

### Workflow 2 — Course Completion

Course end
→ grading reminder
→ teacher grade
→ justification
→ grade lock
→ administrator notification
→ final records

### Workflow 3 — F Grade

F grade
→ action-plan notification
→ questionnaire
→ completion
→ PDF generation
→ document storage

### Workflow 4 — Withdrawal

Withdrawal
→ study-plan status
→ notification
→ final exam removal
→ APL removal
→ inactive student
→ reactivation

### Workflow 5 — Study Plan Revision

Revision
→ reschedule
→ final exam update
→ APL update
→ teacher notification
→ student notification

### Workflow 6 — Course Card

Admission
→ template selected
→ course card created
→ participants connected
→ schedule generated
→ assignments available
→ student submits
→ teacher reviews
→ feedback
→ progress report

### Workflow 7 — Inactivity

No login/activity
→ detection
→ warning
→ teacher/admin notification
→ admin decision
→ withdrawal if required

### Workflow 8 — Diploma

Course package complete
→ courses approved
→ APL approved
→ eligibility check
→ notification
→ diploma generation
→ signing
→ delivery

---

# 54. DO NOT MODIFY THE SYSTEM

This is an audit only.

Do NOT:

* change code
* create files
* delete files
* modify database
* install packages
* change configuration
* commit changes
* push changes
* create pull requests

Only inspect and report.

---

# 55. EVIDENCE REQUIREMENT

Every status must have evidence.

For example:

> 🟢 Fully Implemented
> Frontend: `frontend/src/pages/Students.jsx`
> Backend: `backend/src/controllers/studentController.js`
> API: `GET /api/students/:id`
> Database: `Student` model
> Test: `student.test.js`

If you cannot find evidence, do not mark it fully implemented.

---

# 56. FINAL REPORT FORMAT

Return the final audit using this structure:

## Executive Summary

* Phase 1 completion: XX%
* Phase 2 completion: XX%
* Overall completion: XX%
* Critical issues: X
* High-priority issues: X
* Medium issues: X
* Low issues: X

## Architecture Summary

Describe the current frontend/backend/database architecture.

## Phase 1 Requirement Matrix

Complete table with every Phase 1 requirement.

## Phase 2 Requirement Matrix

Complete table with every Phase 2 requirement.

## Frontend Audit

Detailed findings.

## Backend Audit

Detailed findings.

## Database Audit

Detailed findings.

## API Audit

Detailed findings.

## Automation Audit

Detailed findings.

## Notification Audit

Detailed findings.

## Permission/Security Audit

Detailed findings.

## Testing Audit

Detailed findings.

## End-to-End Workflow Audit

Report each workflow as:

* PASS
* PARTIAL
* FAIL

with evidence.

## Missing Features

List all missing requirements.

## Partial Features

List all partially implemented requirements.

## Incorrect Features

List requirements that appear implemented but do not behave according to the specification.

## Critical Bugs

List P0/P1 issues.

## Recommended Implementation Order

Give a practical implementation roadmap:

1. Critical security/data issues
2. Core Phase 1 missing functionality
3. Phase 1 automation
4. Phase 2 core learning platform
5. Phase 2 automation
6. Communication
7. Certificates/diplomas
8. Reporting
9. Testing
10. Final QA

## Final Verdict

Answer clearly:

> **Is Phase 1 fully implemented? YES / NO**

> **Is Phase 2 fully implemented? YES / NO**

> **What percentage is actually implemented?**

> **What are the top 10 missing/broken requirements?**

> **What must be implemented before the system can be considered production-ready?**

---

# IMPORTANT RULES

1. Do not assume functionality.
2. Do not trust UI labels alone.
3. Do not trust route names alone.
4. Do not trust database models alone.
5. Trace functionality from UI → API → backend → database → automation → notification.
6. Check both positive and negative/permission cases.
7. Distinguish "exists" from "works".
8. Distinguish "partially implemented" from "fully implemented".
9. Cite exact source-code locations for your findings.
10. Do not change anything in the repository.
11. Do not skip requirements because they are difficult.
12. Do not give a generic software review.
13. The audit must be specifically based on the Phase 1 and Phase 2 requirements.
14. If a requirement cannot be verified from the repository, explicitly mark it as **UNVERIFIED**.
15. At the end, provide a clear implementation percentage and prioritized missing-feature list.

## START NOW

First inspect the complete repository structure.

Then inspect the frontend, backend, database, APIs, permissions, automation, notifications, integrations and tests.

Then perform the complete Phase 1 and Phase 2 requirements audit.

Do not make any code changes.

Return the complete evidence-based audit report.
