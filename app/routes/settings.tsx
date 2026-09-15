import type { ReactNode } from "react";
import { Coins, Gauge, Globe, Moon, TrendingUp } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import type { Route } from "./+types/settings";

import { LocaleSetting, ThemeSetting } from "~/components";
import { Select } from "~/components/ui/Select";
import { type Copy, copyFromMatches, useCopy } from "~/lib";

export function meta({ matches }: Route.MetaArgs) {
  const t = copyFromMatches(matches);
  return [
    { title: t.meta.settings.title },
    { name: "description", content: t.meta.settings.description },
  ];
}

export const handle = { title: (t: Copy) => t.settings.title };

const CURRENCIES = [
  { value: "EUR", label: "EUR", desc: "Euro" },
  { value: "USD", label: "USD", desc: "Dólar estadounidense" },
  { value: "GBP", label: "GBP", desc: "Libra esterlina" },
  { value: "CHF", label: "CHF", desc: "Franco suizo" },
] as const;

const BENCHMARKS = [
  {
    value: "VWCE.DE",
    label: "VWCE.DE",
    desc: "Vanguard FTSE All-World UCITS ETF (Acc)",
  },
  {
    value: "IWDA.AS",
    label: "IWDA.AS",
    desc: "iShares Core MSCI World UCITS ETF",
  },
  {
    value: "CSPX.L",
    label: "CSPX.L",
    desc: "iShares Core S&P 500 UCITS ETF (Acc)",
  },
  {
    value: "VUAA.L",
    label: "VUAA.L",
    desc: "Vanguard S&P 500 UCITS ETF (Acc)",
  },
  {
    value: "EUNL.DE",
    label: "EUNL.DE",
    desc: "iShares Core MSCI World (Xetra)",
  },
  { value: "SSAC.L", label: "SSAC.L", desc: "iShares MSCI ACWI UCITS ETF" },
  {
    value: "EMIM.AS",
    label: "EMIM.AS",
    desc: "iShares Core MSCI EM IMI UCITS ETF",
  },
] as const;

export default function Settings() {
  const t = useCopy();
  const s = t.settings;

  return (
    <div className="flex flex-col">
      <Section title={s.appearance.title} desc={s.appearance.desc} first>
        <Row
          icon={Moon}
          label={s.appearance.theme.label}
          hint={s.appearance.theme.hint}
        >
          <ThemeSetting />
        </Row>
      </Section>

      <Section title={s.preferences.title} desc={s.preferences.desc}>
        <Row
          icon={Coins}
          label={s.preferences.currency.label}
          hint={s.preferences.currency.hint}
          soon={s.soon}
        >
          <Select
            label={s.preferences.currency.label}
            value="EUR"
            options={CURRENCIES}
            onChange={() => undefined}
            disabled
          />
        </Row>
        <Row icon={Globe} label={s.preferences.language.label}>
          <LocaleSetting />
        </Row>
      </Section>

      <Section title={s.portfolio.title} desc={s.portfolio.desc}>
        <Row
          icon={Gauge}
          label={s.portfolio.threshold.label}
          hint={s.portfolio.threshold.hint}
          soon={s.soon}
        >
          <Stepper value="15 %" />
        </Row>
        <Row
          icon={TrendingUp}
          label={s.portfolio.benchmark.label}
          hint={s.portfolio.benchmark.hint}
          soon={s.soon}
        >
          <Select
            label={s.portfolio.benchmark.label}
            value="VWCE.DE"
            options={BENCHMARKS}
            searchPlaceholder={s.portfolio.benchmark.search}
            onChange={() => undefined}
            disabled
          />
        </Row>
      </Section>
    </div>
  );
}

function Section({
  title,
  desc,
  first = false,
  children,
}: {
  title: string;
  desc: string;
  first?: boolean;
  children: ReactNode;
}) {
  return (
    <section
      className={`grid items-start gap-x-8 gap-y-6 py-6 ${first ? "" : "border-t border-border-subtle"}`}
      style={{
        gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 380px), 1fr))",
      }}
    >
      <div className="flex flex-col gap-2">
        <h2 className="text-[14px] font-semibold leading-tight">{title}</h2>
        <p className="text-[12px] leading-relaxed text-muted">{desc}</p>
      </div>

      <div className="min-w-0 rounded-card border border-border bg-surface">
        {children}
      </div>
    </section>
  );
}

function Row({
  icon: Icon,
  label,
  hint,
  soon,
  children,
}: {
  icon: LucideIcon;
  label: string;
  hint?: string;
  soon?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-14 flex-wrap items-center gap-4 px-4 py-3 not-first:border-t not-first:border-border-subtle">
      <Icon
        size={18}
        strokeWidth={1.75}
        aria-hidden
        className="shrink-0 text-muted"
      />
      <div className="flex min-w-40 flex-1 flex-col gap-1">
        <span className="flex items-center gap-2 text-[13px] font-medium">
          {label}
          {soon && (
            <span className="rounded border border-border px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide text-faint">
              {soon}
            </span>
          )}
        </span>
        {hint && <span className="text-[11px] text-muted">{hint}</span>}
      </div>
      {children}
    </div>
  );
}

function Stepper({ value }: { value: string }) {
  return (
    <div className="flex h-8 items-center overflow-hidden rounded-md border border-border bg-bg opacity-40">
      <span
        className="flex size-8 items-center justify-center text-muted"
        aria-hidden
      >
        <svg
          width="12"
          height="12"
          viewBox="0 0 14 14"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
        >
          <path d="M3 7h8" />
        </svg>
      </span>
      <span className="flex h-full min-w-14 items-center justify-center border-x border-border font-mono text-[12px] font-medium">
        {value}
      </span>
      <span
        className="flex size-8 items-center justify-center text-muted"
        aria-hidden
      >
        <svg
          width="12"
          height="12"
          viewBox="0 0 14 14"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
        >
          <path d="M3 7h8M7 3v8" />
        </svg>
      </span>
    </div>
  );
}

export { ErrorBoundary } from "~/components/ui/ErrorBoundary";
