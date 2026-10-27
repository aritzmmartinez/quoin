import type { ReactNode } from "react";
import {
  ArrowLeftRight,
  ChartLine,
  Coins,
  Gauge,
  Globe,
  Moon,
  Percent,
  TrendingUp,
} from "lucide-react";

import type { Route } from "./+types/settings";

import {
  PrismaInstrumentRepository,
  PrismaLedgerRepository,
  PrismaPriceRepository,
} from "~/adapters/persistence";
import {
  BenchmarkSetting,
  LocaleSetting,
  ThemeSetting,
  ThresholdSetting,
} from "~/components";
import { ExternalDataSource } from "~/components/settings/ExternalDataSource";
import { SettingRow as Row } from "~/components/settings/SettingRow";
import { useFxRefresh } from "~/components/settings/use-fx-refresh";
import { useIpcRefresh } from "~/components/settings/use-ipc-refresh";
import { usePriceRefresh } from "~/components/settings/use-price-refresh";
import { Select } from "~/components/ui/Select";
import {
  benchmarkCandidates,
  convertibleStarts,
  type Copy,
  copyFromMatches,
  intlTag,
  parseBenchmark,
  parseLocale,
  parseThreshold,
  useCopy,
} from "~/lib";
import { loadExternalData } from "~/lib/external-data.server";
import { loadRateBook } from "~/lib/rate-book.server";
import { loadResidence } from "~/lib/residence.server";

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
  const benchmark = parseBenchmark(cookie);
  const prices = new PrismaPriceRepository();
  const [instruments, events, latest, { calendarZone }] = await Promise.all([
    new PrismaInstrumentRepository().list(),
    new PrismaLedgerRepository().list(),
    prices.latest(),
    loadResidence(),
  ]);

  const currencies = [...new Set([...latest.values()].map((s) => s.currency))];
  const [book, starts] = await Promise.all([
    loadRateBook(currencies),
    Promise.all(
      currencies.map(
        async (currency) =>
          [currency, await prices.historyStarts(currency)] as const,
      ),
    ),
  ]);

  return {
    threshold: parseThreshold(cookie),
    benchmark,
    candidates: benchmarkCandidates(
      instruments,
      convertibleStarts(new Map(starts), book, calendarZone),
      intlTag(parseLocale(cookie)),
    ),
    external: await loadExternalData(instruments, events, latest, benchmark),
  };
}

const CURRENCIES = [
  { value: "EUR", label: "EUR", desc: "Euro" },
  { value: "USD", label: "USD", desc: "Dólar estadounidense" },
  { value: "GBP", label: "GBP", desc: "Libra esterlina" },
  { value: "CHF", label: "CHF", desc: "Franco suizo" },
] as const;

export default function Settings({ loaderData }: Route.ComponentProps) {
  const { threshold, benchmark, candidates, external } = loaderData;
  const t = useCopy();
  const s = t.settings;
  const d = s.externalData;
  const prices = usePriceRefresh(external.syncTargets, external.unmapped);
  const inflation = useIpcRefresh();
  const rates = useFxRefresh();

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

      <Section title={d.title} desc={d.desc}>
        <ExternalDataSource
          icon={ChartLine}
          label={d.prices.label}
          hint={d.prices.hint}
          status={external.prices}
          refresh={prices.refresh}
          busy={prices.busy}
        />
        <ExternalDataSource
          icon={Percent}
          label={d.inflation.label}
          hint={d.inflation.hint}
          status={external.inflation}
          refresh={inflation.refresh}
          busy={inflation.busy}
        />
        <ExternalDataSource
          icon={ArrowLeftRight}
          label={d.rates.label}
          hint={d.rates.hint}
          status={external.rates}
          idle={t.fx.sync.none}
          refresh={rates.refresh}
          busy={rates.busy}
        />
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

export { ErrorBoundary } from "~/components/ui/ErrorBoundary";
