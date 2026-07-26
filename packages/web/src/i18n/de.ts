// Deutsch. Missing keys fall back to English, so partial coverage is safe.
export const de: Record<string, string> = {
  // top bar
  "nav.theme.toLight": "Zum hellen Design wechseln",
  "nav.theme.toDark": "Zum dunklen Design wechseln",
  "nav.language": "Sprache",

  // common actions
  "common.startBlank": "Leer beginnen",
  "common.importJson": "JSON-Modell importieren",
  "common.newPlan": "Neuer Plan",
  "common.open": "Öffnen",
  "common.back": "Zurück",
  "common.editor": "Editor",
  "common.rename": "Umbenennen",
  "common.duplicate": "Duplizieren",
  "common.archive": "Archivieren",
  "common.list": "Liste",
  "common.tiles": "Kacheln",

  // portal / start screen
  "portal.subtitle": "Auslegung von Fertigungszellen, Konzeptvergleich und Layout-Bewertung.",
  "portal.group.planning": "Zellen & Planung",
  "portal.group.libraries": "Bibliotheken",
  "portal.planACell.title": "Zelle planen",
  "portal.planACell.body":
    "Eine Zelle aus dem Teilebedarf auslegen, kalkulierte Konzepte vergleichen, das Layout verfeinern und bewerten.",
  "portal.planACell.meta": "Teile & Bedarf → Konzepte → Verfeinern → Zusammenfassung",
  "portal.cellPlans.title": "Zellenpläne",
  "portal.cellPlans.body":
    "Alle gespeicherten Pläne an einem Ort — einen öffnen, um weiterzuarbeiten, oder den Speicher verwalten.",
  "portal.cellPlans.empty": "Noch keine Pläne",
  "portal.cellPlans.count": "{n} Pläne gespeichert",
  "portal.cellPlans.count_one": "1 Plan gespeichert",
  "portal.library.title": "Prozessbibliothek",
  "portal.library.body":
    "Prozessschritte mit Taktzeit, Personal, Rüstzeit, Investition und Flächenbedarf. Über Routen und Zellen hinweg wiederverwendbar.",
  "portal.library.empty": "Leer",
  "portal.library.count": "{n} Prozesse",
  "portal.library.count_one": "1 Prozess",
  "portal.concepts.title": "Fertigungskonzepte",
  "portal.concepts.body":
    "Konzeptprofile, aus denen der Vergleich erzeugt wird — Stückzahlband, Taktfaktor, Personal und Investition.",
  "portal.concepts.none": "Keine definiert",
  "portal.concepts.shipped": "{n} Konzepte · Auslieferungszustand",
  "portal.concepts.edited": "{n} Konzepte · bearbeitet",
  "portal.notImplemented":
    "Serienüberwachung ist nicht implementiert — siehe docs/lifecycle-cases-implementation.md §6.",

  // cell plans store
  "plans.title": "Zellenpläne",
  "plans.empty.title": "Noch keine Pläne",
  "plans.empty.body": "Plane eine Zelle — sie wird hier fortlaufend gespeichert.",
  "plans.col.plan": "Plan",
  "plans.col.grade": "Note",
  "plans.col.output": "Ausbringung",
  "plans.col.cost": "Kosten/Teil",
  "plans.col.steps": "Schritte",
  "plans.col.actions": "Aktionen",
};
