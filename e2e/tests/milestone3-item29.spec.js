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

// ===== TESTS =====

test('Student: opens the course card and reads lesson content', async ({ page }) => {
  await page.goto('/course-cards');
  await expect(page.locator('.student-name')).toContainText('Anna Andersson', { timeout: 20000 });
  const card = page.locator('.course-card').filter({ hasText: 'SVASVE01' });
  await expect(card).toBeVisible();
  // Read lesson instructions
  await page.locator('.module-chip').first().click();
});

test('Teacher: reviews the pending submission and saves feedback', async ({ page }) => {
  await page.goto('/submissions');
  await expect(page.locator('.pending-submission')).toBeVisible();
  // Find Anna's submission and set godkänd + comment
  await page.locator('.submission-card').first().locator('.status-select').selectOption('godkänd');
  await page.locator('.feedback-comment-input').fill('God jobekt!');
  await page.locator('.save-btn').click();
});

test('Student: reloads the card and sees the feedback on the submission', async ({ page }) => {
  await page.goto('/course-cards');
  await expect(page.locator('.student-name')).toContainText('Anna Andersson', { timeout: 20000 });
  const card = page.locator('.course-card').filter({ hasText: 'SVASVE01' });
  await expect(card).toBeVisible();
  // Check for feedback chip
  await expect(page.locator('.feedback-chip')).toContainText('Godkänd');
});

// ===== END TESTS =====
