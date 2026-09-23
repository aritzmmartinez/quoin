import type { ReactNode } from "react";
import { Coins, Gauge, Globe, Moon, TrendingUp } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import type { Route } from "./+types/settings";

import {
  PrismaInstrumentRepository,
  PrismaPriceRepository,
} from "~/adapters/persistence";
import {
  BenchmarkSetting,
  LocaleSetting,
  ThemeSetting,
  ThresholdSetting,
} from "~/components";
import { Select } from "~/components/ui/Select";
import { BASE_CURRENCY } from "~/core/domain";
import {
  benchmarkCandidates,
  type Copy,
  copyFromMatches,
  parseBenchmark,
  parseThreshold,
  useCopy,
} from "~/lib";

export function meta({ matches }: Route.MetaArgs) {
  const t = copyFromMatches(matches);
  return [
    { title: t.meta.settings.title },
    { name: "description", content: t.meta.settings.description },
  ];
}

export const handle = { title: (t: Copy) => t.settings.title };

export async function loader({ request }: Route.LoaderArgs) {
  const cookie = request.headers.get("Cookie");
  const [instruments, historyStarts] = await Promise.all([
    new PrismaInstrumentRepository().list(),
    new PrismaPriceRepository().historyStarts(BASE_CURRENCY),
  ]);
  return {
    threshold: parseThreshold(cookie),
    benchmark: parseBenchmark(cookie),
    candidates: benchmarkCandidates(instruments, historyStarts),
  };
}

const CURRENCIES = [
  { value: "EUR", label: "EUR", desc: "Euro" },
  { value: "USD", label: "USD", desc: "Dólar estadounidense" },
  { value: "GBP", label: "GBP", desc: "Libra esterlina" },
  { value: "CHF", label: "CHF", desc: "Franco suizo" },
] as const;

export default function Settings({ loaderData }: Route.ComponentProps) {
  const { threshold, benchmark, candidates } = loaderData;
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
        >
          <ThresholdSetting threshold={threshold} />
        </Row>
        <Row
          icon={TrendingUp}
          label={s.portfolio.benchmark.label}
          hint={s.portfolio.benchmark.hint}
        >
          <BenchmarkSetting benchmark={benchmark} candidates={candidates} />
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

export { ErrorBoundary } from "~/components/ui/ErrorBoundary";
