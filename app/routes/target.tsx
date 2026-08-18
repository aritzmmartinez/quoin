import { randomUUID } from "node:crypto";

import Decimal from "decimal.js";
import { z } from "zod";

import type { Route } from "./+types/target";

import {
  PrismaInstrumentRepository,
  PrismaLedgerRepository,
  PrismaTargetRepository,
} from "~/adapters/persistence";
import {
  Card,
  PortfolioError,
  TargetForm,
  TargetLines,
  TargetVersions,
} from "~/components";
import {
  findIdMismatches,
  getActiveTarget,
  monthlyTotal,
  parseTargetLines,
  TargetParseError,
  type PortfolioTarget,
} from "~/core/domain";
import { computePositions } from "~/core/projections";
import { es, toTargetRows, toTargetVersionRows } from "~/lib";

export function meta(_: Route.MetaArgs) {
  return [
    { title: "Objetivo · Quoin" },
    { name: "description", content: "Objetivo de aportación mensual" },
  ];
}

export const handle = { title: es.target.title };

export async function loader(_: Route.LoaderArgs) {
  const [targets, instruments, events] = await Promise.all([
    new PrismaTargetRepository().list(),
    new PrismaInstrumentRepository().list(),
    new PrismaLedgerRepository().list(),
  ]);

  const active = getActiveTarget(targets, new Date());

  const held = new Set(
    computePositions(events)
      .filter((position) => !new Decimal(position.quantity).isZero())
      .map((position) => position.instrumentId),
  );

  const rows = active
    ? toTargetRows(active, new Map(instruments.map((i) => [i.id, i])), held)
    : [];

  return {
    active: active
      ? {
          name: active.name,
          activeFrom: active.activeFrom.toISOString(),
          note: active.note ?? null,
          total: monthlyTotal(active),
        }
      : null,
    rows,
    versions: toTargetVersionRows(targets, active?.id ?? null),
    defaultLines: rows
      .map((row) => `${row.instrumentId} ${row.monthlyAmount}`)
      .join("\n"),
  };
}

const createForm = z.object({
  name: z.string().trim().min(1),
  activeFrom: z.string().min(1),
  note: z.string().trim().default(""),
  lines: z.string().min(1),
});

const deleteForm = z.object({ id: z.string().min(1) });

export async function action({ request }: Route.ActionArgs) {
  const form = Object.fromEntries(await request.formData());

  if (form.intent === "delete") {
    const parsed = deleteForm.safeParse(form);
    if (!parsed.success) {
      return { ok: false as const, error: es.target.form.invalid };
    }
    await new PrismaTargetRepository().remove(parsed.data.id);
    return { ok: true as const };
  }

  const parsed = createForm.safeParse(form);
  if (!parsed.success) {
    return { ok: false as const, error: es.target.form.invalid };
  }

  const activeFrom = new Date(parsed.data.activeFrom);
  if (Number.isNaN(activeFrom.getTime())) {
    return { ok: false as const, error: es.target.form.invalid };
  }

  let target: PortfolioTarget;
  try {
    target = {
      id: randomUUID(),
      name: parsed.data.name,
      activeFrom,
      note: parsed.data.note === "" ? null : parsed.data.note,
      createdAt: new Date(),
      lines: parseTargetLines(parsed.data.lines),
    };
  } catch (error) {
    if (error instanceof TargetParseError) {
      return { ok: false as const, error: error.message };
    }
    throw error;
  }

  if (target.lines.length === 0) {
    return { ok: false as const, error: es.target.form.invalid };
  }

  const instruments = await new PrismaInstrumentRepository().list();
  const mismatches = findIdMismatches(
    target.lines,
    instruments.map((instrument) => instrument.id),
  );
  if (mismatches.length > 0) {
    return {
      ok: false as const,
      error: es.target.form.idMismatch(
        mismatches.map((m) => `${m.given} → ${m.likely}`).join(", "),
      ),
    };
  }

  try {
    await new PrismaTargetRepository().create(target);
  } catch (error) {
    console.error("Recording a target version failed", error);
    return { ok: false as const, error: es.target.form.saveFailed };
  }

  return { ok: true as const };
}

export default function Target({ loaderData }: Route.ComponentProps) {
  const { active, rows, versions, defaultLines } = loaderData;
  const copy = es.target;

  return (
    <main className="mx-auto max-w-4xl px-4 py-8 md:px-6">
      <header className="mb-4">
        <p className="text-[13px] text-muted">{copy.intro}</p>
      </header>

      <Card className="mb-6">
        {active ? (
          <TargetLines
            rows={rows}
            total={active.total}
            activeFrom={active.activeFrom}
            note={active.note}
          />
        ) : (
          <p className="px-5 py-10 text-center text-[13px] text-muted">
            {copy.none}
          </p>
        )}
      </Card>

      <h2 className="mb-2 text-[13px] text-muted">{copy.form.title}</h2>
      <Card className="mb-6">
        <TargetForm defaultLines={defaultLines} />
      </Card>

      <h2 className="mb-2 text-[13px] text-muted">{copy.history.title}</h2>
      <Card>
        <TargetVersions versions={versions} />
      </Card>
    </main>
  );
}

export function ErrorBoundary() {
  return (
    <main className="mx-auto max-w-4xl px-4 py-8 md:px-6">
      <Card>
        <PortfolioError onRetry={() => window.location.reload()} />
      </Card>
    </main>
  );
}
