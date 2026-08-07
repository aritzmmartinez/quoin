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
import { Card, InstrumentsTable, PortfolioError } from "~/components";
import {
  BASE_CURRENCY,
  KINDS_NEEDING_LEAF,
  exposureKindSchema,
} from "~/core/domain";
import { computeMarketValues, computePositions } from "~/core/projections";

import { es, needsMapping, toInstrumentListItems } from "~/lib";

export function meta(_: Route.MetaArgs) {
  return [
    { title: "Instrumentos · Quoin" },
    { name: "description", content: "Clasificación de instrumentos" },
  ];
}

export const handle = { title: es.instruments.title };

export async function loader(_: Route.LoaderArgs) {
  const [events, instruments, prices, holdings] = await Promise.all([
    new PrismaLedgerRepository().list(),
    new PrismaInstrumentRepository().list(),
    new PrismaPriceRepository().latest(),
    new PrismaHoldingsRepository().all(),
  ]);

  const positions = computePositions(events);
  const marketValues = computeMarketValues(positions, prices, BASE_CURRENCY);
  const items = toInstrumentListItems(
    instruments,
    positions,
    marketValues,
    holdings,
  );

  return { items, unmapped: needsMapping(items).length };
}

const exposureForm = z.object({
  id: z.string().min(1),
  exposureKind: z.union([exposureKindSchema, z.literal("")]),
  exposureLeafId: z.string().trim().default(""),
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
  const form = Object.fromEntries(await request.formData());
  if (form.intent === "holdings") return importHoldings(form);

  const parsed = exposureForm.safeParse(form);
  if (!parsed.success) {
    return { ok: false as const, error: es.instruments.invalid };
  }

  const { id, exposureKind, exposureLeafId } = parsed.data;
  const kind = exposureKind === "" ? null : exposureKind;

  if (kind && KINDS_NEEDING_LEAF.includes(kind) && exposureLeafId === "") {
    return { ok: false as const, error: es.instruments.leafRequired };
  }

  await new PrismaInstrumentRepository().setExposure(
    id,
    kind,
    exposureLeafId === "" ? null : exposureLeafId,
  );
  return { ok: true as const };
}

async function importHoldings(form: Record<string, unknown>) {
  const parsed = holdingsForm.safeParse(form);
  if (!parsed.success) {
    return { ok: false as const, error: es.instruments.invalid };
  }
  const { id, csv, asOf, identity, name, weight } = parsed.data;

  const instrument = await new PrismaInstrumentRepository().get(id);
  if (!instrument) {
    return { ok: false as const, error: es.instruments.invalid };
  }
  if (instrument.exposureKind !== "EQUITY_FUND") {
    return { ok: false as const, error: es.holdings.notAFund };
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
    return { ok: false as const, error: es.holdings.saveFailed };
  }
}

export default function Instruments({ loaderData }: Route.ComponentProps) {
  const { items, unmapped } = loaderData;

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 md:px-6">
      <header className="mb-4">
        <p className="text-[13px] text-muted">{es.instruments.intro}</p>
        {unmapped > 0 && (
          <p className="mt-2 text-[13px] text-muted">
            {es.instruments.unmappedHint(unmapped)}
          </p>
        )}
      </header>

      <Card className="overflow-hidden">
        <InstrumentsTable items={items} />
      </Card>
    </main>
  );
}

export function ErrorBoundary() {
  return (
    <main className="mx-auto max-w-6xl px-4 py-8 md:px-6">
      <Card>
        <PortfolioError onRetry={() => window.location.reload()} />
      </Card>
    </main>
  );
}
