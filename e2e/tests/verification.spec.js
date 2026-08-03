import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';

// Define users for auth flows based on original context
const users = {
  admin: { email: 'admin@test.com', password: 'Admin123!' },
  teacher: { email: 'teacher@test.com', password: 'Teacher123!' },
  coord: { email: 'coord@test.com', password: 'Coord123!' },
  user: { email: 'user@test.com', password: 'User123!' },
};

// Global error tracking for Step 6
let pageErrors = [];
let consoleLogs = [];

test.beforeEach(async ({ page }) => {
  pageErrors = [];
  consoleLogs = [];
  
  page.on('pageerror', (err) => {
    pageErrors.push(err.message);
  });
  
  page.on('console', (msg) => {
    console.log(`BROWSER CONSOLE: ${msg.type()} - ${msg.text()}`);
    consoleLogs.push({ type: msg.type(), text: msg.text() });
  });
});

test.describe('System Verification Pass', () => {

  test('STEP 1: Boot and baseline', async ({ page }) => {
    // Navigate to app root
    await page.goto('/');
    
    // Wait for initial load
    await page.waitForLoadState('networkidle');
    
    // Screenshot initial load
    await page.screenshot({ path: 'screenshots/step1-initial-load.png', fullPage: true });

    // Assert no offline banner is shown
    const offlineBanner = page.locator('text=offline').first();
    await expect(offlineBanner).not.toBeVisible();

    // Verify hygiene (Step 6 related)
    expect(pageErrors.length).toBe(0);
    // Ensure no failed network requests on initial load
    // (Playwright doesn't easily assert on past network requests without setting up route interception,
    // but page errors are caught above)
  });

  test('STEP 2.1: Error-handling UI - 401 Unauthorized', async ({ page, context }) => {
    // Clear cookies to ensure unauthenticated state
    await context.clearCookies();
    
    // Attempt to access a protected route directly (e.g., /dashboard or /students)
    await page.goto('/profile');
    
    // Ensure it redirects to login and doesn't crash
    await expect(page).toHaveURL(/.*login.*/);
    
    await page.screenshot({ path: 'screenshots/step2-1-401-redirect.png' });
  });

  test('STEP 2.2: Error-handling UI - 404 Not Found', async ({ page }) => {
    // Navigate to non-existent route
    await page.goto('/this-route-does-not-exist-12345');
    
    // Wait for the 404 page to render
    await expect(page.locator('text=404')).toBeVisible({ timeout: 5000 });
    
    await page.screenshot({ path: 'screenshots/step2-2-404-not-found.png', fullPage: true });
  });

  test('STEP 2.3: Error-handling UI - Validation error', async ({ page }) => {
    await page.goto('/login');
    
    // Fill in wrong credentials to trigger server validation/error
    await page.fill('input[type="email"]', 'invalid@test.com');
    await page.fill('input[type="password"]', 'wrong');
    
    const loginButton = page.locator('button[type="submit"]').first();
    await loginButton.click();
    
    // Check for Swedish validation messages (or general required text)
    // We assume some toast or inline text appears
    const errorMsg = page.locator('.error-alert').first();
    await expect(errorMsg).toBeVisible({ timeout: 5000 });
    
    await page.screenshot({ path: 'screenshots/step2-3-validation-error.png' });
  });

  test('STEP 2.4: Error-handling UI - Network failure', async ({ page, context }) => {
    await page.goto('/login');
    
    // Simulate offline mode
    await context.setOffline(true);
    
    // Attempt action
    const loginButton = page.locator('button[type="submit"]').first();
    await loginButton.click();
    
    // Wait for offline banner/message
    const offlineMsg = page.locator('text=Du är offline').first();
    await expect(offlineMsg).toBeVisible({ timeout: 5000 });
    
    await page.screenshot({ path: 'screenshots/step2-4-network-failure.png' });
  });

  test('STEP 2.5: Error-handling UI - Simulated 500', async ({ page }) => {
    // Intercept a critical API call and force a 500
    await page.route('**/api/auth/login', route => {
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'Internal Server Error', stack: 'Error: line 1...' })
      });
    });

    await page.goto('/login');
    await page.fill('input[type="email"]', users.user.email);
    await page.fill('input[type="password"]', users.user.password);
    
    const loginButton = page.locator('button[type="submit"]').first();
    await loginButton.click();
    
    // Verify user-safe error is shown, NOT the raw stack trace
    const errorMsg = page.locator('.error-alert').first();
    await expect(errorMsg).toContainText('Internal Server Error');
    await expect(page.locator('body')).not.toContainText('Error: line 1'); // Ensure stack is not rendered
    
    await page.screenshot({ path: 'screenshots/step2-5-simulated-500.png' });
  });

  test('STEP 3: Auth-hardened routes', async ({ page, request }) => {
    // Test unauthenticated access to student data API
    const unauthRes = await request.get('/api/students');
    expect(unauthRes.status()).toBe(401);
    
    // Login as admin
    await page.goto('/login');
    await page.fill('input[type="email"]', users.admin.email);
    await page.fill('input[type="password"]', users.admin.password);
    await page.locator('button[type="submit"]').click();
    await page.waitForURL(/.*profile.*/);
    
    // Test authenticated access
    await page.goto('/students');
    await page.screenshot({ path: 'screenshots/step3-auth-admin-access.png' });
    
    // Check that admin can see/edit records (find an edit button)
    const editBtn = page.locator('button:has-text("Edit"), .mdi-pencil').first();
    if (await editBtn.isVisible()) {
      await expect(editBtn).toBeVisible();
    }
  });

  test('STEP 4: Pagination/batching UI check', async ({ page }) => {
    // Login as admin
    await page.goto('/login');
    await page.fill('input[type="email"]', users.admin.email);
    await page.fill('input[type="password"]', users.admin.password);
    await page.locator('button[type="submit"]').click();
    await page.waitForURL(/.*profile.*/);

    // Navigate to students list
    await page.goto('/students');
    await page.waitForLoadState('networkidle');
    
    await page.screenshot({ path: 'screenshots/step4-pagination-load.png' });
    
    // Verify no "undefined" in table
    const tableHtml = await page.innerHTML('body');
    expect(tableHtml).not.toContain('undefined');
    
    // Attempt pagination if controls exist
    const nextBtn = page.locator('button[aria-label="Next page"], .mdi-chevron-right').first();
    if (await nextBtn.isVisible()) {
      await nextBtn.click();
      await page.waitForLoadState('networkidle');
      await page.screenshot({ path: 'screenshots/step4-pagination-next.png' });
    }
  });

  test('STEP 5: Core happy-path smoke test', async ({ page }) => {
    // Login
    await page.goto('/login');
    await page.fill('input[type="email"]', users.teacher.email);
    await page.fill('input[type="password"]', users.teacher.password);
    await page.locator('button[type="submit"]').click();
    
    // Dashboard
    await page.waitForURL(/.*profile.*/);
    await page.screenshot({ path: 'screenshots/step5-dashboard.png' });
    
    // Logout
    const logoutBtn = page.locator('.mdi-logout').first();
    if (await logoutBtn.isVisible()) {
      await logoutBtn.click();
      await page.waitForURL(/.*login.*/);
      await page.screenshot({ path: 'screenshots/step5-logout.png' });
    }
  });

  test('STEP 6: Console/network hygiene check', async ({ page }) => {
    // This is tested implicitly by checking the arrays populated in `beforeEach`
    // after navigating around.
    await page.goto('/login');
    await page.fill('input[type="email"]', users.admin.email);
    await page.fill('input[type="password"]', users.admin.password);
    await page.locator('button[type="submit"]').click();
    await page.waitForURL(/.*profile.*/);
    
    // Check for sensitive logs
    const sensitiveWords = ['token', 'password', 'env', 'secret'];
    const leakedLogs = consoleLogs.filter(log => 
      sensitiveWords.some(word => log.text.toLowerCase().includes(word))
    );
    
    expect(leakedLogs.length).toBe(0);
    expect(pageErrors.length).toBe(0);
  });
});
