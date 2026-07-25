import type { ReactNode } from "react";
import { ArrowLeft } from "@carbon/icons-react";
import { Btn } from "./Btn";
import { navigate } from "../store/useHashRoute";

/**
 * The header every full-page route wears.
 *
 * Compare, Site, Archive, Admin and Report each hand-rolled the same row — a
 * `.btn sm` reading "← Editor" next to an `<h1 className="page-title">` — five
 * times, drifting apart in spacing and in whether they had actions at all.
 *
 * The back affordance is ghost and leads; the page's own actions sit right,
 * primary rightmost, per the placement convention in Btn.tsx.
 */
export function PageHead({ title, actions }: { title: string; actions?: ReactNode }) {
  return (
    <div className="page-head">
      <Btn size="compact" variant="ghost" icon={ArrowLeft} onClick={() => navigate("/")}>
        Editor
      </Btn>
      <h1 className="page-title">{title}</h1>
      {actions ? <div className="page-head__actions">{actions}</div> : null}
    </div>
  );
}
