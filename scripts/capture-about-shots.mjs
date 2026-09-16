/**
 * Captures the product screenshots the /about page shows, one set per realm, from the live
 * sites: the hero (a subject page on a desktop), the transcript page, and the phone views the
 * "for residents" cards use. Writes public/about/shots/<realm>/<name>.webp and
 * public/about/shots/manifest.json (the intrinsic size of each file, for next/image).
 *
 * Playwright is not a dependency of this repo. Either install it for the run:
 *
 *   npm i --no-save @playwright/test && npx playwright install chromium
 *   node scripts/capture-about-shots.mjs [realm ...]
 *
 * or point PLAYWRIGHT_FROM at the package.json of a checkout that has it. `cwebp` (brew install
 * webp) converts the PNG captures; without it the PNGs are kept and the manifest points at them.
 */
import { createRequire } from 'node:module'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import path from 'node:path'

const require = createRequire(process.env.PLAYWRIGHT_FROM ?? path.join(process.cwd(), 'package.json'))
const { chromium } = require('@playwright/test')

const OUT = path.join(process.cwd(), 'public', 'about', 'shots')

/** The demo (or flagship) city each realm shows, and the words its search has results for. */
const REALMS = {
    greece: { base: 'https://opencouncil.gr', city: 'athens', locale: 'el-GR', queries: ['ποδηλατόδρομος', 'πάρκο'] },
    france: { base: 'https://opencouncil.fr', city: 'rennes', locale: 'fr-FR', queries: ['budget', 'école'] },
    serbia: { base: 'https://opencouncil.rs', city: 'nis', locale: 'sr-RS', queries: ['буџет', 'школа', 'budžet'] },
    cyprus: { base: 'https://opencouncil.cy', city: 'vouli', locale: 'el-CY', queries: ['προϋπολογισμός', 'νομοσχέδιο'] },
}

/**
 * Subject pages outside Greece still render the (empty) Diavgeia decision card; Diavgeia is a
 * Greek register, and hiding that card outside the Greek realm is a pending product fix. Until
 * it lands, the capture removes the card so the hero shows the page as it is meant to look.
 */
async function hideDiavgeiaCard(page) {
    await page.evaluate(() => {
        const isCard = (el) => {
            const s = getComputedStyle(el)
            return parseFloat(s.borderRadius) >= 12 && s.borderStyle !== 'none' && s.borderWidth !== '0px'
        }
        const mentions = [...document.querySelectorAll('p, span, div')].filter((el) => {
            const text = el.textContent ?? ''
            return text.length < 300 && /diavgeia|διαύγεια|диавгеиа/i.test(text)
        })
        for (const node of mentions) {
            let el = node
            while (el && el !== document.body) {
                if (isCard(el)) {
                    el.remove()
                    break
                }
                el = el.parentElement
            }
        }
    })
}

const CONSENT_DECLINE = /Όχι, ευχαριστώ|Non merci|Не, хвала|Ne, hvala|No, thanks/i
const NO_RESULTS = /Δεν βρέθηκαν|Aucun résultat|Нема резултата|Nema rezultata|No results/i

const PHONE = {
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
    userAgent:
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
}
const DESKTOP = { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 }

/** The consent banner arrives a beat after load; give it a few chances. */
async function declineConsent(page) {
    for (let i = 0; i < 4; i++) {
        const btn = page.getByRole('button', { name: CONSENT_DECLINE }).first()
        if (await btn.isVisible().catch(() => false)) {
            await btn.click().catch(() => undefined)
            await page.waitForTimeout(500)
            return
        }
        await page.waitForTimeout(700)
    }
}

async function settle(page, url, extra = 3500) {
    await page.goto(url, { waitUntil: 'load', timeout: 60_000 })
    await page.waitForTimeout(extra)
    await declineConsent(page)
    // Park the pointer so nothing is in its hover state.
    await page.mouse.move(0, 0)
    await page.waitForTimeout(500)
}

/** A search with results: the page takes typed input, so type each candidate until one lands. */
async function search(page, base, queries) {
    for (const q of queries) {
        await settle(page, `${base}/search`, 2500)
        const input = page.locator('input').first()
        await input.click()
        await input.fill(q)
        await input.press('Enter')
        await page.waitForTimeout(6000)
        await declineConsent(page)
        await page.mouse.move(0, 0)
        await page.waitForTimeout(400)
        const text = await page.evaluate(() => document.body.innerText)
        if (!NO_RESULTS.test(text)) return q
        console.warn('  no results for', q)
    }
    return null
}

