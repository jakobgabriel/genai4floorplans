import { useMemo, useState } from "react";
import { Search, Tag } from "@carbon/react";
import { Add } from "@carbon/icons-react";
import type { LibraryProcess } from "@flowplan/core/model/library";
import type { WorkClass } from "@flowplan/core/model/types";
import type { LibraryApi } from "../store/processLibrary";
import { IconBtn, TabBtn } from "./Btn";
import { Btn } from "./Btn";
import { Footnote } from "./analysisKit";
import { navigate } from "../store/useHashRoute";

/**
 * Pick a process out of the library, wherever picking one is the job.
 *
 * Read-only on purpose. Editing a process is a page (`/library`) — this is the
 * thing you reach for mid-task, in a table cell or a rail, when you know what
 * you want and want it placed. Squeezing the editor in here is what made the
 * drawer version unusable.
 */

const classTag = (c: WorkClass): "green" | "gray" | "red" => (c === "VA" ? "green" : c === "NNVA" ? "gray" : "red");

export function LibraryPicker({
  lib,
  onPick,
  actionLabel = "Add",
}: {
  lib: LibraryApi;
  onPick: (p: LibraryProcess) => void;
  actionLabel?: string;
}) {
  const [q, setQ] = useState("");
  const [tagFilter, setTagFilter] = useState<string | null>(null);

  const shown = useMemo(() => {
    const n = q.trim().toLowerCase();
    return lib.processes.filter((p) => {
      if (tagFilter && !p.tags.includes(tagFilter)) return false;
      return !n || p.name.toLowerCase().includes(n) || p.capabilityId.includes(n);
    });
  }, [lib.processes, q, tagFilter]);

  if (lib.processes.length === 0) {
    return (
      <div className="lib">
        <p className="lib__empty">Process library is empty.</p>
        <Btn size="compact" onClick={() => navigate("/library")}>
          Open the library
        </Btn>
      </div>
    );
  }

  return (
    <div className="lib">
      <Search
        id="libpick-search"
        size="sm"
        labelText="Find a process"
        placeholder="Find a process"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onClear={() => setQ("")}
      />
      {lib.tags.length > 0 ? (
        <div className="lib__tags" role="tablist" aria-label="Filter by tag">
          <TabBtn selected={tagFilter === null} onClick={() => setTagFilter(null)}>
            All
          </TabBtn>
          {lib.tags.map((t) => (
            <TabBtn key={t.id} selected={tagFilter === t.id} onClick={() => setTagFilter(t.id)}>
              {t.name}
            </TabBtn>
          ))}
        </div>
      ) : null}

      <div className="lib__list">
        {shown.map((p) => (
          <div className="lib__item" key={p.id}>
            <div className="lib__row">
              <span className="lib__name">{p.name}</span>
              <span className="lib__sec">{p.cycleTimeSec}s</span>
              <Tag type={classTag(p.classification)} size="sm">
                {p.classification}
              </Tag>
              {/* Icon-only: in a 320px rail a text button left about forty
                  pixels for the name, which is the one thing you must read. */}
              <IconBtn
                size="compact"
                icon={Add}
                label={`${actionLabel} — ${p.name}`}
                tooltipPosition="left"
                onClick={() => onPick(p)}
              />
            </div>
          </div>
        ))}
        {shown.length === 0 ? <p className="lib__empty">Nothing matches that.</p> : null}
      </div>

      <div className="lib__foot">
        <Btn size="compact" variant="ghost" onClick={() => navigate("/library")}>
          Edit library
        </Btn>
      </div>
      <Footnote>Carries cycle, type, ergonomics and scrap rate.</Footnote>
    </div>
  );
}
