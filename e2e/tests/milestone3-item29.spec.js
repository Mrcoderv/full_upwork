import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Item 29 — Lesson content + per-module assignment submissions + teacher
// feedback + per-course progress (MVP). Backend: /api/learning/instances/:id/
// modules, POST /submissions, /api/learning/submissions/pending,
// PUT /api/learning/submissions/:id/feedback. Progress is computed into
// GET /course-cards/mine as card.progress.
//
// Seeded accounts (backend/scripts/seedE2EData.js): teacher@mindful.se /
// Teacher123! ("Eva Nahi"), student@mindful.se / Student123! ("Anna Andersson").
// Anna is enrolled in SVASVE01 (2026-07-06 → 2026-09-28, teacher Eva Nahi).
// The seed gives module 1 an assignment and fills each section with
// instructions so the student card has lesson content to show.
//
// Flow: student opens the card, reads instructions, submits the module-1
// assignment; teacher opens /submissions, reviews it (godkänd + comment);
// student reloads the card and sees the feedback. A resubmission clears
// earlier feedback, and the progress assertions are load-time based, so
// re-running the spec is idempotent (a re-run resubmits → feedback reset →
// pending again → re-reviewed).
//
// Run with the backend up (API_RATE_LIMIT_MAX=1000) and the seeded e2e DB.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SHOT_DIR = path.join(__dirname, '..', 'verification-screenshots');
const AUTH_DIR = path.join(__dirname, '..', '.auth');
const studentState = path.join(AUTH_DIR, 'student.json');
const teacherState = path.join(AUTH_DIR, 'teacher.json');

let pageErrors = [];

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

test.describe('Item 29 — lesson content & assignment submissions (MVP)', () => {
  test.use({ storageState: studentState });

  test('Student: opens the course card, reads lesson content and submits the module-1 assignment', async ({ page }) => {
    await page.goto('/course-cards');
    await expect(page.locator('.student-name')).toContainText('Anna Andersson', { timeout: 20000 });

    const card = page.locator('.course-card', { hasText: 'Svenska som andraspråk 1' }).first();
    await expect(card).toBeVisible();
    await expect(card).toContainText('Kursupplägg');

    // Progress bar is present (a module carries an assignment). Exact value is
    // asserted deterministically after the teacher approves (test 3), since a
    // re-run of this spec leaves an accepted submission behind.
    await expect(card.locator('.progress-block')).toContainText('Framsteg:');

    // Open module 1 to reveal lesson content + the assignment.
    await card.locator('summary', { hasText: 'Modul 1' }).click();
    await expect(card.locator('.section-instructions').first()).toBeVisible();
    await expect(card.locator('.section-instructions').first()).toContainText('Lektionsinnehåll modul 1');
    await expect(card.locator('.assignment-block')).toContainText('Inlämningsuppgift 1 – Reflektion');

    const textarea = card.locator('textarea.submission-textarea');
    await expect(textarea).toBeVisible();
    await textarea.fill('E2E #29 reflektion: jag har lärt mig om läsförståelse och ordförråd.');

    const respPromise = page.waitForResponse(
      (r) => r.request().method() === 'POST' && r.url().includes('/api/learning/instances/')
    );
    await card.locator('button.submit-btn').click();
    const resp = await respPromise;
    expect(resp.status()).toBe(201);

    await expect(card.locator('.submission-status')).toContainText('Inlämnat');
    await expect(card.locator('.feedback-pending')).toContainText('Väntar på återkoppling');

    await page.screenshot({ path: path.join(SHOT_DIR, 'item29-1-student-submitted.png'), fullPage: true });
  });
});

test.describe('Item 29 — teacher feedback (MVP)', () => {
  test.use({ storageState: teacherState });

  test('Teacher: reviews the pending submission and saves feedback', async ({ page }) => {
    await page.goto('/submissions');
    await expect(page.locator('h2', { hasText: 'Inlämningar' })).toBeVisible({ timeout: 20000 });

    const card = page.locator('.submission-card', { hasText: 'E2E #29 reflektion' }).first();
    await expect(card).toBeVisible({ timeout: 20000 });
    await expect(card).toContainText('Anna Andersson');
    await expect(card).toContainText('Svenska som andraspråk 1 (SVASVE01)');
    await expect(card).toContainText('Modul 1');

    await card.locator('select.status-select').selectOption({ value: 'godkänd' });
    await card.locator('textarea.feedback-comment-input').fill('Bra reflektion! Du har förstått innehållet.');

    const respPromise = page.waitForResponse(
      (r) => r.request().method() === 'PUT' && r.url().includes('/api/learning/submissions/')
    );
    await card.locator('button.save-btn').click();
    const resp = await respPromise;
    expect(resp.status()).toBe(200);

    // Reviewed submissions disappear from the pending list.
    await expect(page.locator('.submission-card', { hasText: 'E2E #29 reflektion' })).toHaveCount(0);

    await page.screenshot({ path: path.join(SHOT_DIR, 'item29-2-teacher-feedback.png'), fullPage: true });
  });
});

test.describe('Item 29 — feedback visible to the student (MVP)', () => {
  test.use({ storageState: studentState });

  test('Student: reloads the card and sees the feedback on the submission', async ({ page }) => {
    await page.goto('/course-cards');
    await expect(page.locator('.student-name')).toContainText('Anna Andersson', { timeout: 20000 });

    const card = page.locator('.course-card', { hasText: 'Svenska som andraspråk 1' }).first();
    await expect(card).toBeVisible();
    await card.locator('summary', { hasText: 'Modul 1' }).click();

    await expect(card.locator('.submission-status')).toContainText('Inlämnat', { timeout: 20000 });
    await expect(card.locator('.feedback-ok')).toContainText('Godkänd');
    await expect(card.locator('.feedback-comment')).toContainText('Bra reflektion!');
    await expect(card.locator('.progress-block')).toContainText('Framsteg: 1/1 (100%)');

    await page.screenshot({ path: path.join(SHOT_DIR, 'item29-3-student-feedback.png'), fullPage: true });
  });
});
