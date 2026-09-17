import { expect, test, type Page } from '@playwright/test';

type VideoState = { reel: string | null; paused: boolean; currentTime: number };

async function waitForFeedVideo(page: Page, reelIndex = 0) {
  const video = page.locator(`section[data-reel-index="${reelIndex}"] video`);
  await expect(video).toHaveCount(1);
  await expect.poll(() => video.evaluate((element) => (element as HTMLVideoElement).readyState)).toBeGreaterThanOrEqual(1);
  return video;
}

async function setPlaybackPosition(video: ReturnType<Page['locator']>, ratio: number, seconds?: number) {
  await video.evaluate((element, requested) => {
    const media = element as HTMLVideoElement;
    media.currentTime = requested.seconds ?? media.duration * requested.ratio;
    media.dispatchEvent(new Event('timeupdate'));
  }, { ratio, seconds });
}

async function scrollToNextReel(page: Page) {
  const feed = page.getByRole('main', { name: 'Vertical reel feed' });
  await feed.hover();
  await page.mouse.wheel(0, await page.evaluate(() => window.innerHeight));
  await expect.poll(() => feed.evaluate((element) => Math.round(element.scrollTop / element.clientHeight))).toBe(1);
}

async function mountedVideoStates(page: Page): Promise<VideoState[]> {
  return page.locator('video').evaluateAll((elements) => elements.map((element) => {
    const video = element as HTMLVideoElement;
    return {
      reel: video.closest('section')?.getAttribute('data-reel-index') ?? null,
      paused: video.paused,
      currentTime: video.currentTime,
    };
  }));
}

test.beforeEach(async ({ page }) => {
  await page.goto('/feed');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
});

test('an early wheel-skip recommends another series and hands playback to the active reel', async ({ page }) => {
  const first = await waitForFeedVideo(page);
  const initialSeriesTitle = await page.locator('section[data-reel-index="0"] h3').innerText();
  await setPlaybackPosition(first, 0, 2);
  await scrollToNextReel(page);

  const next = page.locator('section[data-reel-index="1"]');
  const nextSeriesHeading = next.getByRole('heading');
  await expect(nextSeriesHeading).toBeVisible();
  await expect(nextSeriesHeading).not.toHaveText(initialSeriesTitle);
  await expect(next.getByText('EPISODE 1', { exact: true })).toBeVisible();
  await expect.poll(async () => (await mountedVideoStates(page)).map(({ reel }) => reel)).toEqual(['0', '1', '2']);
  await expect.poll(async () => (await mountedVideoStates(page)).map(({ reel, paused }) => ({ reel, paused }))).toEqual([
    { reel: '0', paused: true },
    { reel: '1', paused: false },
    { reel: '2', paused: true },
  ]);
});

test('watching at least 70 percent recommends the next episode in the same series', async ({ page }) => {
  const first = await waitForFeedVideo(page);
  await setPlaybackPosition(first, 0.75);
  await scrollToNextReel(page);

  const next = page.locator('section[data-reel-index="1"]');
  await expect(next.getByRole('heading', { name: "The CEO's Second Chance" })).toBeVisible();
  await expect(next.getByText('EPISODE 2', { exact: true })).toBeVisible();
  await expect.poll(async () => (await mountedVideoStates(page)).map(({ reel, paused }) => ({ reel, paused }))).toEqual([
    { reel: '0', paused: true },
    { reel: '1', paused: false },
    { reel: '2', paused: true },
  ]);
});

test('autoplay countdown navigates to the next episode after playback ends', async ({ page }) => {
  await page.goto('/watch/the-ceos-second-chance/1');
  const video = page.locator('video');
  await expect(video).toHaveCount(1);
  await expect.poll(() => video.evaluate((element) => (element as HTMLVideoElement).readyState)).toBeGreaterThanOrEqual(1);

  await page.getByRole('button', { name: 'Play video' }).click();
  await video.evaluate((element) => {
    const media = element as HTMLVideoElement;
    media.currentTime = Math.max(0, media.duration - 0.25);
  });

  await expect(page.getByText('UP NEXT', { exact: true })).toBeVisible();
  await expect(page.getByText('Episode 2: Unexpected Encounter', { exact: true })).toBeVisible();
  await expect(page).toHaveURL(/\/watch\/the-ceos-second-chance\/2$/, { timeout: 6_000 });
});

