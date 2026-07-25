import { chromium } from "playwright-core";
const OUT = "/tmp/claude-0/-home-user-genai4floorplans/e567067a-b86f-5e49-9b09-ddf375f11214/scratchpad";
const TAG = process.argv[2] || "x";
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const page = await b.newPage({ viewport: { width: 1680, height: 1000 } });
const errs = [];
page.on("pageerror", (e) => errs.push("PAGEERROR " + e.message.slice(0, 200)));

await page.goto("http://localhost:5174/", { waitUntil: "networkidle" });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: "networkidle" });
await page.screenshot({ path: `${OUT}/${TAG}-1-situation.png` });

await page.locator(".planner__tile:not(.planner__tile--off)").first().click();
await page.waitForTimeout(500);
for (const [i, name] of ["demand", "process", "concepts"].entries()) {
  const nx = page.getByRole("button", { name: /^(Continue|Refine this layout)$/ });
  if (!(await nx.count()) || (await nx.first().isDisabled())) break;
  await nx.first().click();
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${OUT}/${TAG}-${i + 2}-${name}.png` });
}
await page.waitForTimeout(600);
await page.screenshot({ path: `${OUT}/${TAG}-5-editor.png` });

const ts = page.getByRole("button", { name: "Continue to summary" });
if (await ts.count()) {
  await ts.first().click();
  await page.waitForTimeout(800);
}
await page.screenshot({ path: `${OUT}/${TAG}-6-summary.png`, fullPage: true });

const or = page.getByRole("button", { name: "Open the full report" });
if (await or.count()) {
  await or.first().click();
  await page.waitForTimeout(1200);
}
await page.screenshot({ path: `${OUT}/${TAG}-7-report.png`, fullPage: true });

for (const [route, name] of [["/compare", "compare"], ["/site", "site"], ["/admin", "admin"], ["/archive", "archive"]]) {
  await page.evaluate((r) => (location.hash = r), route);
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${OUT}/${TAG}-8-${name}.png` });
}

// Narrow + medium widths on the editor.
await page.evaluate(() => (location.hash = "/"));
await page.waitForTimeout(600);
for (const w of [1024, 720]) {
  await page.setViewportSize({ width: w, height: 900 });
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${OUT}/${TAG}-9-w${w}.png` });
}

console.log("ERRORS:", JSON.stringify(errs, null, 1));
await b.close();
