# Audit-Log — Fachliche Abnahme FlowPlan / Line Planner

**Prüfgegenstand:** FlowPlan (Cell- & Material-Flow-Assessment, React/TypeScript-Monorepo)
**Prüfperspektive:** Shopfloor-/Prozessplanung — Maschinenlayout, Zellformen, Auslastungs-/Kapazitätsmodelle, Zykluszeit- und Taktoptimierung, Bottleneck-Analyse, Yamazumi/Line-Balancing
**Prüfart:** Fachliche Qualitäts- und Freigabeprüfung (Abnahme) gegen `docs/line-planner-spec.md` v1.0 und die als gebaut dokumentierte `docs/flowplanspec.md`
**Prüfdatum:** 2026-07-21
**Prüfstände:** `git HEAD` = `f9be0dd`, Branch `claude/shopfloor-planning-app-audit-9xsxll`

---

## 0b. Umsetzungsstand (Nachtrag, Stand HEAD dieses Branches)

> Die unten in Abschnitt A–D dokumentierten Befunde wurden nach der Erstprüfung im
> selben Branch **abgearbeitet**. Dieser Nachtrag hält fest, was behoben ist. Der
> ursprüngliche Befundtext bleibt zur Nachvollziehbarkeit unverändert stehen.

| Befund | Titel | Status | Umsetzung |
|---|---|---|---|
| **A-01** | Takt aus Ist-Ausstoß | ✅ behoben | `engine/takt.ts` (`customerTaktSec`), `balance.ts` liefert Kundentakt + `lineCycleSec`; UI trennt Takt/Line-pace |
| **A-02** | Operatoren × Maschinendurchsatz | ✅ behoben | `operatorPaceLanes` — Operatoren skalieren nur `manual`; Maschinen über `parallelUnits` |
| **A-03** | Placement = Flow-Kopie | ✅ behoben | `placementScore` (Kompaktheit), eigenständig |
| **A-04** | Congestion inert | ✅ behoben | share-of-travel, Floor-Fallback entfernt |
| **A-05** | Yield/Rüsten ohne Wirkung | ✅ teilweise | Yield propagiert (Gutteile); Rüst-Kapazitätsverlust braucht Losgröße/EPEI → Roadmap |
| **A-06** | Zwei Engines / Semantik | ✅ teilweise | Gefährlicher Teil via A-02 behoben; VA/NNVA/NVA-Brücke (`CYCLE_KEY_CLASS`); volle Single-Source-Ableitung bleibt Architektur-Roadmap |
| **A-07** | Zoning/Pinning-Guards | ✅ behoben | atomares Gruppen-Placement, Takt-/Negativ-Guard, `fixedStationId`, Kontradiktions-Report |
| **B-01** | CI Prisma | ✅ behoben | `pretest`-Hook |
| **B-02** | Balancer im Editor | ✅ behoben | `balanceWorkloadIntoCell`, „Balance into stations"-Aktion |
| **B-03** | AI-Panel-Governance | ✅ dokumentiert | Gating-Kommentar; Aktivierung erst über Proposal-Weg |
| **B-04** | Variantenmodi read-only | ✅ behoben | Modus-Editor inkl. `elementOverrides` |
| **B-05** | 7 Wastes tot | ✅ behoben | `wastePareto` + Panel-Anzeige |
| **C-05** | Optimizer footprint/Grid | ✅ behoben | Grid-Grenzprüfung im Swap |
| **C-06** | Konzept-Scoring Tiebreak | ✅ behoben | Lean-Default-Tiebreak; Primärvergleich bleibt kostenbasiert (`generate.ts`) |
| **C-08** | Fläche/Tooling ohne Kosten | ✅ behoben | Flächen- + Instandhaltungs-Opex, Payback nettiert |
| **C-03** | Layout-Realismus (Clearance/Egress/Floor-Load) | ✅ Inc 1+2 | Inc 1: `engine/envelope.ts` `layoutRealism` (Clearance-Overlap, Floor-Load, Egress-BFS), Optimizer respektiert Clearance, Canvas-Halos + Rot-Markierung, Inspector/Settings-Eingaben. **Inc 2:** `floorPolygon`-Envelope (nicht-rechteckiger Boden, `pointInPolygon`/`footprintInPolygon`, Off-Floor-Flag, Optimizer hält Stationen im Polygon, Canvas-Umriss, Fit/Clear) + Obstacle-`movable`/`moveCost`. `fixed_placements` (C4) bleibt offen |
| **C-01** | Capability-Katalog + Coverage | ✅ | `model/capabilities.ts` (governter Katalog mit `alternatives`, §12), `engine/coverage.ts` `capabilityCoverage` (Gate-1: gedeckt / via Substitution / fehlend, §18), Flow-Panel-Readout. Konzeptvarianten-Generierung *aus* Alternativen bleibt nächster Schritt (§7) |
| **C-02** | Reliability / Verfügbarkeit | ✅ Increment 1 | `Station.availabilityPct` bzw. `mtbfHours`/`mttrHours` → `availabilityOf`; skaliert die effektive Rate in `balance.ts` (unzuverlässige Maschine wird zum Engpass); Inspector-Felder. Parametrisches `cycle_time_model`, Ramp-Kurve, TRL, `volume_band` bleiben offen |
| **C-13** | Operator-Loops / Walk-Time | ✅ | `Station.attendedFraction`/`operatorId`, `Model.walkSpeedMps`; `engine/operatorLoop.ts` (Laufzeit aus Layout-Geometrie, zyklische Chaku-Chaku-Runde, Auslastung vs Takt, Lauf-Verschwendung); Balance-Panel-Abschnitt (Work+Walk vs Takt), Inspector-Felder, Canvas-Laufpfade |
| **C-11** | Portfolio / Teilenummer-Matrix | ✅ Gate 1 | `Model.parts` (Teilenummer = abstrakter Capability-Bedarf, §1.1-konform); `engine/portfolio.ts` `portfolioMatrix` (Produkt-Prozess-Matrix Teil × Capability, provided/via-Alternative/fehlend, Gate-1-Verdikt je Teil, blockierende Capabilities nach entsperrten Teilen); Analyse-Tab „Portfolio" mit Matrix + Teile-Editor; Station-Inspector `provides`-Editor (Line-Supply). Gates 2–4 (Kapazität/Changeover/Drop/Sequencing) liegen getestet in `parked/` — nächster Entpark-Schritt |
| C-04/09/10/12 | Testfit, Verteilungen, Snapshots, Pattern-Library | 🔵 offen (Roadmap) | Greenfield-Features; Umfang je Wochen; Halbausbau widerspräche §4/§5 |
| **D-01** | Doku veraltet | ✅ dieser Nachtrag | Status hier dokumentiert |

