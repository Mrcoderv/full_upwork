import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';

// exceljs ships in backend's node_modules; used to build the admission XLSX.
const nodeRequire = createRequire(import.meta.url);
const ExcelJS = nodeRequire(
  path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'backend', 'node_modules', 'exceljs')
);

// Etapp 2 live verification (MILESTONE-3-CHECKLIST.md items 19, 27, 30, 31, 35, 38, 40).
// Sessions are bootstrapped by the "setup" project (tests/auth.setup.js) which
// logs in each role once and saves a storage state (stays within the 5-logins/15-min
// auth rate limiter, backend/src/middleware/security.js).
//
// Seeded accounts (backend/scripts/seedE2EData.js):
//   admin@mindful.se / Admin123!   (admin)
//   teacher@mindful.se / Teacher123! ("Eva Nahi", teacher)
//   student@mindful.se / Student123!  ("Anna Andersson")
//   student2@mindful.se / Student123! ("Berta Berg")
//   student3@mindful.se / Student123! ("Calle Carlsson")
// Seeded data: SVASVE01 instance (2026-07-06→2026-09-28, teacher Eva Nahi, slutprov
// 2026-09-23/24, 4 enrollments incl. Erik dropped), template "Svenska som andraspråk 1 - mall",
// GradeCatalog "Betygskatalog SVASVE01" (status uploaded), slutprov CalendarEvent
// (generated from enrollments), Anna + Calle have CoursePackage enrollments
// (Calle's ends 2026-08-21 → APL auto-RED). Berta has no CoursePackage → APLBoard
// (CoursePackage filter) does not show her.
//
// Backend for e2e runs should be started with a generous API rate limit so the
// whole suite stays under the per-IP budget:
//   API_RATE_LIMIT_MAX=1000 node index.js   (backend/src/middleware/security.js)

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SHOT_DIR = path.join(__dirname, '..', 'verification-screenshots');
const AUTH_DIR = path.join(__dirname, '..', '.auth');
const studentState = path.join(AUTH_DIR, 'student.json');
const student2State = path.join(AUTH_DIR, 'student2.json');
const teacherState = path.join(AUTH_DIR, 'teacher.json');
const adminState = path.join(AUTH_DIR, 'admin.json');

// Wire a page into the module-level error/console tracking so test.afterEach's
// `expect(pageErrors).toEqual([])` also covers manually-created contexts.
function trackPage(page) {
  page.on('pageerror', (err) => {
    pageErrors.push(err.message);
  });
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      console.log(`BROWSER CONSOLE ERROR: ${msg.text()}`);
    }
  });
}

// Wait until the conversations sidebar finished its first fetch: either the
// list renders or the empty state ("Inga konversationer hittades.") shows.
async function waitForConversationsLoaded(page) {
  await page.waitForSelector('.conversation-list, .empty-state', { state: 'visible', timeout: 20000 });
}

let pageErrors = [];

test.beforeAll(() => {
  fs.mkdirSync(SHOT_DIR, { recursive: true });
  fs.mkdirSync(AUTH_DIR, { recursive: true });
});

test.beforeEach(async ({ page }) => {
  pageErrors = [];
  page.on('pageerror', (err) => {
    pageErrors.push(err.message);
  });
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      console.log(`BROWSER CONSOLE ERROR: ${msg.text()}`);
    }
  });
});

test.afterEach(async () => {
  expect(pageErrors, `page errors on ${test.info().title}`).toEqual([]);
});

test.describe('Etapp 2 student (course cards)', () => {
  test.use({ storageState: studentState });

  test('Item 31 — Course cards: card list with period/weeks/dates/teacher/modules', async ({ page }) => {
    await page.goto('/course-cards');
    await expect(page.locator('.student-name')).toContainText('Anna Andersson', { timeout: 20000 });

    const card = page.locator('.course-card', { hasText: 'Svenska som andraspråk 1' }).first();
    await expect(card).toBeVisible();
    await expect(card).toContainText('SVASVE01');
    await expect(card).toContainText('Pågående');
    // Two cards (APL-paket starts 2026-01-12 → Period 1; SVASVE01 → Period 2),
    // studyPeriod = 1-based ordinal in the student's start-date-sorted list.
    await expect(card).toContainText('Period 2');
    await expect(card).toContainText('Veckor: 12');
    await expect(card).toContainText('Start');
    await expect(card).toContainText('Slut');
    await expect(card).toContainText('Eva Nahi');
    await expect(card).toContainText('Kursupplägg');
    // Module 3 = Delprov, module 5 = Case (copied from template via instance modules).
    await expect(card.locator('.chip-tag', { hasText: 'Delprov' })).toBeVisible();
    await expect(card.locator('.chip-tag', { hasText: 'Case' })).toBeVisible();

    await page.screenshot({ path: path.join(SHOT_DIR, 'item31-course-cards.png'), fullPage: true });
  });
});