test('a terminal playback error hands off to the next normalized candidate', async ({ page }) => {
  test.skip(process.env.NEXT_PUBLIC_REELAI_CONTENT_BACKEND !== 'supabase', 'Resolver candidate test runs in explicit Supabase mode.');
  await page.route('**/api/stream/**', async (route) => {
    const episodeId = route.request().url().match(/\/api\/stream\/([^?]+)/)?.[1] || '';
    const nativeCapabilities = { progressTracking: true, seek: true, pictureInPicture: true, playbackRate: true };
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ candidates: [
        { sourceDefinitionId: 'failure-candidate', episodeId, providerId: 'fallback-test', type: 'mp4', url: '/videos/does-not-exist.mp4', priority: 0, capabilities: nativeCapabilities },
        { sourceDefinitionId: 'working-candidate', episodeId, providerId: 'fallback-test', type: 'mp4', url: '/videos/reel-1.mp4', priority: 10, capabilities: nativeCapabilities },
      ] }),
    });
  });

  await page.goto('/watch/the-ceos-second-chance/1');
  const video = page.locator('video');
  await expect(video).toHaveCount(1);
  await expect.poll(() => video.getAttribute('src')).toContain('/videos/reel-1.mp4');
  await expect(page.getByText('All available playback sources failed.')).toHaveCount(0);
});

test('owned demo adapter resolves both watch and feed purposes through the server pathway', async ({ page }) => {
  test.skip(process.env.REELAI_DEMO_IMPORTED !== 'true', 'Runs after the owned demo catalog has been explicitly imported.');
  const resolverResponse = page.waitForResponse((response) => response.url().includes('/api/stream/') && response.url().includes('purpose=watch'));
  await page.goto('/watch/demo-the-ceos-second-chance/1');
  const response = await resolverResponse;
  expect(response.ok()).toBe(true);
  const payload = await response.json() as { candidates: Array<{ episodeId: string; providerId: string; type: string }> };
  expect(payload.candidates[0]).toMatchObject({ providerId: 'reelai-demo', type: 'mp4' });
  await expect(page.locator('video')).toHaveCount(1);

  const feedResponse = await page.request.get(`/api/stream/${payload.candidates[0].episodeId}?purpose=feed`);
  expect(feedResponse.ok()).toBe(true);
  const feedPayload = await feedResponse.json() as { candidates: Array<{ providerId: string; type: string }> };
  expect(feedPayload.candidates[0]).toMatchObject({ providerId: 'reelai-demo', type: 'mp4' });
});

test('resolver rejects malformed UUIDs, invalid purposes, and unknown episodes safely', async ({ request }) => {
  test.skip(process.env.NEXT_PUBLIC_REELAI_CONTENT_BACKEND !== 'supabase', 'Resolver validation runs in explicit Supabase mode.');
  const malformed = await request.get('/api/stream/not-a-uuid?purpose=watch');
  expect(malformed.status()).toBe(400);
  expect(await malformed.json()).toMatchObject({ error: { code: 'INVALID_RESOLVER_REQUEST' } });

  const invalidPurpose = await request.get('/api/stream/20000000-0000-4000-8000-000000000101?purpose=both&url=https://evil.example/video.mp4');
  expect(invalidPurpose.status()).toBe(400);
  expect(await invalidPurpose.json()).toMatchObject({ error: { code: 'INVALID_RESOLVER_REQUEST' } });

  const unknown = await request.get('/api/stream/ffffffff-ffff-4fff-8fff-ffffffffffff?purpose=watch');
  expect(unknown.status()).toBe(404);
  expect(await unknown.json()).toMatchObject({ error: { code: 'EPISODE_NOT_FOUND' } });
});
