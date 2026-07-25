// A screenshot walkthrough of the whole app, run against a dev server.
//
//   npm run -w @flowplan/web dev -- --port 5174
//   node scripts/walkthrough.mjs [baseUrl] [outDir]
//
// Every state is captured in the order a planner meets it, so the output reads
// as the user flow rather than as a pile of images. Each shot is numbered by
// section and named for what it shows.
//
// It is also a smoke test: any uncaught page error, any failed console error,
// and any step whose expected element never appears fails the run with a
// non-zero exit code. That means it catches the class of bug a unit test does
// not — a route that silently bounces, a panel that renders empty, a control
// that is there but unreachable.

import { chromium } from "playwright-core";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const BASE = (process.argv[2] || "http://localhost:5174").replace(/\/$/, "");
const OUT = process.argv[3] || "screenshots";
const EXEC = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium";

const shots = [];
const problems = [];
let n = 0;

function main() {
  rmSync(OUT, { recursive: true, force: true });
  mkdirSync(OUT, { recursive: true });
  return run();
}

async function run() {
  const browser = await chromium.launch({ executablePath: EXEC });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  page.on("pageerror", (e) => problems.push(`pageerror: ${e}`));
  page.on("console", (m) => {
    const t = m.text();
    // Network noise from the offline sandbox is not the app's fault.
    if (m.type() === "error" && !/Failed to load resource|ERR_|net::/.test(t)) problems.push(`console: ${t}`);
  });

  /** Capture, and assert the page is showing what this step claims. */
  const shot = async (name, caption, opts = {}) => {
    n += 1;
    const file = `${String(n).padStart(2, "0")}-${name}.png`;
    await page.waitForTimeout(opts.settle ?? 250);
    await page.screenshot({ path: join(OUT, file), fullPage: !!opts.full });
    shots.push({ file, caption });
    process.stdout.write(`  ${file}  ${caption}\n`);
  };

  const expect = async (locator, what) => {
    try {
      await locator.first().waitFor({ state: "visible", timeout: 4000 });
    } catch {
      problems.push(`missing: ${what}`);
    }
  };

  const fresh = async () => {
    await page.goto(BASE + "/", { waitUntil: "networkidle" });
    await page.evaluate(() => localStorage.clear());
    await page.reload({ waitUntil: "networkidle" });
  };

  // ---- 1. the front door -------------------------------------------------
  console.log("\n1. Portal");
  await fresh();
  await expect(page.getByText("Plan a cell"), "portal: Plan a cell tile");
  await expect(page.getByText("Process library"), "portal: Process library tile");
  await expect(page.getByText("Manufacturing concepts"), "portal: Concepts tile");
  await shot("portal", "The front door: four destinations, nothing chosen yet");

  // ---- 2. the process library, from empty to populated -------------------
  console.log("\n2. Process library");
  await page.getByText("Process library").first().click();
  await expect(page.getByRole("heading", { name: "Process library" }), "library heading");
  await expect(page.getByText("Library is empty"), "library empty state");
  await shot("library-empty", "Empty on arrival — nothing is seeded, and it says so");

  await page.getByRole("button", { name: /Import 12 built-in operations/ }).click();
  await expect(page.locator(".lib-page__row").first(), "library rows after import");
  await shot("library-imported", "The built-in operations, imported as ordinary entries you own");

  await page.locator(".lib-page__row", { hasText: "Weld" }).first().click();
  await expect(page.getByLabel("Cycle (s)"), "process editor");
  await shot("library-process", "One process, every field the station editor has", { full: true });

  await page.getByLabel("Name").fill("MIG weld");
  await page.getByLabel("Cycle (s)").fill("72");
  await page.getByLabel("Capex").fill("48000");
  await shot("library-edited", "Edited in place and persisted as you type");

  await page.getByRole("button", { name: /Add a field/ }).click();
  const field = page.locator(".lib-page__customRow").first();
  await field.getByRole("textbox", { name: "Field" }).fill("Tool no.");
  await field.getByRole("textbox", { name: "Value" }).fill("T-4471");
  await shot("library-customfield", "The extendable half: a field the tool does not model and never interprets");

  await page.getByRole("button", { name: "Edit tags" }).click();
  for (const tag of ["Joining", "Fume extraction"]) {
    await page.getByLabel("New tag").fill(tag);
    await page.getByRole("button", { name: /Add tag/ }).click();
  }
  await shot("library-tagedit", "Tags are editable — name and colour, added and deleted here");

  await page.getByRole("button", { name: "Done" }).click();
  const tagPick = page.locator(".lib-page__tagPick");
  await tagPick.getByRole("tab", { name: "Joining" }).click();
  await tagPick.getByRole("tab", { name: "Fume extraction" }).click();
  await shot("library-tagged", "One process in two categories — which is why it is tagging, not a category field");

  await page.locator(".lib-page__filters").getByRole("tab", { name: /^Joining/ }).click();
  await shot("library-filtered", "Filtered to a tag");
  await page.locator(".lib-page__filters").getByRole("tab", { name: /^All/ }).click();

  await page.getByPlaceholder("Name, capability, note or custom field").fill("T-4471");
  await expect(page.locator(".lib-page__row"), "search hit on a custom field");
  await shot("library-search", "Search reaches the notes and your own fields, not just the name");
  await page.getByPlaceholder("Name, capability, note or custom field").fill("");

  await page.getByRole("button", { name: "New process" }).click();
  await page.getByLabel("Name").fill("Laser mark");
  await shot("library-new", "A new entry fills itself in from the name, using the inference catalog");

  // ---- 3. the concept catalog --------------------------------------------
  console.log("\n3. Manufacturing concepts");
  await page.goto(BASE + "/#/concepts", { waitUntil: "networkidle" });
  await expect(page.getByRole("heading", { name: "Manufacturing concepts" }), "concepts heading");
  await shot("concepts-list", "The assumptions behind every ranking, no longer a constant in a source file");

  await page.locator(".lib-page__row", { hasText: "U-cell" }).first().click();
  await expect(page.getByLabel("Cycle multiplier"), "concept editor");
  await shot("concepts-edit", "One concept: volume band, forms, manning, capex, cycle multiplier", { full: true });

  await page.getByLabel("Capex per station").fill("60000");
  await shot("concepts-edited", "Corrected to this plant's machine park — the sweep re-ranks against it");

  await page.getByLabel("New concept").fill("Chaku-chaku");
  await page.locator(".lib-page__tagNew").getByRole("button", { name: /^Add/ }).click();
  await expect(page.getByLabel("Cycle multiplier"), "new concept editor");
  await shot("concepts-new", "A concept of your own, not one of the five the app knows about");

  // ---- 4. planning: parts and demand -------------------------------------
  console.log("\n4. Plan a cell");
  await page.goto(BASE + "/#/", { waitUntil: "networkidle" });
  await page.getByText("Plan a cell").first().click();
  await expect(page.getByRole("heading", { name: "Parts & demand" }), "demand step");
  await shot("plan-demand-empty", "Stage 1: one part row, and Continue disabled until it carries work");

  const row = (i) => page.locator("tbody tr").nth(i).locator("input");
  await page.getByRole("button", { name: /Build PN-001's routing from the library/ }).click();
  await expect(page.locator(".parts__picker"), "routing picker");
  await shot("plan-picker", "Building a routing from the library instead of typing it");

  const pick = page.locator(".parts__picker");
  for (const step of ["Load / unload", "CNC machining", "MIG weld", "Function test", "Pack"]) {
    const btn = pick.getByRole("button", { name: new RegExp("Add — " + step.replace(/[/\\]/g, "\\$&")) });
    if (await btn.count()) await btn.first().click();
  }
  await pick.getByRole("button", { name: "Done" }).click();
  await row(0).nth(2).fill("120000");
  await row(0).nth(3).fill("250000");
  await shot("plan-demand-one", "Sized against the busiest year, not an averaged annual figure");

  await page.getByRole("button", { name: "Add a part" }).click();
  await row(1).nth(1).fill("Load / unload 15 > CNC machining 45 > Pack 20");
  await row(1).nth(2).fill("60000");
  for (let i = 0; i < 3; i++) await page.getByRole("button", { name: /One year more/ }).click();
  await shot("plan-demand-mix", "Two parts, two mixes, an eight-year program — the columns follow the years", {
    full: true,
  });

  // ---- 5. concepts, refine, summary --------------------------------------
  console.log("\n5. Concepts → Refine → Summary");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("heading", { name: "Concept comparison" }), "concepts stage");
  await shot("plan-concepts", "Stage 2: every concept × form, ranked by fully loaded cost", { full: true });

  await page.getByRole("button", { name: "Weights" }).click();
  await expect(page.locator(".dw"), "decision weights editor");
  await shot("plan-weights", "What 'best' means, as five weights — cost alone reproduces the old ranking");
  await page.getByRole("button", { name: "Hide weights" }).click();

  await page.getByRole("button", { name: "Volume crossover" }).click();
  await expect(page.locator(".xover__band"), "crossover band");
  await shot("plan-crossover", "Where the winner changes, how close each call is, and where the catalog runs out", {
    full: true,
    settle: 600,
  });

  await page.getByRole("button", { name: "Sensitivity" }).click();
  await expect(page.locator(".xover").last(), "sensitivity table");
  await shot("plan-sensitivity", "Whether the winner survives being wrong about any single input", {
    full: true,
    settle: 600,
  });

  await page.getByRole("button", { name: "Refine this layout" }).click();
  await expect(page.getByRole("tab", { name: "Flow" }), "editor rail");
  await shot("plan-refine", "Stage 3: the editor, with the chosen concept loaded onto the canvas");

  await page.getByRole("button", { name: /Add from library/ }).click();
  await expect(page.locator(".pnl-picker"), "rail library picker");
  await shot("refine-library", "The same library in the rail — a placed step arrives with its numbers");
  await page.getByRole("button", { name: /Close the library/ }).click();

  await page.locator(".editorbar__cell").click();
  await expect(page.getByRole("heading", { name: "Layouts" }), "layouts drawer");
  await shot("refine-layouts", "The drawer overlays the canvas and holds layouts only");
  await page.getByRole("button", { name: "Close the panel" }).click();

  // ---- layout editing, proven rather than assumed ------------------------
  console.log("\n5b. Editing the layout");
  // A movable process step. Index 1 in DOM order: [Incoming, ...process, Shipping],
  // and the I/O areas are fixed so they will not drag. Grabbed and measured by
  // the SAME index — reading a different node than the one dragged reports a
  // failure that is the script's, not the app's.
  const STATION_IX = 1;
  const movable = page.locator("svg [data-station-id]").nth(STATION_IX);
  const posOf = () =>
    page.evaluate((i) => {
      const el = document.querySelectorAll("svg [data-station-id]")[i];
      return el ? `${el.getAttribute("data-station-x")},${el.getAttribute("data-station-y")}` : null;
    }, STATION_IX);
  const before = await posOf();
  const box = await movable.boundingBox();
  if (!box) problems.push("layout: no station to drag");
  else {
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 130, box.y + box.height / 2 + 70, { steps: 14 });
    await page.mouse.up();
    await page.waitForTimeout(200);
  }
  const after = await posOf();
  if (before && before === after) problems.push(`layout: dragging a station did not move it (stayed at ${before})`);
  else console.log(`  station moved ${before} -> ${after}`);
  await shot("refine-dragged", "A station dragged on the canvas — the layout is still editable by hand");

  // Dragging selects the station, which swings the rail to Element — the form
  // templates live on Flow.
  await page.getByRole("tab", { name: "Flow" }).click();
  await page.getByRole("button", { name: "U-cell", exact: true }).click();
  await page.waitForTimeout(200);
  const afterTemplate = await posOf();
  if (afterTemplate === after) problems.push("layout: applying a cell form did not rearrange the steps");
  await shot("refine-template", "A cell form re-applied, rearranging the movable steps");

  await page.getByRole("button", { name: "Analysis" }).click();
  await expect(page.getByRole("heading", { name: "Analysis" }), "analysis page");
  await shot("analysis", "The whole assessment at full width, in path order", { full: true });

  // ---- the recommender, for the cell that is open ------------------------
  await page.goto(BASE + "/#/recommend", { waitUntil: "networkidle" });
  await expect(page.getByRole("heading", { name: "Concept recommendations" }), "recommend heading");
  await shot("recommend", "Concepts for the cell you already have, from the steps on its canvas", { full: true });

  await page.goto(BASE + "/#/report", { waitUntil: "networkidle" });
  await expect(page.getByRole("heading", { name: "Assessment report" }), "report page");
  await shot("report", "The record that leaves the tool: brief, concept, layout, assessment, open items", {
    full: true,
  });

  await page.goto(BASE + "/#/", { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Continue to summary" }).click();
  await expect(page.getByText("Planning estimate"), "summary stage");
  await shot("plan-summary", "Stage 4: the decision, and what it costs", { full: true });

  // ---- 6. the other pages ------------------------------------------------
  console.log("\n6. Everything else");
  for (const [route, heading, name, caption] of [
    ["/site", "Site overview", "site", "Every cell in the workspace, side by side"],
    ["/compare", "Compare variants", "compare", "Saved scenarios against each other"],
    ["/assistant", "Assistant", "assistant", "Engine-scored proposals, offline"],
    ["/archive", "Archive", "archive", "Archived layouts and folders, restorable"],
    ["/admin", "Admin", "admin", "Teams and workspaces"],
  ]) {
    await page.goto(BASE + "/#" + route, { waitUntil: "networkidle" });
    await expect(page.getByRole("heading", { name: new RegExp(heading, "i") }), `${route} heading`);
    await shot(name, caption);
  }

  // ---- the index ---------------------------------------------------------
  writeFileSync(
    join(OUT, "README.md"),
    [
      "# Walkthrough",
      "",
      `Captured from ${BASE} by \`scripts/walkthrough.mjs\`. Regenerate rather than editing.`,
      "",
      ...shots.map((s) => `### ${s.file}\n\n${s.caption}\n\n![${s.caption}](./${s.file})\n`),
    ].join("\n"),
  );

  await browser.close();

  console.log(`\n${shots.length} screenshots in ${OUT}/`);
  if (problems.length) {
    console.error(`\n${problems.length} problem(s):`);
    problems.forEach((p) => console.error("  - " + p));
    process.exitCode = 1;
  } else {
    console.log("No page errors, no missing elements.");
  }
}

await main();