test.describe('Etapp 2 item 31 Part B (admission auto-generates card content)', () => {
  test.use({ storageState: adminState });

  test('Item 31 Part B — admission enrolls a student and auto-builds the card from the course template', async ({ page, browser }) => {
    // Unique per run so stale data from earlier runs never collides.
    const runId = `${Date.now()}`;
    const courseName = `PartB Testkurs ${runId}`;
    const courseCode = `PARTB${runId}`;
    const studentEmail = `partb.${runId}@example.com`;
    const studentName = 'PartB TestElev';
    const personalNumber = `19950101-${runId.slice(-4)}`;
    const start = new Date();
    start.setDate(start.getDate() + 60);
    start.setHours(0, 0, 0, 0);
    const dow = start.getDay();
    if (dow !== 1) start.setDate(start.getDate() + ((8 - dow) % 7)); // next Monday
    const end = new Date(start);
    end.setDate(end.getDate() + 35); // 5-week course

    // 1. Setup: a course with an associated template (admin content, one-time).
    const courseResp = await page.request.post('/api/course', {
      data: { courseName, courseCode },
    });
    expect(courseResp.status()).toBe(201);
    const course = await courseResp.json();

    const templateModules = Array.from({ length: 5 }, (_, i) => {
      const n = i + 1;
      return {
        moduleNumber: n,
        title: n === 3 ? 'Delprov' : n === 5 ? 'Case' : `Modul ${n}`,
        isPartialExam: n === 3,
        isCaseStudy: n === 5,
        sections: [
          { title: 'Sektion 1', description: '', instructions: 'Läs avsnittet.' },
          { title: 'Sektion 2', description: '', instructions: '' },
        ],
      };
    });
    const templateResp = await page.request.post('/api/course-templates', {
      data: { templateName: `PartB mall ${runId}`, courseId: course._id, modules: templateModules },
    });
    expect(templateResp.status()).toBe(201);

    // 2. Admission via the actual UI flow: the admin uploads the student on /course-matching.
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Studenter');
    ws.addRow(['NAMN', 'PERSONNUMMER', 'KURS/PAKET', 'START', 'SLUT', 'KOMMUN/PRIVAT', 'MAIL', 'Lärare']);
    ws.addRow([studentName, personalNumber, courseCode, start, end, 'Sollentuna', studentEmail, 'Eva Nahi']);
    const xlsxPath = path.join(SHOT_DIR, `item31-partb-upload-${runId}.xlsx`);
    fs.writeFileSync(xlsxPath, Buffer.from(await wb.xlsx.writeBuffer()));

    await page.goto('/course-matching');
    await page.setInputFiles('#studentFile', xlsxPath);
    const uploadRespPromise = page.waitForResponse(
      (r) => r.request().method() === 'POST' && r.url().includes('/api/upload-students')
    );
    await page.locator('.process-btn', { hasText: 'Bearbeta studenter' }).click();
    const uploadResp = await uploadRespPromise;
    expect(uploadResp.status()).toBe(200);
    const uploadBody = await uploadResp.json();
    expect(uploadBody.success).toBe(true);
    expect(uploadBody.results.errors).toEqual([]);

    const newStudent = uploadBody.results.students.find((s) => s.email === studentEmail);
    expect(newStudent, 'the uploaded student should be created').toBeTruthy();
    const enrollment = uploadBody.results.enrollments.find((e) => e.studentEmail === studentEmail);
    expect(enrollment, 'the student should be enrolled').toBeTruthy();

    // 3. The instance created at admission carries the template modules — no
    // templateId is ever sent by the upload/admission flow (auto-resolution).
    const instancesResp = await page.request.get('/api/course-instances');
    expect(instancesResp.status()).toBe(200);
    const { instances } = await instancesResp.json();
    const instance = instances.find((i) => i._id === enrollment.courseInstanceId);
    expect(instance, 'admission-created course instance should exist').toBeTruthy();
    expect(instance.modules).toHaveLength(5);
    expect(instance.modules.find((m) => m.moduleNumber === 3).isPartialExam).toBe(true); // Delprov
    expect(instance.modules.find((m) => m.moduleNumber === 5).isCaseStudy).toBe(true);   // Case

    // 4. The student's course card is built with the auto-generated content.
    const cardsResp = await page.request.get(`/api/students/${newStudent._id}/course-cards`);
    expect(cardsResp.status()).toBe(200);
    const { cards } = await cardsResp.json();
    const card = cards.find((c) => c.courseName === courseName);
    expect(card, 'course card should be built for the enrolled course').toBeTruthy();
    expect(card.modules).toHaveLength(5);
    expect(card.modules.find((m) => m.moduleNumber === 3).isPartialExam).toBe(true);
    expect(card.modules.find((m) => m.moduleNumber === 5).isCaseStudy).toBe(true);

    // 5. The student logs in and sees the card UI (Delprov/Case chips).
    const userResp = await page.request.post('/api/users/create-for-student', {
      data: { studentId: newStudent._id, email: studentEmail, name: studentName },
    });
    expect(userResp.status()).toBe(201);
    const { tempPassword } = await userResp.json();

    const studentCtx = await browser.newContext();
    const studentPage = await studentCtx.newPage();
    trackPage(studentPage);
    await studentPage.goto('/login');
    await studentPage.fill('#email', studentEmail);
    await studentPage.fill('#password', tempPassword);
    await studentPage.locator('.login-btn').click();
    // mustChangePassword → forced to /change-password before the app is usable.
    await expect(studentPage).toHaveURL(/\/change-password/, { timeout: 20000 });
    await studentPage.fill('#currentPassword', tempPassword);
    const newPassword = 'Partb123!';
    await studentPage.fill('#newPassword', newPassword);
    await studentPage.fill('#confirmPassword', newPassword);
    const changeRespPromise = studentPage.waitForResponse(
      (r) => r.request().method() === 'PUT' && r.url().includes('/api/auth/change-password')
    );
    await studentPage.locator('.login-btn').click();
    await changeRespPromise;

    await studentPage.goto('/course-cards');
    await expect(studentPage.locator('.student-name')).toContainText(studentName, { timeout: 20000 });
    const cardEl = studentPage.locator('.course-card', { hasText: courseName }).first();
    await expect(cardEl).toBeVisible();
    await expect(cardEl.locator('.chip-tag', { hasText: 'Delprov' })).toBeVisible();
    await expect(cardEl.locator('.chip-tag', { hasText: 'Case' })).toBeVisible();
    await studentPage.screenshot({ path: path.join(SHOT_DIR, 'item31-partb-course-card.png'), fullPage: true });
    await studentCtx.close();
  });
});