async function firstSubjectHref(page) {
    const hrefs = await page.$$eval('a[href]', (as) => as.map((a) => a.href))
    return hrefs.find((h) => /\/subjects\/[^/]+/.test(h)) ?? null
}

function toWebp(png, width) {
    const webp = png.replace(/\.png$/, '.webp')
    const r = spawnSync('cwebp', ['-quiet', '-resize', String(width), '0', '-q', '70', png, '-o', webp])
    if (r.status !== 0) return null
    rmSync(png)
    return webp
}

/** Intrinsic size of a PNG or WebP (VP8/VP8L/VP8X) file, for the manifest. */
function imageSize(file) {
    const b = readFileSync(file)
    if (b.toString('ascii', 1, 4) === 'PNG') return { width: b.readUInt32BE(16), height: b.readUInt32BE(20) }
    const chunk = b.toString('ascii', 12, 16)
    if (chunk === 'VP8 ') return { width: b.readUInt16LE(26) & 0x3fff, height: b.readUInt16LE(28) & 0x3fff }
    if (chunk === 'VP8L') {
        const bits = b.readUInt32LE(21)
        return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 }
    }
    if (chunk === 'VP8X') return { width: b.readUIntLE(24, 3) + 1, height: b.readUIntLE(27, 3) + 1 }
    throw new Error(`unknown image format: ${file}`)
}

const manifestPath = path.join(OUT, 'manifest.json')
const manifest = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, 'utf8')) : {}
const wanted = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(REALMS)

const browser = await chromium.launch({ headless: true })
try {
    for (const realm of wanted) {
        const cfg = REALMS[realm]
        if (!cfg) throw new Error(`unknown realm ${realm}`)
        const dir = path.join(OUT, realm)
        mkdirSync(dir, { recursive: true })
        const files = {}
        const shot = async (page, name, width, options = {}) => {
            const png = path.join(dir, `${name}.png`)
            await page.screenshot({ path: png, ...options })
            const file = toWebp(png, width) ?? png
            files[name] = { file: path.basename(file), ...imageSize(file) }
            console.log(' ', realm, name, files[name].width, 'x', files[name].height)
        }
        console.log(realm)

        const desktop = await browser.newContext({ ...DESKTOP, locale: cfg.locale })
        const dp = await desktop.newPage()
        await settle(dp, `${cfg.base}/${cfg.city}`)
        const subject = await firstSubjectHref(dp)
        if (!subject) throw new Error(`${realm}: no subject link on ${cfg.base}/${cfg.city}`)
        const meeting = subject.replace(/\/subjects\/.*$/, '')
        console.log('  subject', subject)
        await settle(dp, subject, 4000)
        if (realm !== 'greece') await hideDiavgeiaCard(dp)
        await shot(dp, 'hero-desktop', 1200)
        await settle(dp, `${meeting}/transcript`, 5000)
        await shot(dp, 'staff-transcript', 1200)
        await desktop.close()

        const phone = await browser.newContext({ ...PHONE, locale: cfg.locale })
        const mp = await phone.newPage()
        await settle(mp, subject, 4000)
        if (realm !== 'greece') await hideDiavgeiaCard(mp)
        await shot(mp, 'mobile-subject', 600)
        await settle(mp, `${meeting}/transcript`, 5000)
        await shot(mp, 'mobile-transcript', 600)
        const q = await search(mp, cfg.base, cfg.queries)
        if (!q) console.warn(`  ${realm}: every search query came back empty; the search shot shows an empty state`)
        await shot(mp, 'mobile-search', 600)
        // Map tiles keep streaming, so wait a fixed beat rather than for network idle.
        await settle(mp, `${cfg.base}/${cfg.city}/map`, 7000)
        await shot(mp, 'mobile-map', 600)
        await phone.close()

        manifest[realm] = { subject: new URL(subject).pathname, files }
        writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n')
    }
} finally {
    await browser.close()
}
console.log('wrote', manifestPath)
