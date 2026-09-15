import { z } from "zod";

import type { Route } from "./+types/instruments";

import {
  HoldingsParseError,
  parseAsOfHint,
  parseHoldingsCsv,
} from "~/adapters/ingestion/holdings";
import {
  PrismaHoldingsRepository,
  PrismaInstrumentRepository,
  PrismaLedgerRepository,
  PrismaPriceRepository,
} from "~/adapters/persistence";
import { Card, InstrumentsTable, SyncPricesButton } from "~/components";
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
  createFormat,
  needsMapping,
  parseLocale,
  toInstrumentListItems,
  useCopy,
} from "~/lib";

export function meta({ matches }: Route.MetaArgs) {
  const t = copyFromMatches(matches);
  return [
    { title: t.meta.instruments.title },
    { name: "description", content: t.meta.instruments.description },
  ];
}

export const handle = { title: (t: Copy) => t.instruments.title };

export async function loader({ request }: Route.LoaderArgs) {
  const [events, instruments, prices, holdings] = await Promise.all([
    new PrismaLedgerRepository().list(),
    new PrismaInstrumentRepository().list(),
    new PrismaPriceRepository().latest(),
    new PrismaHoldingsRepository().all(),
  ]);

  const positions = computePositions(events);
  const marketValues = computeMarketValues(positions, prices, BASE_CURRENCY);
  const tag = createFormat(parseLocale(request.headers.get("Cookie"))).tag;
  const items = toInstrumentListItems(
    instruments,
    positions,
    marketValues,
    holdings,
    tag,
  );

  return { items, unmapped: needsMapping(items).length };
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
  asOf: z.string().optional(),
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
  const { id, csv, asOf, identity, name, weight } = parsed.data;

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

    const asOfDate = parseAsOfHint(asOf ?? null) ?? new Date();

    const imported = await new PrismaHoldingsRepository().replaceFor(
      id,
      result.holdings.map((h) => ({
        instrumentId: id,
        identity: h.identity,
        identityKind: h.identityKind,
        name: h.name,
        weight: h.weight,
        asOf: asOfDate,
      })),
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
  const { items, unmapped } = loaderData;

  return (
    <>
      <header className="mb-4">
        <div className="flex items-start justify-between gap-4">
          <p className="text-[13px] text-muted">{t.instruments.intro}</p>
          <SyncPricesButton />
        </div>
        {unmapped > 0 && (
          <p className="mt-2 text-[13px] text-muted">
            {t.instruments.unmappedHint(unmapped)}
          </p>
        )}
      </header>

      <Card className="overflow-hidden">
        <InstrumentsTable items={items} />
      </Card>
    </>
  );
}

export { ErrorBoundary } from "~/components/ui/ErrorBoundary";