test.describe('Etapp 2 admin', () => {
  test.use({ storageState: adminState });

  test('Item 19 — Scrive: betygskatalog upload/send UI, 503 without creds', async ({ page }) => {
    await page.goto('/admin/betygsrapporter');
    await expect(page.locator('h1')).toContainText('Betygsrapporter');
    await expect(page.locator('body')).toContainText(
      'Ladda upp betygskataloger (PDF) en i taget och skicka dem för digital signering via Scrive.'
    );

    const row = page.locator('tr', { hasText: 'Betygskatalog SVASVE01' }).first();
    await expect(row).toBeVisible({ timeout: 20000 });
    await expect(row).toContainText('Anna Andersson');
    await expect(row).toContainText('Svenska som andraspråk 1');
    await expect(row).toContainText('Eva Nahi');
    await expect(row).toContainText('Uppladdad');
    await expect(row.locator('button', { hasText: 'PDF' })).toBeVisible();
    const sendBtn = row.locator('button', { hasText: 'Skicka för signering' });
    await expect(sendBtn).toBeVisible();

    // No Scrive credentials in .env.development → POST send must return 503,
    // and the row must survive (backend-complete, pending real creds).
    const respPromise = page.waitForResponse(
      (r) => r.request().method() === 'POST' && /\/api\/grade-catalogs\/[^/]+\/send$/.test(r.url())
    );
    await sendBtn.click();
    const resp = await respPromise;
    expect(resp.status()).toBe(503);
    await expect(page.locator('tr', { hasText: 'Betygskatalog SVASVE01' })).toContainText('Uppladdad');

    await page.screenshot({ path: path.join(SHOT_DIR, 'item19-betygsrapporter.png'), fullPage: true });
  });

  test('Item 30 — Course templates: list + edit modal with 5 modules (delprov/case chips)', async ({ page }) => {
    await page.goto('/course-templates');
    await expect(page.locator('.v-card-title', { hasText: 'Kursmallar' })).toBeVisible({ timeout: 20000 });
    await expect(page.locator('button', { hasText: 'Ny kursmall' })).toBeVisible();

    const row = page.locator('tr', { hasText: 'Svenska som andraspråk 1 - mall' }).first();
    await expect(row).toBeVisible();
    await expect(row).toContainText('Svenska som andraspråk 1 (SVASVE01)');
    await expect(row).toContainText('Aktiv');
    await expect(row.locator('td').nth(2)).toHaveText('5');

    await row.locator('button', { hasText: 'Redigera' }).click();
    await expect(page.locator('.v-dialog')).toBeVisible();
    await expect(page.locator('.v-dialog')).toContainText('Redigera kursmall');
    await expect(page.locator('.v-dialog')).toContainText('Moduler (5 × 2 sektioner)');
    await expect(page.locator('.v-dialog .module-block')).toHaveCount(5);
    await expect(page.locator('.v-dialog .v-chip', { hasText: 'Delprov' })).toBeVisible();
    await expect(page.locator('.v-dialog .v-chip', { hasText: 'Case study' })).toBeVisible();

    await page.screenshot({ path: path.join(SHOT_DIR, 'item30-course-templates.png'), fullPage: true });
    await page.keyboard.press('Escape');
  });

  test('Item 35 — Date planning: slutprov event on Kalender is draggable (move-group PUT)', async ({ page }) => {
    await page.goto('/kalender');
    const nextBtn = page.locator('.fc-next-button');
    await expect(nextBtn).toBeVisible({ timeout: 20000 });

    const event = page.locator('.fc-event', { hasText: 'Eva Nahi' }).first();
    for (let i = 0; i < 4 && !(await event.isVisible().catch(() => false)); i++) {
      await nextBtn.click();
      await page.waitForTimeout(700);
    }
    await expect(event).toBeVisible({ timeout: 15000 });

    // Drag the event onto the NEXT day's cell. Targeting the cell center (via
    // FullCalendar's data-date attribute) keeps the drop valid even when the
    // event sits on the last column of a week or the edge of the month — the
    // naive "+1 day-width" move lands in empty space there and FullCalendar
    // silently reverts (no move-group PUT). Retry a few times: if no PUT fires
    // the event never moved, making a retry safe.
    let resp = null;
    for (let attempt = 1; attempt <= 3 && !resp; attempt++) {
      const ev = page.locator('.fc-event', { hasText: 'Eva Nahi' }).first();
      const box = await ev.boundingBox();
      const fromX = box.x + box.width / 2;
      const fromY = box.y + box.height / 2;

      const currentDate = await page.evaluate(({ x, y }) => {
        const cell = document.elementFromPoint(x, y)?.closest('.fc-daygrid-day');
        return cell ? cell.getAttribute('data-date') : null;
      }, { x: fromX, y: fromY });
      const next = new Date(`${currentDate}T12:00:00`);
      next.setDate(next.getDate() + 1);
      const nextDate = next.toISOString().slice(0, 10);
      const target = page.locator(`.fc-daygrid-day[data-date="${nextDate}"]`);
      const tbox = await target.boundingBox();
      const toX = tbox.x + tbox.width / 2;
      const toY = tbox.y + tbox.height / 2;

      const moveResp = page.waitForResponse(
        (r) => r.request().method() === 'PUT' && r.url().includes('/calendar-events/move-group'),
        { timeout: 8000 }
      );
      await page.mouse.move(fromX, fromY);
      await page.mouse.down();
      await page.waitForTimeout(150);
      await page.mouse.move(toX, toY, { steps: 20 });
      await page.waitForTimeout(150);
      await page.mouse.up();
      try {
        resp = await moveResp;
      } catch {
        // no PUT fired → drag did not register; event still in place, retry
      }
    }

    expect(resp, 'move-group PUT should fire after dragging the slutprov event').toBeTruthy();
    expect(resp.status()).toBe(200);

    await page.screenshot({ path: path.join(SHOT_DIR, 'item35-exam-calendar-drag.png'), fullPage: true });
  });

  test('Item 38 — Participants: enrollments modal with Senaste inloggning column + add modal', async ({ page }) => {
    await page.goto('/course-instances');
    const row = page.locator('tr', { hasText: 'SVASVE01' }).first();
    await expect(row).toBeVisible({ timeout: 20000 });
    await expect(row).toContainText('Svenska som andraspråk 1');
    await expect(row).toContainText('Eva Nahi');
    // 4 enrollments in the seed: Anna, Berta, Calle (active) + Erik (dropped).
    await expect(row.locator('.enrollment-count')).toHaveText('4');

    await row.locator('button[title="Visa inskrivningar"]').click();
    const modal = page.locator('#enrollmentsModal');
    await expect(modal).toBeVisible();
    await expect(modal).toContainText('Inskrivningar för Svenska som andraspråk 1');

    // Last-access column (rendered live; checklist #38 wanted it).
    await expect(modal.locator('thead th', { hasText: 'Senaste inloggning' })).toBeVisible();

    const annaRow = modal.locator('tbody tr', { hasText: 'Anna Andersson' }).first();
    await expect(annaRow).toBeVisible();
    // Anna logged in via the student storage-state setup → real date.
    await expect(annaRow.locator('td').nth(4)).not.toHaveText('-');
    // Calle (student3) is enrolled but has no auth.setup session → never logged in → '-'.
    const calleRow = modal.locator('tbody tr', { hasText: 'Calle Carlsson' }).first();
    await expect(calleRow).toBeVisible();
    await expect(calleRow.locator('td').nth(4)).toHaveText('-');

    // Add-student capability (non-destructive: open + cancel).
    await modal.locator('.btn-close').click();
    await expect(modal).not.toBeVisible();
    await row.locator('button[title="Lägg till student"]').click();
    const addModal = page.locator('#addStudentModal');
    await expect(addModal).toBeVisible();
    await expect(addModal).toContainText('Lägg till studenter till Svenska som andraspråk 1');
    await addModal.locator('button', { hasText: 'Avbryt' }).click();

    await page.screenshot({ path: path.join(SHOT_DIR, 'item38-course-instances-enrollments.png'), fullPage: true });
  });

  test('Item 40 — APL activity: color columns + auto-RED badge derived from APL end date', async ({ page }) => {
    await page.goto('/apl');
    for (const label of ['Ny Elev', 'Kontaktad', 'APL på gång', 'Behöver uppföljning', 'Snart slut', 'Klar praktik']) {
      await expect(page.locator('.column h3', { hasText: label }).first()).toBeVisible({ timeout: 20000 });
    }

    // Anna YELLOW (manual) + CoursePackage ends 2026-12-31 (not within 3 weeks) →
    // "APL på gång" column, no AUTO badge.
    await expect(page.locator('.column.yellow .student-card', { hasText: 'Anna Andersson' })).toBeVisible();
    await expect(page.locator('.column.yellow .student-card', { hasText: 'Anna Andersson' }).locator('.auto-red-badge')).toHaveCount(0);

    // Calle stored GREEN but CoursePackage ends 2026-08-21 (within 3 weeks) → effective RED + AUTO badge.
    const calleCard = page.locator('.column.red .student-card', { hasText: 'Calle Carlsson' });
    await expect(calleCard).toBeVisible();
    await expect(calleCard.locator('.auto-red-badge')).toHaveText('AUTO');

    // Berta has no CoursePackage enrollment → filtered out by the board entirely.
    await expect(page.locator('.student-card', { hasText: 'Berta Berg' })).toHaveCount(0);

    await page.screenshot({ path: path.join(SHOT_DIR, 'item40-apl-board.png'), fullPage: true });
  });
});

