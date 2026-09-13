import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

test('login is accessible and protected routes redirect', async ({ page }) => {
  await page.goto('/inventory');
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole('heading', { name: 'Sign In' })).toBeVisible();
  await expect(page.getByLabel('Username')).toBeVisible();
  await expect(page.getByLabel('Password')).toBeVisible();

  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
});

test('invalid credentials show a safe error without leaking account details', async ({ page }) => {
  await page.route('**/api/auth/login', (route) => route.fulfill({
    status: 401,
    contentType: 'application/json',
    body: JSON.stringify({ error: 'Invalid username or password' }),
  }));

  await page.goto('/login');
  await page.getByLabel('Username').fill('unknown-user');
  await page.getByLabel('Password').fill('WrongPassword1!');
  await page.getByRole('button', { name: 'Sign In' }).click();
  await expect(page.getByRole('alert')).toHaveText('Invalid username or password');
});