**Unabhängige Nachprüfung (Re-Audit).** Die A/B/C-Fixes wurden anschließend adversarial gegengeprüft (zwei unabhängige Reviews gegen den Code, mit dem Ziel zu widerlegen). Ergebnis: **alle acht Engine-Fixes CONFIRMED**, keine Refutation. Aufgedeckt und behoben wurden drei UI-/Rand-Defekte der ersten Umsetzung: ein Undo-korrumpierender In-place-Mutations-Bug in `balanceWorkloadIntoCell` (D1), ein ungeguardetes „takt 0s" in einem Overview-Readout (D2), sowie zwei kosmetische Punkte (A-07-Fehlermeldung, A-05-terminaler-Sink-Yield, `wastePareto`-Kommentar). Alle sind im selben Branch geschlossen und test-verankert.

**Test-/Typecheck-Stand nach Umsetzung:** `npm run typecheck` grün (core+web+server); `npm test` **462 grün / 2 skipped** (frischer Checkout ohne Handgriff dank B-01). Golden-Fixtures bewusst aktualisiert, wo eine Kennzahl korrigiert wurde; jeder Fix ist durch neue Tests abgesichert.

**Aktualisiertes Votum:** Die fachlichen **Rechenkern-Blocker (A-01…A-05, A-07) sind geschlossen**; Takt, Kapazität und die 7 KPIs rechnen jetzt fachlich korrekt und sind test-verankert. Für eine **uneingeschränkte** Vollabnahme verbleiben die Greenfield-Lücken der C-Roadmap (v. a. Layout-Realismus C-03: Clearance/Egress/Floor-Load, sowie Katalog/Testfit) — bis dahin muss das Werkzeug seine Grenze bei „baubaren" Layouts ausweisen (siehe F-5). Für den Einsatz als **rechnerisch belastbares Planungs- und Konzeptvergleichs-Werkzeug** ist die Basis nunmehr abnahmefähig.

---

## 0. Freigabe-Votum

> **Status: KEINE uneingeschränkte Freigabe. Bedingte Freigabe nur für den Einsatz als qualitatives Screening-/Diskussionswerkzeug.**
>
> *(Nachtrag 0b: Die A-/B-Blocker dieses Votums sind inzwischen behoben — siehe Umsetzungsstand oben. Der folgende Text ist der Erstbefund.)*

