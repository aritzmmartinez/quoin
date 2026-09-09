import { useState } from "react";

import type { PendingMapping } from "~/lib/ingest";
import type { SymbolCheck } from "~/lib/symbol-check";

import { es, formatMoney, formatQuantity, formatRelativeTime } from "~/lib";
import { Button } from "../ui/Button";
import { postIngest } from "./api";

export function MappingStep({
  pending,
  mapped,
  onMapped,
}: {
  pending: readonly PendingMapping[];
  mapped: Readonly<Record<string, string>>;
  onMapped: (instrumentId: string, symbol: string) => void;
}) {
  const copy = es.ingest.map;
  const done = Object.keys(mapped).length;

  return (
    <>
      <p className="mb-2 text-[12px] text-muted">{copy.intro}</p>
      <p className="mb-4 text-[12px] text-muted">{copy.warning}</p>

      <ul className="divide-y divide-border border-y border-border">
        {pending.map((item) => (
          <MappingRow
            key={item.instrumentId}
            item={item}
            saved={mapped[item.instrumentId] ?? null}
            onMapped={onMapped}
          />
        ))}
      </ul>

      <p className="mt-3 text-[12px] text-muted">
        {copy.mapped(done, pending.length)}
      </p>
      {done < pending.length && (
        <p className="mt-1 text-[12px] text-muted">{copy.canContinue}</p>
      )}
    </>
  );
}

function MappingRow({
  item,
  saved,
  onMapped,
}: {
  item: PendingMapping;
  saved: string | null;
  onMapped: (instrumentId: string, symbol: string) => void;
}) {
  const copy = es.ingest.map;
  const [symbol, setSymbol] = useState(saved ?? "");
  const [check, setCheck] = useState<SymbolCheck | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState<"check" | "save" | null>(null);

  const trimmed = symbol.trim();
  const verified = check !== null && check.symbol === trimmed;

  async function verify() {
    if (trimmed === "") return;
    setBusy("check");
    setError(null);
    const response = await postIngest({
      intent: "check",
      instrumentId: item.instrumentId,
      symbol: trimmed,
    });
    setBusy(null);
    if (!response.ok) {
      setCheck(null);
      setError(response.error);
      return;
    }
    if (response.step === "check") setCheck(response.check);
  }

  async function save() {
    setBusy("save");
    setError(null);
    setNote(null);
    const response = await postIngest({
      intent: "map",
      instrumentId: item.instrumentId,
      symbol: trimmed,
    });
    setBusy(null);
    if (!response.ok) {
      setError(response.error);
      return;
    }
    if (response.step === "map") {
      setNote(response.removed > 0 ? copy.removed(response.removed) : null);
      onMapped(item.instrumentId, trimmed);
    }
  }

  return (
    <li className="py-3">
      <div className="mb-2">
        <p className="text-[13px]">{item.name}</p>
        <p className="font-mono text-[11px] text-muted">
          {item.instrumentId} · {formatQuantity(item.quantity)}{" "}
          {copy.quantity.toLowerCase()}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <input
          value={symbol}
          onChange={(event) => {
            setSymbol(event.target.value);
            setCheck(null);
            setError(null);
            setNote(null);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              void verify();
            }
          }}
          placeholder={copy.placeholder}
          aria-label={copy.placeholder}
          spellCheck={false}
          className="w-44 rounded-md border border-border bg-surface px-2 py-1.5 font-mono text-[12px]"
        />
        <Button
          size="sm"
          onClick={() => void verify()}
          disabled={trimmed === "" || busy !== null}
        >
          {busy === "check" ? copy.verifying : copy.verify}
        </Button>
        <Button
          size="sm"
          onClick={() => void save()}
          disabled={!verified || busy !== null}
        >
          {busy === "save" ? copy.saving : copy.save}
        </Button>
        {saved === trimmed && trimmed !== "" && (
          <span className="text-[12px] text-positive">{copy.saved}</span>
        )}
      </div>

      {verified && check && <CheckDetail check={check} />}

      {note && <p className="mt-2 text-[12px] text-muted">{note}</p>}
      {error && <p className="mt-2 text-[12px] text-negative">{error}</p>}
    </li>
  );
}

function CheckDetail({ check }: { check: SymbolCheck }) {
  const copy = es.ingest.map;
  const value =
    check.currency === "EUR"
      ? formatMoney(check.impliedValue)
      : `${check.impliedValue} ${check.currency}`;

  return (
    <div className="mt-2 rounded-md border border-border bg-surface-2 px-3 py-2 text-[12px]">
      <div className="flex flex-wrap items-baseline gap-x-5 gap-y-1">
        <span className="text-muted">
          {copy.price}{" "}
          <span className="tabular-nums text-text">
            {check.price} {check.currency}
          </span>
        </span>
        <span className="text-muted">
          {copy.impliedValue}{" "}
          <span className="tabular-nums text-text">{value}</span>
        </span>
        <span className="text-muted">{formatRelativeTime(check.asOf)}</span>
      </div>
      {!check.fresh && <p className="mt-1 text-negative">{copy.stale}</p>}
      {check.closed && <p className="mt-1 text-muted">{copy.closed}</p>}
    </div>
  );
}
