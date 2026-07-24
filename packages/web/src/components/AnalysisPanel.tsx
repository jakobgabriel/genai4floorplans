import { useEffect, useRef, useState } from "react";
import { Stack } from "@carbon/react";
import {
  AutomationSection,
  BalanceSection,
  FlowCostSection,
  NoSteps,
  VerdictSection,
  YieldSection,
  stepCount,
  type PanelProps,
} from "./panels";
import { CostSection } from "./CostPanel";
import { ANALYSIS_PATH, type AnalysisStepId } from "./analysisPath";

/**
 * The whole readout as one page.
 *
 * This used to be five sibling tabs — Rating, Balance, Cost, Automation — which
 * left the reader to work out what to look at first and in what order. There is
 * only one sensible order, so the page is that order: verdict, then the flow
 * behind it, then what caps the line, then what is lost, then what could run
 * itself, then what it costs. The nav at the top jumps within the page rather
 * than swapping its contents, so scrolling past a stage is still reading it.
 */
const domId = (id: AnalysisStepId) => "an-" + id;

export function AnalysisPanel(props: PanelProps) {
  const { api, setSel, setTab } = props;
  const [active, setActive] = useState<AnalysisStepId>("verdict");
  const rootRef = useRef<HTMLDivElement | null>(null);
  const empty = stepCount(api) === 0;

  // Highlight whichever stage the reader is currently in. Guarded because jsdom
  // has no IntersectionObserver — the nav then simply stays on the first stage.
  useEffect(() => {
    if (empty || typeof IntersectionObserver === "undefined") return;
    // `.an` is itself the rail's scrolling region (see `.side > div` in
    // tokens.css), so it is the observer root, not `.side`.
    const root = rootRef.current;
    const io = new IntersectionObserver(
      (entries) => {
        const hit = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (hit) setActive(hit.target.id.slice(3) as AnalysisStepId);
      },
      // Only the band just below the sticky nav counts as "here", so the active
      // chip tracks the heading you are reading rather than the tallest section.
      { root, rootMargin: "-72px 0px -70% 0px", threshold: 0 },
    );
    for (const s of ANALYSIS_PATH) {
      const el = document.getElementById(domId(s.id));
      if (el) io.observe(el);
    }
    return () => io.disconnect();
  }, [empty]);

  if (empty) return <NoSteps reads="analysis" api={api} setSel={setSel} setTab={setTab} />;

  const jump = (id: AnalysisStepId) => {
    setActive(id);
    const root = rootRef.current;
    const el = document.getElementById(domId(id));
    if (!root || !el) return;
    // Scrolled by hand rather than with scrollIntoView: the nav is sticky and
    // wraps to two rows at narrow rail widths, so the offset to clear it has to
    // be measured rather than assumed.
    const navH = root.querySelector(".an__nav")?.getBoundingClientRect().height ?? 0;
    const top = root.scrollTop + el.getBoundingClientRect().top - root.getBoundingClientRect().top - navH;
    if (root.scrollTo) root.scrollTo({ top, behavior: "smooth" });
    else el.scrollIntoView?.({ block: "start" });
  };

  const body: Record<AnalysisStepId, JSX.Element> = {
    verdict: <VerdictSection {...props} />,
    flow: <FlowCostSection api={api} />,
    balance: <BalanceSection api={api} setSel={setSel} setTab={setTab} />,
    yield: <YieldSection api={api} />,
    automation: <AutomationSection api={api} setSel={setSel} setTab={setTab} />,
    cost: <CostSection api={api} setSel={setSel} setTab={setTab} />,
  };

  return (
    <div className="an" ref={rootRef}>
      <nav className="an__nav" aria-label="Analysis path">
        {ANALYSIS_PATH.map((s, i) => (
          <button
            key={s.id}
            type="button"
            className={"chip" + (active === s.id ? " on" : "")}
            aria-current={active === s.id ? "true" : undefined}
            onClick={() => jump(s.id)}
          >
            <span className="an__navNum">{i + 1}</span>
            {s.label}
          </button>
        ))}
      </nav>
      <div className="pad ak-panel">
        <Stack gap={7}>
          {ANALYSIS_PATH.map((s, i) => (
            <section key={s.id} id={domId(s.id)} className="an__sec" aria-labelledby={domId(s.id) + "-h"}>
              <header className="an__secHead">
                <h3 className="an__secTitle" id={domId(s.id) + "-h"}>
                  <span className="an__secNum">{i + 1}</span>
                  {s.title}
                </h3>
                <p className="an__secQ">{s.question}</p>
              </header>
              {body[s.id]}
            </section>
          ))}
        </Stack>
      </div>
    </div>
  );
}
