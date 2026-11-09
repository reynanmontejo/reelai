import { expect, test } from '@playwright/test';

for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
  test(`sparse Home rows keep poster cards bounded at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto('/');
    const row = page.locator('.row').first();
    const card = row.locator('.card').first();
    await expect(card).toBeVisible();
    // Reproduce a catalog row containing only one visible story.
    await page.addStyleTag({ content: '.row .card:not(:first-child) { display: none; }' });
    const bounds = await card.boundingBox();
    expect(bounds?.width).toBeGreaterThan(120);
    expect(bounds?.width).toBeLessThanOrEqual(240);
    const poster = await card.locator('.poster').boundingBox();
    expect(poster?.height).toBeLessThanOrEqual(360);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
}
