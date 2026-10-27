import { randomUUID } from "node:crypto";

import Decimal from "decimal.js";
import { Crosshair } from "lucide-react";
import { Link } from "react-router";
import { z } from "zod";

import type { Route } from "./+types/target";

import {
  PrismaInstrumentRepository,
  PrismaLedgerRepository,
  PrismaTargetRepository,
} from "~/adapters/persistence";
import {
  Card,
  EmptyState,
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
  targetOnDay,
  type PortfolioTarget,
} from "~/core/domain";
import { today } from "~/core/calendar";
import { computePositions } from "~/core/projections";
import {
  type Copy,
  copyFor,
  copyFromMatches,
  createFormat,
  parseLocale,
  toTargetRows,
  toTargetVersionRows,
  useCopy,
} from "~/lib";
import { loadResidence } from "~/lib/residence.server";

export function meta({ matches }: Route.MetaArgs) {
  const t = copyFromMatches(matches);
  return [
    { title: t.meta.target.title },
    { name: "description", content: t.meta.target.description },
  ];
}

export const handle = { title: (t: Copy) => t.target.title };

export async function loader(_: Route.LoaderArgs) {
  const [targets, instruments, events, { jurisdiction }] = await Promise.all([
    new PrismaTargetRepository().list(),
    new PrismaInstrumentRepository().list(),
    new PrismaLedgerRepository().list(),
    loadResidence(),
  ]);
  const now = new Date();

  const active = getActiveTarget(targets, today(jurisdiction.zone, now));

  const held = new Set(
    computePositions(events, jurisdiction)
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
          activeFrom: active.activeFrom,
          note: active.note ?? null,
          total: monthlyTotal(active),
        }
      : null,
    rows,
    versions: toTargetVersionRows(targets, active?.id ?? null),
    today: today(jurisdiction.zone, now),
    defaultLines: rows
      .map((row) => `${row.instrumentId} ${row.monthlyAmount}`)
      .join("\n"),
  };
}

const createForm = z.object({
  name: z.string().trim().min(1),
  activeFrom: z.iso.date(),
  note: z.string().trim().default(""),
  lines: z.string().min(1),
});

const deleteForm = z.object({ id: z.string().min(1) });

export async function action({ request }: Route.ActionArgs) {
  const locale = parseLocale(request.headers.get("Cookie"));
  const t = copyFor(locale);
  const form = Object.fromEntries(await request.formData());

  if (form.intent === "delete") {
    const parsed = deleteForm.safeParse(form);
    if (!parsed.success) {
      return { ok: false as const, error: t.target.form.invalid };
    }
    await new PrismaTargetRepository().remove(parsed.data.id);
    return { ok: true as const };
  }

  const parsed = createForm.safeParse(form);
  if (!parsed.success) {
    return { ok: false as const, error: t.target.form.invalid };
  }

  const { activeFrom } = parsed.data;

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
    return { ok: false as const, error: t.target.form.invalid };
  }

  const instruments = await new PrismaInstrumentRepository().list();
  const mismatches = findIdMismatches(
    target.lines,
    instruments.map((instrument) => instrument.id),
  );
  if (mismatches.length > 0) {
    return {
      ok: false as const,
      error: t.target.form.idMismatch(
        mismatches.map((m) => `${m.given} → ${m.likely}`).join(", "),
      ),
    };
  }

  const repository = new PrismaTargetRepository();
  const taken = targetOnDay(await repository.list(), activeFrom);
  if (taken) {
    return {
      ok: false as const,
      error: t.target.form.dayTaken(
        taken.name,
        createFormat(
          locale,
          (await loadResidence()).displayZone,
        ).formatCalendarDate(taken.activeFrom),
      ),
    };
  }

  try {
    await repository.create(target);
  } catch (error) {
    console.error("Recording a target version failed", error);
    return { ok: false as const, error: t.target.form.saveFailed };
  }

  return { ok: true as const };
}

export default function Target({ loaderData }: Route.ComponentProps) {
  const t = useCopy();
  const { active, rows, versions, defaultLines, today } = loaderData;
  const copy = t.target;

  return (
    <>
      <header className="mb-4">
        <p className="text-[13px] text-muted">{copy.intro}</p>
        {active && (
          <Link
            to="/projection"
            className="mt-2 inline-block text-[12.5px] text-muted underline decoration-dotted underline-offset-2 transition-colors hover:text-text"
          >
            {t.projection.fromTarget}
          </Link>
        )}
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
          <EmptyState
            icon={Crosshair}
            {...(versions.length === 0 ? copy.none : copy.notYetActive)}
          />
        )}
      </Card>

      <h2 className="mb-2 text-[13px] text-muted">{copy.form.title}</h2>
      <Card className="mb-6">
        <TargetForm defaultLines={defaultLines} today={today} />
      </Card>

      {versions.length > 0 && (
        <>
          <h2 className="mb-2 text-[13px] text-muted">{copy.history.title}</h2>
          <Card>
            <TargetVersions versions={versions} />
          </Card>
        </>
      )}
    </>
  );
}

export { ErrorBoundary } from "~/components/ui/ErrorBoundary";
