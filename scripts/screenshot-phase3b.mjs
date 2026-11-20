import { chromium } from 'playwright-core'
import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'

const origin = process.env.PHASE3B_URL ?? 'http://127.0.0.1:4173'
const base = '/ghostnote'
const outDir = resolve('screenshots/phase3b')

const viewports = [
  { name: 'desktop-1280x800', width: 1280, height: 800, mobile: false },
  { name: 'mobile-390x844', width: 390, height: 844, mobile: true },
]

const themes = ['kaleido', 'aqua', 'galaxy', 'laser']

const shots = [
  { id: 'library', path: `${base}/?intro=0&visual=high&theme=kaleido`, wait: 'library' },
  ...themes.map((theme) => ({
    id: `sing-${theme}`,
    path: `${base}/?sim=1&t=6000&intro=0&visual=high&theme=${theme}`,
    wait: 'sing',
  })),
]

await mkdir(outDir, { recursive: true })

const browser = await chromium.launch({
  channel: 'chrome',
  args: [
    '--headless=new',
    '--no-sandbox',
    '--autoplay-policy=no-user-gesture-required',
    '--use-gl=angle',
    '--use-angle=swiftshader',
  ],
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
    reducedMotion: 'no-preference',
  })
  await page.addInitScript(() => {
    localStorage.setItem('ghostnote-locale', 'en')
    sessionStorage.setItem('ghostnote-intro-seen', '1')
  })
  await page.goto(`${origin}${path}`, { waitUntil: 'networkidle' })
  await page.evaluate(() => document.fonts.ready)
  return page
}

for (const viewport of viewports) {
  for (const shot of shots) {
    const page = await openPage(viewport, shot.path)
    if (shot.wait === 'library') {
      await page.getByRole('heading', { name: 'Song library' }).waitFor({ timeout: 10_000 })
      await page.getByRole('heading', { name: 'Midnight Echo' }).first().waitFor()
      await page.getByRole('heading', { name: 'Visual theme' }).waitFor()
      await page.waitForTimeout(800)
    } else {
      await page.locator('.highway').waitFor({ timeout: 10_000 })
      await page.locator('.score-capsule-value').first().waitFor()
      await page.evaluate(() => window.__GHOSTNOTE__?.setTime(6000))
      await page.waitForTimeout(1200)
    }
    const file = resolve(outDir, `${shot.id}-${viewport.name}.png`)
    await page.screenshot({ path: file, fullPage: false })
    console.log('wrote', file)
    if (viewport.mobile && shot.id === 'library') {
      const full = resolve(outDir, `${shot.id}-${viewport.name}-fullpage.png`)
      await page.screenshot({ path: full, fullPage: true })
      console.log('wrote', full)
    }
    await page.close()
  }
}

const fpsPage = await openPage(viewports[0], `${base}/?sim=1&t=6000&intro=0&visual=high&theme=kaleido`)
await fpsPage.locator('.highway').waitFor({ timeout: 10_000 })
await fpsPage.evaluate(() => window.__GHOSTNOTE__?.setTime(6000))
await fpsPage.waitForTimeout(4500)
const visual = await fpsPage.evaluate(() => window.__GHOSTNOTE_VISUAL__ ?? null)
const webgl = await fpsPage.evaluate(() => Boolean(document.querySelector('.stage-bg-canvas')))
const dataTheme = await fpsPage.evaluate(() => document.documentElement.dataset.theme)
console.log(JSON.stringify({ visual, webgl, dataTheme }, null, 2))
await fpsPage.close()

await browser.close()
