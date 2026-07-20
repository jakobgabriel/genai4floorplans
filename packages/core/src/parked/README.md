# Parked — multi-part line feasibility (spec §15, §18, §21)

Working, tested code that is **not wired to anything**. Kept because it answers
the "40 products on one line" question, removed from the main tree because it
cannot be reached and has no catalog to feed it.

- `portfolioModel.ts` — LinePortfolio, PortfolioMember, ChangeoverMatrix (§15)
- `portfolioEngine.ts` — the five feasibility gates, takt / `availableSeconds`,
  capacity-with-changeover, drop analysis (§17, §18)
- `changeover.ts` — family-grouped matrix, derive-from-tooling, ATSP sequencing (§15, §21)

**Unpark when** there is a Capability/Resource catalog (spec §12) and a UI that
can show a coverage verdict. Until then this is speculative inventory.

Its tests still run, so it cannot rot silently.

Section numbers refer to `docs/line-planner-spec.md`, renumbered from the old
Cell Design spec (§15→§15/§18, §3.3–3.4→§12, §5.1→§17). See `docs/spec-alignment.md` §2.
