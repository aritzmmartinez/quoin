import { z } from "zod";

import type { Route } from "./+types/instruments";

import {
  HoldingsParseError,
  parseHoldingsCsv,
} from "~/adapters/ingestion/holdings";
import {
  PrismaHoldingsRepository,
  PrismaInstrumentRepository,
  PrismaLedgerRepository,
  PrismaPriceRepository,
} from "~/adapters/persistence";
import { Card, InstrumentsTable, RebuildHistories } from "~/components";
import { UnratedNotice } from "~/components/ui/UnratedNotice";
import { today } from "~/core/calendar";
import {
  BASE_CURRENCY,
  KINDS_NEEDING_LEAF,
  exposureKindSchema,
  terPercentSchema,
  thesisSchema,
} from "~/core/domain";
import { computeMarketValues, computePositions } from "~/core/projections";

import {
  type Copy,
  copyFor,
  copyFromMatches,
  intlTag,
  needsMapping,
  parseLocale,
  toInstrumentListItems,
  useCopy,
} from "~/lib";
import { loadValuation } from "~/lib/rate-book.server";
import { loadResidence } from "~/lib/residence.server";
import { openInstrumentIds, unratedNames } from "~/lib/unrated";

export function meta({ matches }: Route.MetaArgs) {
  const t = copyFromMatches(matches);
  return [
    { title: t.meta.instruments.title },
    { name: "description", content: t.meta.instruments.description },
  ];
}

export const handle = { title: (t: Copy) => t.instruments.title };

export async function loader({ request }: Route.LoaderArgs) {
  const { jurisdiction, calendarZone } = await loadResidence();
  const priceRepository = new PrismaPriceRepository();
  const [
    events,
    instruments,
    valuation,
    holdings,
    blocks,
    candleTimes,
    dailyHistoryIds,
  ] = await Promise.all([
    new PrismaLedgerRepository().list(),
    new PrismaInstrumentRepository().list(),
    loadValuation(calendarZone),
    new PrismaHoldingsRepository().all(),
    new PrismaHoldingsRepository().blocks(),
    priceRepository.candleTimes(),
    priceRepository.dailyHistoryIds(),
  ]);

  const positions = computePositions(events, jurisdiction);
  const marketValues = computeMarketValues(
    positions,
    valuation.prices,
    BASE_CURRENCY,
  );
  const tag = intlTag(parseLocale(request.headers.get("Cookie")));
  const items = toInstrumentListItems(
    instruments,
    positions,
    marketValues,
    holdings,
    tag,
    candleTimes,
    dailyHistoryIds,
    blocks,
  );

  return {
    items,
    unmapped: needsMapping(items).length,
    unrated: unratedNames(
      valuation.unrated,
      instruments,
      openInstrumentIds(positions),
      tag,
    ),
  };
}

const exposureForm = z.object({
  id: z.string().min(1),
  exposureKind: z.union([exposureKindSchema, z.literal("")]),
  exposureLeafId: z.string().trim().default(""),
  ter: z.string().trim().default(""),
  hedgedToBase: z.string().optional(),
  thesis: thesisSchema,
});

const holdingsForm = z.object({
  id: z.string().min(1),
  csv: z.string().min(1),
  identity: z.string().optional(),
  name: z.string().optional(),
  weight: z.string().optional(),
});

export async function action({ request }: Route.ActionArgs) {
  const t = copyFor(parseLocale(request.headers.get("Cookie")));
  const form = Object.fromEntries(await request.formData());
  if (form.intent === "holdings") return importHoldings(t, form);

  const parsed = exposureForm.safeParse(form);
  if (!parsed.success) {
    return { ok: false as const, error: t.instruments.invalid };
  }

  const { id, exposureKind, exposureLeafId } = parsed.data;
  const kind = exposureKind === "" ? null : exposureKind;

  if (kind && KINDS_NEEDING_LEAF.includes(kind) && exposureLeafId === "") {
    return { ok: false as const, error: t.instruments.leafRequired };
  }

  let ter: string | null = null;
  if (parsed.data.ter !== "") {
    const fee = terPercentSchema.safeParse(parsed.data.ter);
    if (!fee.success) {
      return { ok: false as const, error: t.instruments.terInvalid };
    }
    ter = fee.data;
  }

  const repository = new PrismaInstrumentRepository();
  await repository.setExposure(
    id,
    kind,
    exposureLeafId === "" ? null : exposureLeafId,
  );
  await repository.setTer(id, ter);
  await repository.setHedgedToBase(id, parsed.data.hedgedToBase === "1");
  await repository.setThesis(id, parsed.data.thesis);
  return { ok: true as const };
}

async function importHoldings(t: Copy, form: Record<string, unknown>) {
  const parsed = holdingsForm.safeParse(form);
  if (!parsed.success) {
    return { ok: false as const, error: t.instruments.invalid };
  }
  const { id, csv, identity, name, weight } = parsed.data;

  const instrument = await new PrismaInstrumentRepository().get(id);
  if (!instrument) {
    return { ok: false as const, error: t.instruments.invalid };
  }
  if (instrument.exposureKind !== "EQUITY_FUND") {
    return { ok: false as const, error: t.holdings.notAFund };
  }

  try {
    const result = parseHoldingsCsv(csv, {
      ...(identity ? { identity } : {}),
      ...(name ? { name } : {}),
      ...(weight ? { weight } : {}),
    });

    const { calendarZone } = await loadResidence();
    const imported = await new PrismaHoldingsRepository().replaceFor(
      id,
      result.holdings.map((h) => ({
        instrumentId: id,
        identity: h.identity,
        identityKind: h.identityKind,
        name: h.name,
        weight: h.weight,
      })),
      {
        asOf: result.asOf ?? today(calendarZone, new Date()),
        asOfInferred: result.asOf === null,
      },
    );
    return { ok: true as const, imported };
  } catch (e) {
    if (e instanceof HoldingsParseError) {
      return { ok: false as const, error: e.message };
    }
    console.error("Holdings import failed for", id, e);
    return { ok: false as const, error: t.holdings.saveFailed };
  }
}

export default function Instruments({ loaderData }: Route.ComponentProps) {
  const t = useCopy();
  const { items, unmapped, unrated } = loaderData;
  const coarse = items.filter((item) => item.coarseHistory);
  const rebuildable = items.flatMap((item) =>
    item.quoteSymbol
      ? [
          {
            id: item.id,
            name: item.name,
            symbol: item.quoteSymbol,
            historyStart: item.historyStart,
          },
        ]
      : [],
  );

  return (
    <>
      <header className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
        <div className="space-y-2 text-[13px] text-muted">
          <p>{t.instruments.intro}</p>
          {coarse.length > 0 && (
            <p>
              {t.instruments.history.coarse(
                coarse.length,
                coarse.map((item) => item.name).join(", "),
              )}
            </p>
          )}
          {unmapped > 0 && <p>{t.instruments.unmappedHint(unmapped)}</p>}
        </div>
        <div className="shrink-0">
          <RebuildHistories targets={rebuildable} />
        </div>
      </header>

      <UnratedNotice unrated={unrated} className="mb-4" />

      <Card className="overflow-hidden">
        <InstrumentsTable items={items} />
      </Card>
    </>
  );
}

export { ErrorBoundary } from "~/components/ui/ErrorBoundary";