FlowPlan ist als Interaktions- und Struktur­werkzeug bemerkenswert weit: echte Zellform-Geometrie (I/U/L/S/W/O), ein reales Yamazumi-Panel, DAG-fähige Durchsatz-/Engpassrechnung, ein governter Proposal-Mechanismus (Ghost-Preview, Per-Item-Annahme, Stale-Erkennung, Pin-Schutz), Undo/Redo und ein Workload-Editor mit VA/NNVA/NVA. Das ist eine tragfähige Basis.

**Für die Freigabe als planungs­relevantes Berechnungswerkzeug ist es jedoch nicht abnahmefähig.** Der entscheidende Grund ist nicht fehlende Funktionalität, sondern **plausibel aussehende, aber fachlich falsche Kennzahlen** an mehreren zentralen Stellen (Takt, Kapazität, Bewertungs-KPIs). Ein Planungswerkzeug, das eine falsche Zahl selbstbewusst und ohne Konfidenzkennzeichnung ausgibt, verletzt genau das Grundprinzip, das die Governing-Spec über alles stellt (§5 „`€2.43` is a lie", §1.1-F8). Bei €2M-Layout-/Konzeptentscheidungen ist das der kritischere Fehler als eine Lücke.

Die Freigabe-Blocker sind in **Abschnitt A** priorisiert. Sind diese behoben und ist der Datenmodell-Bruch (zwei nicht abgeglichene Engines, Abschnitt A-06) geschlossen, ist eine erneute Abnahme sinnvoll.

**Reifegrad-Einschätzung:**

| Dimension | Reife | Kommentar |
|---|---|---|
| Interaktionsmodell / UX | 🟢 hoch | Canvas-primär, Undo/Redo, Ghost-Proposals, Zellformen |
| Fachliche Rechenkern-Korrektheit | 🔴 niedrig | Takt, Kapazität, 3 der 7 KPIs fehlerhaft/inert |
| Datenmodell-Kohärenz | 🔴 niedrig | Zwei parallele Engines mit unvereinbarer Labor-/Takt-/Waste-Semantik |
| Konfidenz-/Provenienz-Disziplin (§5) | 🟡 teilweise | Rendering vorhanden, aber falsche Zahlen bleiben unmarkiert |
| Build/CI-Reproduzierbarkeit | 🟡 teilweise | Frischer Checkout: 12 Testdateien rot (Prisma), siehe B-01 |
| Dokumentations-Governance | 🔴 niedrig | Spec/Alignment-Doku beschreibt den Code veraltet — siehe D-01 |

---

## 1. Prüfmethodik & Testlage

- **Statische Analyse** der Rechenkerne in `packages/core/src/engine/*` und `model/*`, der UI-Verdrahtung in `packages/web/src/*`, des Servers in `packages/server/src/*`.
- **Build/Typecheck:** `npm run typecheck` → **grün** (core + web + server, exit 0). Der in `spec-alignment.md` behauptete TS-Fehler in `parked/portfolioModel.ts` existiert **nicht mehr** — die Doku ist veraltet (D-01).
- **Testlauf** (`npm run test`, vitest): **385 passed / 1 skipped**, aber **12 Testdateien rot** — alle in `packages/server` (Ursache verifiziert, B-01). Nach `npx prisma generate` laufen sie grün (11 passed / 1 skipped; der Skip ist der DB-Integrationstest, by design).
- **Abgleich Code ↔ Spec:** Governing-Spec `line-planner-spec.md` (Teile I–IV vollständig, V ab §37 und VI fehlen laut Dokument selbst).

Befund-Kennzeichnung: **A** = Freigabe-Blocker (fachlich falsche Zahl / Datenintegrität), **B** = heute defekt/unerreichbar, **C** = fehlendes Feature (Zukunft), **D** = Governance/Prozess. Severity: 🔴 kritisch · 🟠 hoch · 🟡 mittel.

---

## A. Freigabe-Blocker — fachliche Korrektheit (falsche Zahlen)

### A-01 🔴 Takt ist nicht aus dem Kundenbedarf berechnet, sondern aus dem Ist-Ausstoß
**Ort:** `packages/core/src/engine/balance.ts:224`
```ts
const takt = lineOut > 0 ? +(shiftSeconds(bnHours) / lineOut).toFixed(1) : 0;
```
`lineOut` ist der **erreichte** Ausstoß, gedeckelt durch den Engpass. Damit ist dieser „Takt" = effektive Linien-Zykluszeit, **nicht** der Kundentakt (`verfügbare Zeit ÷ Bedarf`). Diese Größe wird als „takt ≈ Xs" an den Nutzer ausgegeben (`balance.ts:93`) und ist die **Taktlinie im Yamazumi** (`AnalysisDashboard`/`panels.tsx:478`).
**Fachliche Folge:** Die Taktlinie bewegt sich mit dem eigenen Linienausstoß. Der Yamazumi kann strukturell **nicht** die eigentlich zentrale Aussage „diese Konfiguration verfehlt den Kundentakt / kann den Bedarf nicht decken" zeigen — der Engpass sitzt per Konstruktion ~auf der Linie. Das widerspricht §9 („Takt is the master constraint … available time ÷ required output") und §14.1 direkt. Der Kern-Use-Case C1/C3 („given a workload and a takt …") ist damit im laufenden Editor nicht korrekt bedient.
**Nebenbefund:** Der demand-getriebene Takt existiert korrekt in `generateCell.ts:194` (`shiftHours*3600 / perShiftTarget`) — aber nur im einmaligen Konzeptgenerator, nicht im interaktiven Editor. Beide Definitionen tragen denselben Namen.
**Empfehlung:** Kundentakt als **erstklassige Eingabe/Ableitung aus `Demand`** in das laufende Modell ziehen; `balance.ts`-„Takt" umbenennen (z. B. `effectiveLineCycle`) und die Yamazumi-Taktlinie ausschließlich auf den Bedarfstakt setzen.

### A-02 🔴 Operatoren multiplizieren den Maschinendurchsatz (Doppelzählung mit `parallelUnits`)
**Ort:** `packages/core/src/engine/balance.ts:58` (+ `capacityOf` Z. 72)
```ts
const byCycle = Math.floor((3600 / cycleSec) * hours * Math.max(1, s.operators) * partsPerCycleOf(s));
// ... und danach:  capacityOf = stationRate × max(1, parallelUnits)
```
Der Stationsdurchsatz wird mit `operators` **und** anschließend mit `parallelUnits` multipliziert. Für eine maschinen­getaktete Station erhöht ein zweiter Bediener den Durchsatz aber **nicht** — die Zykluszeit bestimmt die Maschine. Parallelität ist bereits sauber über `parallelUnits` modelliert.
**Fachliche Folge:** Kapazität jeder mehrfach besetzten Maschinen­station wird überschätzt → der wahre Engpass wird verdeckt/verschoben. Genau die Kernaussage des Werkzeugs (Bottleneck-Erkennung, §6 „Station 4 is the bottleneck") wird unzuverlässig. Die Demo-Behauptung „CNC statt Assembly ist der Constraint" ist datenabhängig nicht mehr garantiert.
**Empfehlung:** Durchsatz-Hebel = ausschließlich `parallelUnits` (und ggf. `partsPerCycle`). `operators` treibt Arbeitskosten und (bei `type === "manual"`) parallele Handarbeit — nicht den Maschinentakt. Die WorkElement-Engine löst das bereits korrekt über `attendedFraction`; Station-Engine daran angleichen (siehe A-06).

### A-03 🔴 „Placement"-KPI ist eine wörtliche Kopie des Flow-KPI
**Ort:** `packages/core/src/engine/rating.ts:95`
```ts
const sPlace = sFlow;   // Placement-Score := Flow-Score
```
Beide gehen mit eigenem Gewicht in die Komposit-Note ein (`placement` 0.10 **plus** `flowCost` 0.25). Damit trägt Materialflusskosten faktisch **0.35**, und es existiert **keine** eigenständige Platzierungs-/Kollisions-/Abstands-Kennzahl — obwohl die Achse so beschriftet ist.
**Fachliche Folge:** Ein Layout mit Freiraum-/Clearance-Verstößen erhält denselben „Placement"-Score wie ein sauberes, solange die Flusskosten stimmen. Für ein Layoutwerkzeug ist eine vorgetäuschte Layout-KPI ein Abnahme-Blocker. `flowplanspec.md` §4 führt „Placement efficiency" als eigene Basis — die Umsetzung erfüllt das nicht.
**Empfehlung:** Entweder eine echte Platzierungsmetrik implementieren (Clearance-/Kollisions-/Kompaktheitsmaß) oder die Achse entfernen und Gewicht offen auf Flow umlegen. Vorgetäuschte Doppelzählung ist inakzeptabel.

### A-04 🟠 Congestion-Score kollabiert praktisch immer auf 100 (Gewicht inert)
**Ort:** `packages/core/src/engine/rating.ts:94`
```ts
const sCong = scoreVsFloor(actual.congestion, opt.congestion || actual.congestion);
```
Hat das Floor-Layout `opt.congestion === 0`, greift der Fallback `actual.congestion` → Verhältnis `actual/actual = 1 → 100`. Das 0.10-Congestion-Gewicht ist im Regelfall wirkungslos. Zusätzlich ist das zugrunde liegende Maß nur ein **Mittellinien-Kreuzungs-Proxy** (`kpis.ts:43`, feste horizontale Achse bei `gridH/2`): ignoriert vertikale Korridore und — fachlich entscheidend — **geteilte Gänge / Mehrfachbelegung**, also die eigentliche Definition von Stau.
**Empfehlung:** Congestion als Gang-/Korridor-Belastungsmodell (Flüsse pro Gangsegment) neu fassen; den `|| actual`-Fallback entfernen.

### A-05 🟠 Ausbeute (`scrapRate`) und Rüsten (`changeoverMin`) beeinflussen keine Kennzahl
**Ort:** `balance.ts`, `capacity.ts` (Felder in `types.ts:90/267`, `changeoverMin`)
`scrapRate` erhöht **nirgends** den Bedarf upstream (kein Yield-Hochskalieren der vorgelagerten Mengen); `changeoverMin` reduziert **nie** die verfügbare Laufzeit in der Ratenformel — es erscheint nur als Hinweistext (`balance.ts:99`).
**Fachliche Folge:** Kapazitäts- und Engpassrechnung ignorieren reale Verlustquellen. Bei rüstintensiven oder ausbeuteschwachen Prozessen ist die ausgewiesene Kapazität systematisch zu hoch. Widerspricht §7-F4 (Zeit dekomponiert) und dem Rüst-/SMED-Mechanismus in §9.
**Empfehlung:** Yield-Rückrechnung des Bedarfs (`required_in = required_out / Π yield`) und Rüstzeit als verfügbare-Zeit-Abzug (intern/extern getrennt, §12 `changeover.internal/external`) in `capacity.ts`/`balance.ts` verankern.

### A-06 🔴 Zwei nicht abgeglichene Engines — inkonsistente Takt-, Labor- und Waste-Semantik
**Ort:** WorkElement-Engine (`assign.ts` + `workload.ts` + `infer.ts`) vs. Station-Engine (`balance.ts` + `cycle.ts` + `capacity.ts`)
Beide beanspruchen „Balancing" und ein Feld „takt", stimmen aber nicht überein:
- **Takt:** demand-getrieben (`generateCell`) vs. ausstoß-getrieben (`balance.ts`, A-01).
- **Labor/Manning:** `attendedFraction`-basierte, taktgetriebene Operatorzahl (`assign.ts:252`) vs. `operators` als Durchsatzmultiplikator (`balance.ts:58`, A-02) vs. reine Summe `Σ station.operators` (`capacity.ts:66`). **Drei verschiedene Operatorzahlen**, die nicht übereinstimmen müssen.
- **Waste:** VA/NNVA/NVA + 7 Verschwendungsarten auf `WorkElement` vs. 5-Eimer-`CycleBreakdown` (VA/handling/walk/wait/setup) auf `Station`. Derselbe Handling-Anteil ist im Yamazumi „Verschwendung", in der Workload-Sicht „NNVA (notwendig)". Kein Mapping.
- **VA%** wird zweimal unterschiedlich berechnet (`workload.vaPct` vs. `cycle.lineValueAddPct`) und kann für dieselbe Zelle divergieren.
**Fachliche Folge:** Das Werkzeug kann für dieselbe Zelle je nach Panel widersprüchliche Operatorzahlen, VA-Anteile und Taktaussagen zeigen. Das ist ein Datenintegritäts-Blocker und der eigentliche strukturelle Kern hinter A-01/A-02. Widerspricht Contradiction #3 der `spec-alignment.md`.
**Empfehlung:** Eine kanonische Zeit-/Labor-Quelle (die WorkElement-Ebene, §8/§11) festlegen; die Station-Kennzahlen daraus **ableiten**, nicht parallel neu erfinden. `CycleBreakdown` auf VA/NNVA/NVA migrieren (Contradiction #3).

### A-07 🟠 Zoning/Pinning im Balancer verletzbar bzw. wirkungslos
**Ort:** `packages/core/src/engine/assign.ts`
- `mustBeSameStationAs` zieht den Partner ohne Takt-Prüfung ein (Z. 205–214, kein Guard analog Z. 192) → Station kann **stillschweigend über Takt** gedrückt werden.
- Der eingezogene Partner wird nicht gegen bestehende `mustNotBeSameStationAs`-Mitglieder geprüft → eine Muss-Zusammen-Regel kann eine Muss-Getrennt-Regel **verletzen**.
- `must*SameStationAs` nur ein Hop tief → nicht-transitive Ketten (A↔B, B↔C) gruppieren C nicht mit A.
- `fixedStationId` (`types.ts:274`) wird von `assign.ts` **nie gelesen** → deklariertes Element-Pinning ist ein No-op.
**Empfehlung:** Takt- und Negativ-Zoning-Guard auch im Mate-Pull-in; transitive Hüllenbildung der Same-Station-Ketten; `fixedStationId` respektieren.

**Zwischenfazit A:** Solange A-01, A-02, A-03 und A-06 offen sind, produziert das Werkzeug an seinen Kern­aussagen (Takt-Erreichung, Engpass, Layout-Note) Zahlen, die nicht abnahmefähig sind.

---

## B. Heute defekt oder unerreichbar

### B-01 🟠 Frischer Checkout: 12 Server-Testdateien rot — Prisma-Client nicht generiert
**Ort:** Wiring in `package.json` (root `test` = `vitest run`), `packages/server`
Nach reinem `npm install && npm test` schlagen 12 Dateien fehl: `TypeError: Cannot read properties of undefined (reading 'VIEWER')` in `teams.ts:44` — der `Role`-Enum aus `@prisma/client` ist zur Laufzeit `undefined`, weil **kein `prisma generate`** in `install`/`pretest` verdrahtet ist (nur in `npm run setup`/`dev:fresh`). Verifiziert: nach `npx prisma generate` → `Role = {OWNER, EDITOR, VIEWER}`, Server-Tests grün (11 passed / 1 skipped).
**Fachliche Folge:** CI/Onboarding ist nicht reproduzierbar grün; die Alignment-Doku „kennt" das Problem, hat es aber nie behoben.
**Empfehlung:** `postinstall`- oder `pretest`-Hook mit `prisma generate` (mind. für das Server-Workspace) ergänzen.

### B-02 🟠 Balancer im Editor nicht interaktiv erreichbar (Kern-Inversion halb gebaut)
**Ort:** `packages/web/src` (kein Import von `engine/assign`), `WorkloadPanel.tsx`
`assignStations` läuft **nur einmalig** im Konzeptgenerator (`generateCell.ts:197`). Der Workload-Editor lässt Arbeitselemente anlegen/ändern und zeigt die Analyse, aber **kein Bedienelement** ruft die Element→Station-Zuordnung erneut auf. Der Panel-Text verspricht „the balancer turns them into stations" — die Aktion fehlt. Der Spec-Fluss `workload → balancer → stations` (§Contradiction #2) ist im Editor nicht geschlossen; Nutzer autorisieren Stationen weiterhin direkt.
**Empfehlung:** „Neu balancieren"-Aktion im Workload-Panel, die `assignStations` über den governten Proposal-Weg (§4) als Ghost anbietet.

### B-03 🟡 AI-Chat-Panel vollständig gebaut, aber nicht gemountet — und umgeht die Proposal-Governance
**Ort:** `packages/web/src/components/AiChatPanel.tsx` (nirgends importiert; `App.tsx:87` „AI Chat is hidden for now")
Das Panel kann Editieren, Proposen, Ziel-Optimierung, Narration, Vision (Bild→Zelle), CSV-Ingest. Beim Anwenden ruft es aber `SET_MODEL`/`live`/`saveScenario` **direkt** und **nicht** den governten `ACCEPT_PROPOSAL`-Weg (Ghost/Per-Item/Stale/Pin-Schutz). Würde es aktiviert, entstünde ein zweiter, ungoverntter Schreibpfad — genau das Risiko, das §4 als adoptionskritisch benennt („one silent overwrite … abandoned for Excel permanently").
**Empfehlung:** Vor Aktivierung den Apply-Pfad zwingend durch `makePlacementProposal`/`ProposalPanel` leiten.

### B-04 🟡 Variantenmodi (Mixed-Model) nur im Wizard und ohne `elementOverrides`
**Ort:** `steps.tsx:299` (`elementOverrides` fest `{}`), kein Editor nach dem Wizard
Modus-Name/-Anteil sind im `DemandStep` editierbar, danach nirgends. `elementOverrides` (die eigentliche variantenspezifische Zeitvariation, §11) ist **nie** editierbar. Downstream nur lesend. Die „40-Produkte"-Antwort der Alignment-Doku ist damit im UI nur zur Hälfte real.
**Empfehlung:** Variantenmodus-Editor inkl. `elementOverrides` im Editor; Reducer-Aktionen `ADD/UPDATE/DELETE_VARIANT_MODE` existieren bereits.

### B-05 🟡 7 Verschwendungsarten werden erfasst/inferiert, aber nie ausgewertet
**Ort:** `infer.ts` setzt `wasteClass`; `workload.ts:166` aggregiert **nur** VA/NNVA/NVA
`WasteClass` (transport/motion/waiting/…) ist totes Analysedatum — keine Aggregation, kein Pareto, kein Ranking nach den 7 Wastes. Für ein Lean-Werkzeug ist der 7-Waste-Pareto ein Standard-Deliverable.
**Empfehlung:** Rollup + Pareto nach `WasteClass`; im Yamazumi/Workload-Panel sichtbar machen.

---

## C. Fehlende Features (Zukunfts-Roadmap, kein Blocker)

Diese Lücken sind fachlich relevant, aber legitim vertagbar — sofern das Werkzeug seinen Reifegrad ehrlich ausweist (§5/§9).

| ID | Bereich | Lücke | Spec | Sev |
|---|---|---|---|---|
| C-01 | Capability-/Resource-Katalog | `Station.provides` ist bloßes String-Array; kein governter Katalog, keine `alternatives` → §7 kann **keine Konzeptvarianten generieren** (Excel-F3 bleibt) | §12 | 🟠 |
| C-02 | Resource-Modell | Kein parametrisches `cycle_time_model`, keine `reliability` (MTBF/MTTR/Verfügbarkeit), keine Ramp-Kurve, kein TRL/`volume_band` je Ressource | §12 | 🟠 |
| C-03 | Layout-Realismus | Grid statt Boden-Polygon; **keine** Clearance/Gangbreite/Egress/Floor-Load. Optimizer packt Footprints kantenbündig ohne Wege | §14, §22 | 🔴¹ |
| C-04 | Testfit-Service | Machbarkeit nicht von Optimierung getrennt (§16/§20 „single most important architectural decision") — keine Envelope-/Feasibility-Prüfung vor Optimierung | §16, §20 | 🟠 |
| C-05 | Layout-Optimizer | Greedy Pairwise-Swap; footprint-blind (`optimize.ts:47`, kein `clampToGrid`), Objective nur Flow-Kosten während 7 KPIs bewertet werden → Optimizer und Bewerter optimieren Verschiedenes | §22 | 🟠 |
| C-06 | Konzept-Scoring | Kein Pugh-Matrix vs. Datum, keine Sensitivität; nur 1-Kriterium (Volumenband) in Log10 (`concepts.ts:148`); Capex/Ergo/Rüsten fließen **nicht** ins Ranking ein | §17.6, §24 | 🟠 |
| C-07 | Rules-as-Data | `CONCEPTS` ist harte TS-Konstante (`concepts.ts:48`) → reproduziert Excel-F2 (Logik im Code, nicht datenpflegbar durch PE) | §4.8, §35 | 🟠 |
| C-08 | Kostenmodell | Fläche wird berechnet, aber **nie mit €/m² bepreist**; kein Werkzeug-/Vorrichtungs-/Instandhaltungs-/Material-/Scrapkosten; Automations-Payback ignoriert Zusatz-Opex und unterstellt 100 % Operatorwegfall (`cost.ts:99`) | §12, §23 | 🟠 |
| C-09 | Messverteilungen | Alles Mittelwerte; keine p50/p95/p99 (§13-F7 „the p95 tail — where losses live — is invisible") | §13, §16 | 🟠 |
| C-10 | Immutable Snapshots | Modelle werden in-place mutiert; keine `version`/`parent_version`, keine Rekonstruktion zum Freigabestand | §6 | 🟠² |
| C-11 | Portfolio / Multi-Model | §15/§18 (LinePortfolio, Gate-1…4, Changeover, `drop_analysis`, Sequencing) liegt in `parked/` — getestet, aber **kein UI erreicht es** | §15, §18, §21 | 🟡 |
| C-12 | Pattern-Library | §30–35 „highest-value mechanic" komplett ungebaut; hängt an C-10 (ohne Snapshots keine Auto-Extraktion) | §30–35 | 🟡 |
| C-13 | OperatorLoop / Walkpfade | Keine Operator-Laufschleifen/Walk-Time aus Geometrie (§13 `OperatorLoop.walk_time` „computed") — Chaku-Chaku-Wege nicht sichtbar | §13, §14 | 🟡 |

¹ C-03 ist mittelfristig ein **Blocker für „Maschinenlayout"-Aussagen**: ohne Clearance/Egress/Floor-Load ist ein ausgegebenes Layout nicht baubar. Für die *aktuelle* Positionierung als Screening-Tool tolerierbar, für die Vollabnahme nicht.
² C-10 ist Voraussetzung für C-12 und für §6-Nachvollziehbarkeit bei Freigaben (F1/F11).

---

## D. Governance / Prozess

### D-01 🟠 Dokumentation beschreibt den Code veraltet — Statusaussagen nicht vertrauenswürdig
`spec-alignment.md` unterschätzt den Code an mehreren Stellen nachweislich:
- „no Yamazumi artifact" → **falsch**: `YamazumiChart` existiert und ist erreichbar (`charts.tsx`, `AnalysisDashboard`, `panels.tsx:478`).
- „space … no" (Kosten) → **falsch**: Flächenkosten sind gesplittet gebaut (`cost.ts:75–93`), Zelle vs. Materialversorgung.
- „parked/portfolioModel.ts … TS2307" → **behoben**; Typecheck ist grün.

Für eine Abnahme ist das ein eigenes Risiko: Wenn die Statusdoku sowohl über- als auch unterschätzt, ist keine ihrer Zeilen ohne Codeblick belastbar. **Empfehlung:** `spec-alignment.md` gegen `HEAD` neu erheben; dieses Audit-Log als aktuellen Stand referenzieren.

### D-02 🟡 Konfidenz-Rendering vorhanden, aber falsche Zahlen bleiben unmarkiert
§5 verlangt, dass jede Zahl Measured/Benchmarked/Estimated trägt und Konfidenz zum schwächsten Input propagiert. Das Rendering (`confidence.tsx`, `Station.dataQuality`) existiert. Es schützt aber nicht vor A-01…A-05: eine strukturell **falsche** Zahl (Takt, Kapazität) wird nicht dadurch richtig, dass sie als „measured" markiert ist. Konfidenz adressiert Unsicherheit, nicht Fehler.

### D-03 🟡 Produktdaten im Modell trotz Scope-Ausschluss
`Product`/`PartFeature`/`VolumeScenario.productMix` widersprechen §1.1 („parts enter as abstract workloads"); `VariantMode` ist der vorgesehene Ersatz. Breaking Change, bewusst zu terminieren (Contradiction #1).

---

## E. Priorisierte Maßnahmen für die Weiterführung (empfohlene Reihenfolge)

**Sprint-Ziel „abnahmefähiger Rechenkern" (schließt A):**
1. **A-06** kanonische Zeit-/Labor-Quelle festlegen (Voraussetzung, entschärft A-01/A-02 strukturell).
2. **A-02** Operator-Multiplikator aus `stationRate` entfernen; Parallelität nur über `parallelUnits`.
3. **A-01** Kundentakt aus `Demand` als erstklassige Größe; `balance.ts`-„Takt" umbenennen; Yamazumi-Taktlinie = Bedarfstakt.
4. **A-03** Placement-KPI: echte Metrik oder Achse entfernen (keine Doppelzählung).
5. **A-04/A-05** Congestion-Fallback fixen + Yield/Rüsten in Kapazität verankern.
6. **A-07** Zoning-/Pinning-Guards im Balancer.

**Sprint-Ziel „ehrlicher Zustand" (schließt B/D, schnell):**
7. **B-01** `prisma generate` in `install`/`pretest` — CI reproduzierbar grün.
8. **D-01** Alignment-Doku neu erheben.
9. **B-02** Balancer über Proposal-Weg im Editor erreichbar machen.

**Danach (C, nach Wert/Abhängigkeit):** C-01 Capability-Katalog (Voraussetzung für §7-Varianten, Gate-1, Pattern-Matching) → C-11 Portfolio-UI unparken → C-08 Kostenmodell vervollständigen → C-03/C-04/C-05 Layout-Realismus & Testfit → C-10 Snapshots → C-12 Pattern-Library.

---

## F. Abnahmebedingungen (Definition of „freigegeben")

Eine erneute fachliche Abnahme ist erfolgreich, wenn:

1. **A-01…A-03 und A-06 geschlossen** und durch Golden-Tests fixiert sind (falsche Kennzahl bricht CI, nicht das Gedächtnis).
2. **Eine** kanonische Operatorzahl, **eine** Takt-Definition, **eine** VA-Definition pro Zelle existieren (keine Panel-abhängigen Widersprüche).
3. Kapazität/Engpass **Yield und Rüsten** berücksichtigen (A-05).
4. CI aus frischem Checkout **ohne Handgriffe grün** ist (B-01).
5. Jede planungsrelevante Zahl ist entweder korrekt **oder** sichtbar als Schätzung/Range gekennzeichnet — insbesondere dort, wo das Layout-Realismus-Modell (Clearance/Egress) noch fehlt (C-03), muss das Werkzeug seine Grenze ausweisen statt ein „baubares" Layout zu suggerieren.

*Erstellt im Rahmen der fachlichen Abnahmeprüfung Shopfloor-/Prozessplanung. Alle Zeilenverweise gegen `git HEAD` = `f9be0dd`.*
