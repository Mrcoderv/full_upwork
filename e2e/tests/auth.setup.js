import { test as setup } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Auth setup project: logs in once per role and persists the session to a
// storage-state file. Runs before the chromium project (playwright.config.js
// `dependencies`). Login is cached: if a storage-state file already holds a
// valid session (GET /api/auth/session returns 200) the login is skipped, so
// re-runs within the backend's 15-min auth rate-limit window stay at 0 logins
// (authRateLimiter, backend/src/middleware/security.js:215, max 5/15min per
// IP). Only roles actually consumed by the e2e specs live here — add a session
// only when a spec needs it and the fresh-login total stays ≤ 5.
// Seeded accounts: backend/scripts/seedE2EData.js
//   admin@mindful.se / Admin123!    (admin)
//   teacher@mindful.se / Teacher123! (teacher, "Eva Nahi")
//   student@mindful.se / Student123! ("Anna Andersson")
//   student2@mindful.se / Student123! ("Berta Berg")

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const AUTH_DIR = path.join(__dirname, '..', '.auth');

async function login(page, account) {
  await page.goto('/login');
  await page.fill('#email', account.email);
  await page.fill('#password', account.password);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL(/.*profile.*/);
  await page.waitForLoadState('networkidle');
}

async function hasValidSession(browser, stateFile) {
  if (!fs.existsSync(stateFile)) return false;
  const context = await browser.newContext({ storageState: stateFile });
  try {
    const res = await context.request.get('/api/auth/session');
    return res.ok();
  } catch {
    return false;
  } finally {
    await context.close();
  }
}

async function ensureSession(browser, account, role) {
  const stateFile = path.join(AUTH_DIR, `${role}.json`);
  if (await hasValidSession(browser, stateFile)) {
    console.log(`[setup] reusing cached ${role} session`);
    return;
  }
  const context = await browser.newContext();
  const page = await context.newPage();
  await login(page, account);
  await context.storageState({ path: stateFile });
  await context.close();
}

setup('student session (Anna Andersson)', async ({ browser }) => {
  await ensureSession(browser, { email: 'student@mindful.se', password: 'Student123!' }, 'student');
});

setup('student2 session (Berta Berg)', async ({ browser }) => {
  await ensureSession(browser, { email: 'student2@mindful.se', password: 'Student123!' }, 'student2');
});

setup('teacher session (Eva Nahi)', async ({ browser }) => {
  await ensureSession(browser, { email: 'teacher@mindful.se', password: 'Teacher123!' }, 'teacher');
});

setup('admin session', async ({ browser }) => {
  await ensureSession(browser, { email: 'admin@mindful.se', password: 'Admin123!' }, 'admin');
});
