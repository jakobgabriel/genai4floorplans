import { chromium } from "playwright-core";

const EXEC = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const BASE = process.env.BASE ?? "http://localhost:4173/";
const OUT = "/tmp/claude-0/-home-user-genai4floorplans/e0bd335c-e9fc-596a-9441-f193de960d87/scratchpad";

const browser = await chromium.launch({
  executablePath: EXEC,
  args: ["--no-proxy-server", "--proxy-bypass-list=*"],
});
const ctx = await browser.newContext({ viewport: { width: 1340, height: 950 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();
page.setDefaultTimeout(10000);
await page.goto(BASE, { waitUntil: "domcontentloaded" });

await page.waitForSelector("text=Start from the sample cell");
await page.click("text=Start from the sample cell");
await page.waitForSelector("text=Actual-state rating");

// Click the Assembly station (estimated cycle time).
const assembly = page.locator("text=Assembly").first();
await assembly.click({ force: true });
await page.locator(".grouptabs").getByRole("button", { name: "Build" }).click();
await page.locator(".subtabs").getByRole("button", { name: "Configure", exact: true }).click();
await page.waitForTimeout(500);
// Scroll the right rail down to the cycle-time / capex fields that carry the
// provenance selectors.
await page.locator("text=Cycle time (s)").scrollIntoViewIfNeeded();
await page.waitForTimeout(300);
await page.screenshot({ path: `${OUT}/verify-configure.png` });
console.log("saved verify-configure");

await browser.close();
