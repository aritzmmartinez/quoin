import "dotenv/config";

import { argv, exit } from "node:process";

import {
  IneInflationProvider,
  SERIES_IDS,
  type SeriesId,
} from "~/adapters/inflation";
import { PrismaInflationRepository, prisma } from "~/adapters/persistence";
import type { InflationPoint } from "~/core/ports";

const FORCE_REBASE = "--force-rebase";

interface Rebase {
  series: SeriesId;
  stored: string[];
  incoming: string;
  storedCount: number;
}

function gapsIn(points: readonly InflationPoint[]): string[] {
  if (points.length === 0) return [];
  const present = new Set(points.map((p) => p.period));
  const sorted = [...present].sort();
  const [first, last] = [sorted[0]!, sorted[sorted.length - 1]!];

  const gaps: string[] = [];
  let [year, month] = first.split("-").map(Number) as [number, number];
  for (;;) {
    const period = `${year}-${String(month).padStart(2, "0")}`;
    if (period > last) break;
    if (!present.has(period)) gaps.push(period);
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }
  return gaps;
}

async function main(): Promise<void> {
  const force = argv.includes(FORCE_REBASE);
  const provider = new IneInflationProvider();
  const repository = new PrismaInflationRepository();

  const rebases: Rebase[] = [];
  let written = 0;

  for (const series of SERIES_IDS) {
    const incoming = await provider.getSeries(series);
    const base = incoming[0]!.base;
    const stored = await repository.list(series);
    const storedBases = [...new Set(stored.map((p) => p.base))].sort();

    const rebased =
      storedBases.length > 0 && storedBases.some((b) => b !== base);

    if (rebased && !force) {
      rebases.push({
        series,
        stored: storedBases,
        incoming: base,
        storedCount: stored.length,
      });
      continue;
    }

    if (rebased) await repository.deleteSeries(series);

    const count = await repository.saveMany(incoming);
    written += count;

    const added = count - stored.length;
    const gaps = gapsIn(incoming);
    console.log(
      `${series}: ${count} month(s) on base ${base}, ` +
        `${incoming[0]!.period} → ${incoming[incoming.length - 1]!.period}` +
        (rebased ? ` (series replaced at the new base)` : ` (+${added} new)`),
    );
    if (gaps.length > 0) {
      console.log(`  gaps in the published series: ${gaps.join(", ")}`);
    }
  }

  if (rebases.length > 0) {
    console.error(
      "\nRebase detected. Nothing was written for the series below.\n" +
        "INE has republished them against a new reference year, so the stored\n" +
        "levels and the incoming ones mean different things. Mixing the two would\n" +
        "corrupt every deflation ratio that spans the boundary — silently, and in\n" +
        "the direction that looks like a gain.\n",
    );
    for (const r of rebases) {
      console.error(
        `  ${r.series}: stored base ${r.stored.join("/")} (${r.storedCount} months), INE now publishes base ${r.incoming}`,
      );
    }
    console.error(
      "\nWhat to do: replace the affected series wholesale, at the new base:\n" +
        `\n  pnpm ipc:sync ${FORCE_REBASE}\n` +
        "\nThat deletes the stored levels for every rebased series and re-imports\n" +
        "the full history from INE. Nothing else in Quoin references them, so the\n" +
        "only thing lost is numbers that can be fetched again.",
    );
    exit(1);
  }

  console.log(`\nStored ${written} index level(s).`);
}

main()
  .catch((error: unknown) => {
    console.error(
      "\nIPC sync failed:",
      error instanceof Error ? error.message : error,
    );
    exit(1);
  })
  .finally(() => prisma.$disconnect());
