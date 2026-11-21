import { expect, test, type Page } from '@playwright/test';

// Runs against a TEST Supabase project with an administrator and a sales agent
// already invited (see docs/DEPLOYMENT.md → "End-to-end tests").
const admin = { email: process.env.E2E_ADMIN_EMAIL!, password: process.env.E2E_ADMIN_PASSWORD! };
const agent = { email: process.env.E2E_AGENT_EMAIL!, password: process.env.E2E_AGENT_PASSWORD! };
const run = Date.now().toString(36).toUpperCase();

async function signIn(page: Page, who: { email: string; password: string }) {
  await page.goto('/sign-in');
  await page.getByLabel('Email address').fill(who.email);
  await page.getByLabel('Password').fill(who.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/app/);
}

test.describe('public site', () => {
  test('landing page renders and links to sign-in', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Land is more');
    await expect(page.getByRole('link', { name: /sign in/i }).first()).toBeVisible();
  });

  test('app routes require sign-in', async ({ page }) => {
    await page.goto('/app/plots');
    await expect(page).toHaveURL(/\/sign-in/);
  });

  test('wrong password shows a clear error', async ({ page }) => {
    await page.goto('/sign-in');
    await page.getByLabel('Email address').fill(admin.email);
    await page.getByLabel('Password').fill('definitely-wrong-password');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.getByRole('alert')).toContainText('Incorrect email or password');
  });
});

test.describe('sales workflow', () => {
  test('register plot → buyer → sale → payment → balance', async ({ page }) => {
    await signIn(page, admin);

    await page.goto('/app/plots');
    await page.getByRole('button', { name: 'Register plot' }).first().click();
    await page.getByLabel('Plot reference number').fill(`E2E/${run}`);
    await page.getByLabel('Name or description').fill('E2E test plot');
    await page.getByLabel('County').fill('Kajiado');
    await page.getByLabel('Plot size').fill('0.125');
    await page.getByLabel('Asking price').fill('1500000');
    await page.getByRole('button', { name: 'Register plot' }).last().click();
    await expect(page.getByRole('heading', { level: 1 })).toContainText(`E2E/${run}`);

    // Duplicate references are refused.
    await page.goto('/app/plots');
    await page.getByRole('button', { name: 'Register plot' }).first().click();
    await page.getByLabel('Plot reference number').fill(`e2e/${run}`);
    await page.getByLabel('Name or description').fill('Duplicate');
    await page.getByLabel('County').fill('Kajiado');
    await page.getByLabel('Plot size').fill('1');
    await page.getByLabel('Asking price').fill('1');
    await page.getByRole('button', { name: 'Register plot' }).last().click();
    await expect(page.getByText('A plot with this reference number already exists.')).toBeVisible();
    await page.keyboard.press('Escape');

    await page.goto('/app/buyers');
    await page.getByRole('button', { name: 'Register buyer' }).first().click();
    await page.getByLabel('Full name').fill(`E2E Buyer ${run}`);
    await page.getByLabel('Phone number').fill('+254700123456');
    await page.getByRole('button', { name: 'Register buyer' }).last().click();
    await expect(page.getByRole('heading', { level: 1 })).toContainText(`E2E Buyer ${run}`);

    await page.getByRole('link', { name: 'New sale' }).click();
    await page.getByLabel('Search plots').fill(`E2E/${run}`);
    await page.getByRole('button', { name: new RegExp(`E2E/${run}`) }).click();
    await page.getByRole('button', { name: 'Record sale' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toContainText('SAL-');

    await page.getByRole('button', { name: 'Record payment' }).first().click();
    await page.getByLabel('Amount received').fill('500000');
    await page.getByLabel('Method').selectOption({ label: 'Cash' });
    await page.getByRole('button', { name: 'Record payment' }).last().click();
    await expect(page.getByText('KES 1,000,000').first()).toBeVisible(); // outstanding after confirmed 500,000
  });
});

test.describe('permissions', () => {
  test('agents cannot open administration pages', async ({ page }) => {
    await signIn(page, agent);
    await page.goto('/app/staff');
    await expect(page.getByText("You don't have access to this page")).toBeVisible();
    await expect(page.getByRole('link', { name: 'Staff & roles' })).toHaveCount(0);
  });
});

test.describe('mobile layout', () => {
  test('no horizontal overflow on key screens', async ({ page }, info) => {
    test.skip(info.project.name !== 'android');
    await signIn(page, admin);
    for (const path of ['/app', '/app/plots', '/app/buyers', '/app/sales', '/app/payments']) {
      await page.goto(path);
      await page.waitForLoadState('networkidle');
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, path).toBeLessThanOrEqual(1);
    }
  });
});