test.describe('Etapp 2 messaging (#27)', () => {
  // Unique per run so stale conversations from earlier runs never collide.
  const subject = `E2E #27 ${Date.now()}`;
  const teacherBody = `E2E #27 lärare → elev ${Date.now()}`;
  const studentReply = `E2E #27 elev → lärare ${Date.now()}`;

  test('Item 27 — teacher messages a student; student reads + replies; unrelated users are isolated', async ({ browser }) => {
    // 1. Teacher (Eva Nahi) sends a message to her student Anna.
    const teacherCtx = await browser.newContext({ storageState: teacherState });
    const teacherPage = await teacherCtx.newPage();
    trackPage(teacherPage);
    await teacherPage.goto('/messages');
    await expect(teacherPage.locator('h2', { hasText: 'Meddelanden' })).toBeVisible({ timeout: 20000 });

    const recipients = await (await teacherPage.request.get('/api/recipients')).json();
    const anna = recipients.find((u) => u.email === 'student@mindful.se');
    expect(anna, 'seeded student Anna should be a message recipient').toBeTruthy();

    await teacherPage.locator('button', { hasText: 'Ny konversation' }).click();
    const modal = teacherPage.locator('.modal-card');
    await expect(modal).toBeVisible();
    await modal.locator('select.form-control').selectOption({ value: anna._id });
    await modal.locator('input.form-control').fill(subject);
    await modal.locator('textarea.form-control').fill(teacherBody);

    const sendResp = teacherPage.waitForResponse(
      (r) => r.request().method() === 'POST' && r.url().includes('/api/messages')
    );
    await modal.locator('button', { hasText: 'Starta konversation' }).click();
    expect((await sendResp).status()).toBe(201);

    // The new conversation auto-opens with the sent message visible.
    await expect(teacherPage.locator('.thread-subject')).toContainText(subject, { timeout: 20000 });
    await expect(teacherPage.locator('.message-feed .message-text', { hasText: teacherBody })).toBeVisible();
    await teacherPage.screenshot({ path: path.join(SHOT_DIR, 'item27-1-teacher-sent.png'), fullPage: true });

    // 2. The student (Anna) sees the conversation and can reply to it.
    const studentCtx = await browser.newContext({ storageState: studentState });
    const studentPage = await studentCtx.newPage();
    trackPage(studentPage);
    await studentPage.goto('/messages');
    const convItem = studentPage.locator('.conversation-item', { hasText: subject }).first();
    await expect(convItem).toBeVisible({ timeout: 20000 });
    await convItem.click();
    await expect(studentPage.locator('.message-feed .message-text', { hasText: teacherBody })).toBeVisible({ timeout: 20000 });
    await studentPage.screenshot({ path: path.join(SHOT_DIR, 'item27-2-student-sees.png'), fullPage: true });

    await studentPage.locator('.reply-box textarea').fill(studentReply);
    const replyResp = studentPage.waitForResponse(
      (r) => r.request().method() === 'POST' && r.url().includes('/api/messages')
    );
    await studentPage.locator('.reply-box .btn-send').click();
    expect((await replyResp).status()).toBe(201);
    await expect(
      studentPage.locator('.message-feed .message-bubble-wrapper.mine .message-text', { hasText: studentReply })
    ).toBeVisible({ timeout: 20000 });
    await studentPage.screenshot({ path: path.join(SHOT_DIR, 'item27-3-student-replied.png'), fullPage: true });

    // 3. An unrelated student (Berta) cannot see the conversation at all.
    const bertaCtx = await browser.newContext({ storageState: student2State });
    const bertaPage = await bertaCtx.newPage();
    trackPage(bertaPage);
    await bertaPage.goto('/messages');
    await waitForConversationsLoaded(bertaPage);
    await expect(bertaPage.locator('.conversation-item', { hasText: subject })).toHaveCount(0);
    await bertaPage.screenshot({ path: path.join(SHOT_DIR, 'item27-4-unrelated-student.png'), fullPage: true });

    // 4. Unrelated staff (admin, not a participant) cannot see it either.
    const adminCtx = await browser.newContext({ storageState: adminState });
    const adminPage = await adminCtx.newPage();
    trackPage(adminPage);
    await adminPage.goto('/messages');
    await waitForConversationsLoaded(adminPage);
    await expect(adminPage.locator('.conversation-item', { hasText: subject })).toHaveCount(0);
    await adminPage.screenshot({ path: path.join(SHOT_DIR, 'item27-5-unrelated-admin.png'), fullPage: true });

    // 5. Round-trip complete: the teacher sees the student's reply.
    await teacherPage.reload();
    await waitForConversationsLoaded(teacherPage);
    const teacherConv = teacherPage.locator('.conversation-item', { hasText: subject }).first();
    await expect(teacherConv).toBeVisible({ timeout: 20000 });
    await teacherConv.click();
    await expect(teacherPage.locator('.message-feed .message-text', { hasText: studentReply })).toBeVisible({ timeout: 20000 });
    await teacherPage.screenshot({ path: path.join(SHOT_DIR, 'item27-6-teacher-sees-reply.png'), fullPage: true });

    await teacherCtx.close();
    await studentCtx.close();
    await bertaCtx.close();
    await adminCtx.close();
  });
});
