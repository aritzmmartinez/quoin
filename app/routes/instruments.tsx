import { z } from "zod";

import type { Route } from "./+types/instruments";

import {
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
  const [events, instruments, prices] = await Promise.all([
    new PrismaLedgerRepository().list(),
    new PrismaInstrumentRepository().list(),
    new PrismaPriceRepository().latest(),
  ]);

  const positions = computePositions(events);
  const marketValues = computeMarketValues(positions, prices, BASE_CURRENCY);
  const items = toInstrumentListItems(instruments, positions, marketValues);

  return { items, unmapped: needsMapping(items).length };
}

const formSchema = z.object({
  id: z.string().min(1),
  exposureKind: z.union([exposureKindSchema, z.literal("")]),
  exposureLeafId: z.string().trim(),
});

export async function action({ request }: Route.ActionArgs) {
  const parsed = formSchema.safeParse(
    Object.fromEntries(await request.formData()),
  );
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

export default function Instruments({ loaderData }: Route.ComponentProps) {
  const { items, unmapped } = loaderData;

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 md:px-6">
      <header className="mb-4">
        <p className="max-w-2xl text-[13px] text-muted">
          {es.instruments.intro}
        </p>
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
