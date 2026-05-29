import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";

const EXEC = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const OUT = "screenshots";
mkdirSync(OUT, { recursive: true });

const BASE = "http://localhost:4173/";

async function shot(page, name) {
  await page.waitForTimeout(450);
  await page.screenshot({ path: `${OUT}/${name}.png` });
  console.log("saved", name);
}

const browser = await chromium.launch({ executablePath: EXEC });

// ---------- Desktop flow ----------
const ctx = await browser.newContext({ viewport: { width: 1340, height: 900 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();
await page.goto(BASE, { waitUntil: "networkidle" });

// 1) First-run onboarding
await page.waitForSelector("text=Start from the sample cell");
await shot(page, "01-onboarding");

// 2) Sample loaded -> Rating tab / Actual view (default)
await page.click("text=Start from the sample cell");
await page.waitForSelector("text=Actual-state rating");
await shot(page, "02-rating-actual");

// 3) Balance tab
await page.click('button:has-text("Balance")');
await page.waitForSelector("text=Line balance & bottleneck");
await shot(page, "03-balance");

// 4) Flow tab (validation + templates + settings + scenarios)
await page.click('button:has-text("Flow")');
await page.waitForSelector("text=Cell form templates");
await shot(page, "04-flow");

// 5) Automation tab
await page.click('button:has-text("Automation")');
await page.waitForSelector("text=Automation chaining");
await shot(page, "05-automation");

// 6) Configure: select a station on the canvas, then it jumps to Configure
const cnc = page.locator('svg[data-layout="ACTUAL"] >> text=CNC Turning').first();
const box = await cnc.boundingBox();
if (box) await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
await page.waitForSelector("text=/Configure ·/");
await shot(page, "06-configure");

// 7) Improved view
await page.click('button:has-text("◇ Improved")');
await page.waitForTimeout(300);
await shot(page, "07-improved");

// 8) Both / split view
await page.click('button:has-text("⇄ Both")');
await page.waitForTimeout(300);
await shot(page, "08-split");

await ctx.close();

// ---------- Mobile flow ----------
const mctx = await browser.newContext({
  viewport: { width: 390, height: 780 },
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
});
const mpage = await mctx.newPage();
await mpage.goto(BASE, { waitUntil: "networkidle" });
// reuse autosave from desktop? separate context => fresh storage => onboarding again
await mpage.waitForSelector("text=Start from the sample cell");
await mpage.click("text=Start from the sample cell");
await mpage.waitForSelector("text=Actual-state rating");
await mpage.waitForTimeout(450);
await mpage.screenshot({ path: `${OUT}/09-mobile.png`, fullPage: true });
console.log("saved 09-mobile");

await mctx.close();
await browser.close();
console.log("done");
