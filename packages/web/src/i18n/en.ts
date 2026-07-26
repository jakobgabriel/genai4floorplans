// English — the source strings. Every other language falls back to these, so a
// key present here but missing elsewhere still renders readable text.
export const en: Record<string, string> = {
  // top bar
  "nav.theme.toLight": "Switch to light theme",
  "nav.theme.toDark": "Switch to dark theme",
  "nav.language": "Language",

  // common actions
  "common.startBlank": "Start blank",
  "common.importJson": "Import a JSON model",
  "common.newPlan": "New plan",
  "common.open": "Open",
  "common.back": "Back",
  "common.editor": "Editor",
  "common.rename": "Rename",
  "common.duplicate": "Duplicate",
  "common.archive": "Archive",
  "common.list": "List",
  "common.tiles": "Tiles",

  // portal / start screen
  "portal.subtitle": "Manufacturing cell sizing, concept comparison and layout assessment.",
  "portal.group.planning": "Cells & planning",
  "portal.group.libraries": "Libraries",
  "portal.planACell.title": "Plan a cell",
  "portal.planACell.body": "Size a cell from its part demand, compare costed concepts, refine and assess the layout.",
  "portal.planACell.meta": "Parts & demand → Concepts → Refine → Summary",
  "portal.cellPlans.title": "Cell plans",
  "portal.cellPlans.body": "Every plan you have saved, in one place — open one to keep working, or manage the store.",
  "portal.cellPlans.empty": "No plans yet",
  "portal.cellPlans.count": "{n} plans saved",
  "portal.cellPlans.count_one": "1 plan saved",
  "portal.library.title": "Process library",
  "portal.library.body":
    "Process steps with cycle, manning, changeover, capex and footprint. Reused across routings and cells.",
  "portal.library.empty": "Empty",
  "portal.library.count": "{n} processes",
  "portal.library.count_one": "1 process",
  "portal.concepts.title": "Manufacturing concepts",
  "portal.concepts.body":
    "Concept profiles the comparison is generated from — volume band, cycle multiplier, manning and capex.",
  "portal.concepts.none": "None defined",
  "portal.concepts.shipped": "{n} concepts · as shipped",
  "portal.concepts.edited": "{n} concepts · edited",
  "portal.notImplemented": "Serial-production monitoring is not implemented — see docs/lifecycle-cases-implementation.md §6.",

  // cell plans store
  "plans.title": "Cell plans",
  "plans.empty.title": "No plans yet",
  "plans.empty.body": "Plan a cell, and it is saved here as you go.",
  "plans.col.plan": "Plan",
  "plans.col.grade": "Grade",
  "plans.col.output": "Output",
  "plans.col.cost": "Cost/part",
  "plans.col.steps": "Steps",
  "plans.col.actions": "Actions",
};
