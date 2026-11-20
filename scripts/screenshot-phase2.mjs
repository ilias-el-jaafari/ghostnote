import { chromium } from 'playwright-core'
import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'

const origin = process.env.PHASE2_URL ?? 'http://127.0.0.1:4173'
const outDir = resolve('screenshots/phase2')

const viewports = [
  { name: 'desktop-1280x800', width: 1280, height: 800, mobile: false },
  { name: 'mobile-390x844', width: 390, height: 844, mobile: true },
]

await mkdir(outDir, { recursive: true })

const browser = await chromium.launch({
  channel: 'chrome',
  args: ['--headless=new', '--no-sandbox', '--disable-gpu'],
})

async function openPage(viewport, path) {
  const page = await browser.newPage({
    viewport: { width: viewport.width, height: viewport.height },
    deviceScaleFactor: 2,
    hasTouch: viewport.mobile,
    isMobile: viewport.mobile,
    userAgent: viewport.mobile
      ? 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
      : undefined,
  })
  await page.addInitScript(() => {
    localStorage.setItem('ghostnote-locale', 'en')
  })
  await page.goto(`${origin}${path}`, { waitUntil: 'networkidle' })
  await page.evaluate(() => document.fonts.ready)
  return page
}

for (const viewport of viewports) {
  const sing = await openPage(viewport, '/?sim=1&t=6000')
  await sing.locator('.highway').waitFor({ timeout: 10_000 })
  await sing.locator('.sing-score-value').waitFor()
  await sing.evaluate(() => window.__GHOSTNOTE__?.setTime(6000))
  await sing.waitForTimeout(200)
  const singPath = resolve(outDir, `sing-${viewport.name}.png`)
  await sing.screenshot({ path: singPath, fullPage: false })
  console.log('wrote', singPath)
  await sing.close()

  const results = await openPage(viewport, '/?sim=1&screen=results')
  await results.getByText('Ultrastar', { exact: true }).waitFor({ timeout: 10_000 })
  await results.waitForTimeout(300)
  const resultsPath = resolve(outDir, `results-${viewport.name}.png`)
  await results.screenshot({ path: resultsPath, fullPage: false })
  console.log('wrote', resultsPath)
  if (viewport.mobile) {
    const fullPath = resolve(outDir, `results-${viewport.name}-fullpage.png`)
    await results.screenshot({ path: fullPath, fullPage: true })
    console.log('wrote', fullPath)
  }
  await results.close()
}

await browser.close()
