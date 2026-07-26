import { HeaderGlobalAction } from "@carbon/react";
import { Asleep, Light } from "@carbon/icons-react";
import { useTheme } from "../store/theme";
import { LANGUAGES, useI18n, type Lang } from "../i18n";

// The persistent right-hand controls in the top bar: a language selector and a
// light/dark theme toggle. Both are always present on the shell header, so the
// choice is reachable from the front door and every planning stage.
export function TopBarControls() {
  const { theme, toggle } = useTheme();
  const { lang, setLang, t } = useI18n();
  return (
    <>
      {/* Native select: keyboard- and screen-reader-accessible for free, and it
          reads the OS language names. Labelled for assistive tech. */}
      <label className="topbar__lang">
        <span className="cds--visually-hidden">{t("nav.language")}</span>
        <select aria-label={t("nav.language")} value={lang} onChange={(e) => setLang(e.target.value as Lang)}>
          {LANGUAGES.map((l) => (
            <option key={l.id} value={l.id}>
              {l.label}
            </option>
          ))}
        </select>
      </label>
      <HeaderGlobalAction
        aria-label={theme === "dark" ? t("nav.theme.toLight") : t("nav.theme.toDark")}
        onClick={toggle}
        tooltipAlignment="end"
      >
        {theme === "dark" ? <Light size={20} /> : <Asleep size={20} />}
      </HeaderGlobalAction>
    </>
  );
}
