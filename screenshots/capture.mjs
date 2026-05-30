import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";

const EXEC = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const OUT = "screenshots";
mkdirSync(OUT, { recursive: true });

const BASE = process.env.BASE ?? "http://localhost:4173/";

async function shot(page, name) {
  await page.waitForTimeout(450);
  await page.screenshot({ path: `${OUT}/${name}.png` });
  console.log("saved", name);
}

// Side-panel navigation helpers for the grouped tab rail. A group button selects
// the group; a sub-tab chip (rendered only when its group is active) selects the
// panel. We click the group first (when needed) then the leaf.
const GROUP_OF = { Rating: "Insights", Balance: "Insights", Cost: "Insights", Flow: "Build", Configure: "Build" };
async function goTab(page, leaf) {
  const group = GROUP_OF[leaf];
  if (group) await page.locator(".grouptabs").getByRole("button", { name: group }).click();
  // Group-only panels (Automation, AI Chat) are reached by the group button itself.
  if (leaf === "Automation" || leaf === "AI Chat") {
    await page.locator(".grouptabs").getByRole("button", { name: leaf }).click();
    return;
  }
  // Leaf panels live in the sub-tab row (or are the group's default).
  await page.locator(".subtabs").getByRole("button", { name: leaf, exact: true }).click();
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

// 3) Balance tab (sub-tab of Insights)
await goTab(page, "Balance");
await page.waitForSelector("text=Line balance & bottleneck");
await shot(page, "03-balance");

// 4) Flow tab (Build group) — validation + templates + scenarios
await goTab(page, "Flow");
await page.waitForSelector("text=Cell form templates");
await shot(page, "04-flow");

// 5) Automation group
await goTab(page, "Automation");
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

// 9) AI Chat tab
await page.click('button:has-text("● Actual")');
await goTab(page, "AI Chat");
await page.waitForSelector("text=/Propose layout improvements/");
await page.click("text=/Propose layout improvements/");
await page.waitForSelector("text=/Sequence steps by flow/", { timeout: 5000 });
await shot(page, "10-copilot-proposals");

// 10) AI Chat narration + NL edit
await page.click("text=/Explain this grade/");
await page.waitForTimeout(400);
await shot(page, "11-copilot-narrate");

// 11) Customizable KPI weights (Rating tab)
await goTab(page, "Rating");
await page.click("text=/Adjust KPI weights/");
await page.waitForTimeout(300);
await shot(page, "12-weights");

// 12) Scenario comparison — save a named variant via the Flow panel, then compare
await goTab(page, "Flow");
const nameInput = page.locator('.side input[placeholder="name this variant…"]');
await nameInput.fill("Baseline");
await page.locator('.side').getByRole("button", { name: "Save", exact: true }).click();
await page.waitForTimeout(200);
// also save the optimizer floor as a second variant for a meaningful comparison
await goTab(page, "AI Chat");
await page.click("text=/Propose layout improvements/");
await page.waitForSelector("text=/Sequence steps by flow/", { timeout: 5000 });
await page.locator('button:has-text("Save as scenario")').first().click();
await page.waitForTimeout(200);
// Compare now lives in the header "⋯" overflow menu.
await page.locator("header").getByRole("button", { name: "⋯" }).click();
await page.getByRole("menuitem", { name: "Compare scenarios" }).click();
await page.waitForSelector("text=/Compare scenarios/");
await page.waitForTimeout(300);
await shot(page, "13-compare");
await page.locator(".modal").getByRole("button", { name: "✕" }).click();
await page.waitForTimeout(200);

// 13) Settings modal
await page.locator("header").getByRole("button", { name: "⚙" }).click();
await page.waitForSelector("text=/Configure AI Chat/");
await page.waitForTimeout(200);
await shot(page, "14-settings");
// 13b) Settings with the OpenAI provider selected (per-provider key + model fields)
await page.locator(".modal select").selectOption("openai");
await page.waitForSelector('text=/OpenAI API key/');
await page.waitForTimeout(200);
await shot(page, "25-settings-openai");
await page.locator(".modal").getByRole("button", { name: "Cancel" }).click();

// 14) DAG view
await page.click('button:has-text("⊟ DAG")');
await page.waitForSelector("text=PROCESS DAG");
await page.waitForTimeout(300);
await shot(page, "15-dag");

// 15) Freeform footprint editor + ports/scrap (select a DAG node -> Configure)
await page.click("text=CNC Turning");
await page.waitForSelector("text=/Footprint shape/");
await page.locator("text=/Footprint shape/").scrollIntoViewIfNeeded();
await page.waitForTimeout(200);
await shot(page, "16-cell-editor");

// 16) Yield & scrap (give CNC a scrap rate, then view Balance)
const scrapInput = page.locator('.side label.field:has-text("Scrap rate (%)") input');
await scrapInput.fill("8");
await goTab(page, "Balance");
await page.locator("text=/Rolled throughput yield/").scrollIntoViewIfNeeded();
await page.waitForTimeout(200);
await shot(page, "17-yield");

// 17) Parallel processing: give CNC 3 parallel lanes, then show canvas / DAG / balance
await page.click('button:has-text("⊟ DAG")');
await page.click("text=CNC Turning");
await page.waitForSelector("text=/Parallel units/");
const punits = page.locator('.side label.field:has-text("Parallel units") input');
await punits.fill("3");
await page.waitForTimeout(200);
await page.click('button:has-text("● Actual")');
await page.waitForTimeout(300);
await shot(page, "18-parallel-canvas");
await page.click('button:has-text("⊟ DAG")');
await page.waitForTimeout(300);
await shot(page, "19-dag-parallel");
await goTab(page, "Balance");
await page.locator("text=/Critical path/").scrollIntoViewIfNeeded();
await page.waitForTimeout(200);
await shot(page, "20-balance-critical");

// 21) Cost & ROI tab
await goTab(page, "Cost");
await page.waitForSelector("text=/Cost & ROI|Cost &amp; ROI|Operating cost per part/");
await page.waitForTimeout(200);
await shot(page, "21-cost");

// 22) AI Chat — goal-driven optimization plan
await goTab(page, "AI Chat");
await page.waitForSelector("text=/Goal-driven optimization/");
await page.locator("text=/Goal-driven optimization/").scrollIntoViewIfNeeded();
await page.click('button:has-text("Find a plan")');
await page.waitForSelector("text=/Add a parallel lane|No improving|Target reached|Best achievable/", { timeout: 5000 });
await page.waitForTimeout(300);
await shot(page, "22-ai-chat-goal");

// 23) Site rollup (add a second cell first)
await page.selectOption("select.cellSwitch", "__add").catch(() => {});
await page.waitForTimeout(300);
await page.locator("header").getByRole("button", { name: "Site" }).click();
await page.waitForSelector("text=/Site rollup/");
await page.waitForTimeout(200);
await shot(page, "23-site-rollup");
await page.locator(".modal").getByRole("button", { name: "✕" }).click();

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
