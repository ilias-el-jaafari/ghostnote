import { chromium } from 'playwright-core'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const origin = process.env.SHOT_URL ?? 'http://127.0.0.1:4177'
const base = '/ghostnote'
const outDir = resolve('screenshots/instrumental')
await mkdir(outDir, { recursive: true })

const browser = await chromium.launch({
  channel: 'chrome',
  args: [
    '--headless=new',
    '--no-sandbox',
    '--autoplay-policy=no-user-gesture-required',
    '--use-fake-ui-for-media-stream',
    '--use-fake-device-for-media-stream',
    '--use-gl=angle',
    '--use-angle=swiftshader',
  ],
})

async function openPage({ width, height, mobile, path, interceptSearch = false }) {
  const page = await browser.newPage({
    viewport: { width, height },
    deviceScaleFactor: 2,
    hasTouch: mobile,
    isMobile: mobile,
    userAgent: mobile
      ? 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'
      : undefined,
    permissions: ['microphone'],
  })
  await page.addInitScript(() => {
    localStorage.setItem('ghostnote-locale', 'en')
    sessionStorage.setItem('ghostnote-intro-seen', '1')
  })
  if (interceptSearch) {
    await page.route(/piped|invidious|googleapis\.com\/youtube/i, (route) =>
      route.abort('failed'),
    )
  }
  await page.goto(`${origin}${path}`, { waitUntil: 'domcontentloaded', timeout: 45_000 })
  await page.evaluate(() => document.fonts.ready).catch(() => undefined)
  return page
}

async function shot(page, name, fullPage = false) {
  const file = resolve(outDir, name)
  await page.screenshot({ path: file, fullPage })
  console.log('wrote', file)
}

// 1. Failed search → fallback notice + provider status
const fallback = await openPage({
  width: 1280,
  height: 800,
  mobile: false,
  path: `${base}/?intro=0&visual=high&theme=kaleido&source=instrumental`,
  interceptSearch: true,
})
await fallback.getByRole('heading', { name: 'Song library' }).waitFor({ timeout: 15_000 })
await fallback.getByText('No instrumental found, playing original').waitFor({ timeout: 15_000 })
await fallback.getByText(/failed/i).first().waitFor({ timeout: 8_000 }).catch(() => undefined)
await fallback.locator('.search-attempts, .banner-warn, .instrumental, .source-card').first().scrollIntoViewIfNeeded().catch(() => undefined)
await shot(fallback, 'fallback-notice-desktop-1280x800.png')
await shot(fallback, 'fallback-notice-desktop-1280x800-fullpage.png', true)
await fallback.close()

const fallbackMobile = await openPage({
  width: 390,
  height: 844,
  mobile: true,
  path: `${base}/?intro=0&visual=high&theme=kaleido&source=instrumental`,
  interceptSearch: true,
})
await fallbackMobile.getByText('No instrumental found, playing original').waitFor({ timeout: 15_000 })
await shot(fallbackMobile, 'fallback-notice-mobile-390x844.png')
await shot(fallbackMobile, 'fallback-notice-mobile-390x844-fullpage.png', true)
await fallbackMobile.close()

// 2. Mic debug panel with applied settings (fake device)
const mic = await openPage({
  width: 390,
  height: 844,
  mobile: true,
  path: `${base}/?intro=0&theme=kaleido`,
})
await mic.getByRole('heading', { name: 'Microphone' }).waitFor({ timeout: 15_000 }).catch(async () => {
  // title may be localized or different — fall back to the debug heading
  await mic.getByRole('heading', { name: 'Mic debug capture' }).waitFor({ timeout: 10_000 })
})
const startMic = mic.getByRole('button', { name: /Start microphone/i })
if (await startMic.count()) {
  await startMic.click()
  await mic.getByText('Applied mic settings').waitFor({ timeout: 10_000 }).catch(() => undefined)
}
await mic.getByRole('heading', { name: 'Mic debug capture' }).scrollIntoViewIfNeeded()
await shot(mic, 'mic-debug-mobile-390x844.png')
await shot(mic, 'mic-debug-mobile-390x844-fullpage.png', true)
await mic.close()

// 3. Real YouTube mini-player with a public-domain / CC video
const playLog = { miniPlayer: false, iframe: false, state: null, error: null, currentTime: null }
const yt = await openPage({
  width: 1280,
  height: 800,
  mobile: false,
  path: `${base}/?intro=0&sim=1&autoplay=1&source=instrumental&yt=aqz-KE-bpKQ&t=2000&visual=off`,
})
try {
  await yt.locator('.yt-mini').waitFor({ timeout: 20_000 })
  playLog.miniPlayer = true
  const iframe = yt.frameLocator('.yt-mini-host iframe, .yt-mini iframe, iframe')
  const iframeEl = yt.locator('.yt-mini iframe, iframe[src*="youtube"], iframe[src*="youtube-nocookie"]')
  await iframeEl.first().waitFor({ timeout: 20_000 }).catch(() => undefined)
  playLog.iframe = (await iframeEl.count()) > 0
  playLog.iframeSrc = playLog.iframe ? await iframeEl.first().getAttribute('src') : null
  // Click play if a transport button is shown
  const playBtn = yt.locator('.yt-play')
  if (await playBtn.count()) {
    await playBtn.first().click({ timeout: 3_000 }).catch(() => undefined)
  }
  await yt.waitForTimeout(4000)
  playLog.currentTime = await yt.locator('.yt-time').first().textContent().catch(() => null)
  playLog.playingClass = await yt.locator('.yt-spectrum.is-playing, .yt-mini').evaluateAll((nodes) =>
    nodes.map((n) => n.className),
  )
  await shot(yt, 'youtube-cc-miniplayer-desktop-1280x800.png')
} catch (error) {
  playLog.error = String(error)
  await shot(yt, 'youtube-cc-miniplayer-desktop-1280x800.png').catch(() => undefined)
}
await writeFile(resolve(outDir, 'youtube-cc-probe.json'), `${JSON.stringify(playLog, null, 2)}\n`)
console.log('youtube probe', playLog)
await yt.close()

await browser.close()
