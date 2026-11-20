import { chromium } from 'playwright-core'
import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'

const origin = process.env.YOUTUBE_SHOT_URL ?? 'http://127.0.0.1:4175'
const base = '/ghostnote'
const outDir = resolve('screenshots/youtube')

const viewports = [
  { name: 'desktop-1280x800', width: 1280, height: 800, mobile: false },
  { name: 'mobile-390x844', width: 390, height: 844, mobile: true },
]

const shots = [
  { id: 'library', path: `${base}/?intro=0&visual=high&theme=kaleido`, wait: 'library' },
  {
    id: 'sing-miniplayer',
    path: `${base}/?sim=1&t=6000&intro=0&visual=high&theme=kaleido&ytmock=1`,
    wait: 'sing',
  },
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
      await page.getByLabel('YouTube URL').waitFor()
      await page.waitForTimeout(600)
    } else {
      await page.locator('.highway').waitFor({ timeout: 10_000 })
      await page.locator('.yt-mini').waitFor({ timeout: 10_000 })
      await page.evaluate(() => window.__GHOSTNOTE__?.setTime(6000))
      await page.waitForTimeout(1000)
    }
    const file = resolve(outDir, `${shot.id}-${viewport.name}.png`)
    await page.screenshot({ path: file, fullPage: false })
    console.log('wrote', file)
    if (viewport.mobile) {
      const full = resolve(outDir, `${shot.id}-${viewport.name}-fullpage.png`)
      await page.screenshot({ path: full, fullPage: true })
      console.log('wrote', full)
    }
    await page.close()
  }
}

await browser.close()
