const { chromium } = require('playwright');

const APP_URL = process.env.APP_URL || 'http://127.0.0.1:8081';

async function run() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 375, height: 812 } });

  await page.goto(APP_URL, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);

  try {
    await page.getByText('끝말잇기 챌린지').first().waitFor({ timeout: 15000 });
  } catch (_) {
    // keep capturing for diagnostics even if title text is delayed
  }

  const newGameButton = page.getByRole('button', { name: '새 게임 시작' });
  if (await newGameButton.isVisible().catch(() => false)) {
    await newGameButton.click();
    await page.waitForTimeout(600);
  }

  await page
    .locator('input[placeholder*="로 시작하는 단어 입력"]')
    .first()
    .waitFor({ timeout: 20000 });

  await page.screenshot({ path: 'raw/screen-1.png' });

  const placeholder = await page
    .locator('input[placeholder*="로 시작하는 단어 입력"]')
    .first()
    .getAttribute('placeholder');
  const match = (placeholder || '').match(/^([가-힣])로 시작하는 단어 입력$/);
  const required = match ? match[1] : '가';

  const input = page.getByPlaceholder(`${required}로 시작하는 단어 입력`);
  await input.fill(`${required}다`);
  await page.getByRole('button', { name: /연결|제출/ }).click();
  await page.waitForTimeout(900);

  await page.screenshot({ path: 'raw/screen-2.png' });

  const endButton = page.getByRole('button', { name: '이번 판 종료' });
  if (await endButton.isVisible()) {
    await endButton.click();
  }
  await page.waitForTimeout(800);

  const adButton = page.getByRole('button', { name: '광고 보고 이어하기' });
  if (await adButton.isVisible().catch(() => false)) {
    await adButton.scrollIntoViewIfNeeded();
  }

  await page.screenshot({ path: 'raw/screen-3.png' });

  await browser.close();
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
