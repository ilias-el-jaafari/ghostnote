import { chromium } from 'playwright-core'
import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'

const url = process.env.PHASE1_URL ?? 'http://127.0.0.1:4173/'
const outDir = resolve('screenshots/phase1')

const viewports = [
  { name: 'desktop-1280x800', width: 1280, height: 800 },
  { name: 'mobile-390x844', width: 390, height: 844 },
]

await mkdir(outDir, { recursive: true })

const browser = await chromium.launch({
  channel: 'chrome',
  args: ['--headless=new', '--no-sandbox', '--disable-gpu'],
})

for (const viewport of viewports) {
  const page = await browser.newPage({
    viewport: { width: viewport.width, height: viewport.height },
    deviceScaleFactor: 2,
    hasTouch: viewport.name.startsWith('mobile'),
    isMobile: viewport.name.startsWith('mobile'),
    userAgent: viewport.name.startsWith('mobile')
      ? 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
      : undefined,
  })

  await page.goto(url, { waitUntil: 'networkidle' })
  await page.getByRole('heading', { name: 'GhostNote' }).waitFor()
  await page.getByText('Midnight Echo', { exact: true }).waitFor()
  await page.evaluate(() => document.fonts.ready)
  await page.waitForTimeout(400)

  const viewportPath = resolve(outDir, `${viewport.name}.png`)
  await page.screenshot({ path: viewportPath, fullPage: false })
  console.log('wrote', viewportPath)

  if (viewport.name.startsWith('mobile')) {
    const fullPath = resolve(outDir, `${viewport.name}-fullpage.png`)
    await page.screenshot({ path: fullPath, fullPage: true })
    console.log('wrote', fullPath)
  }

  await page.close()
}

await browser.close()
