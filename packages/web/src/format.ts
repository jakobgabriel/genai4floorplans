// One formatter for the whole app.
//
// Bare `toLocaleString()` follows the machine's locale, which on a German
// workstation renders 1300000 as "1.300.000" — inside a "$" string that reads
// as $1.30. Currency and grouping must not disagree, so the locale is pinned.
const LOCALE = "en-US";

/** Grouped integer: 1250000 -> "1,250,000". */
export function num(n: number): string {
  return Math.round(n).toLocaleString(LOCALE);
}

/** Currency with fixed decimals: ("$", 1.5) -> "$1.50". */
export function money(currency: string, n: number, dp = 2): string {
  return currency + n.toLocaleString(LOCALE, { minimumFractionDigits: dp, maximumFractionDigits: dp });
}

/** Whole-currency amount: ("$", 1300000) -> "$1,300,000". */
export function moneyWhole(currency: string, n: number): string {
  return currency + num(n);
}
