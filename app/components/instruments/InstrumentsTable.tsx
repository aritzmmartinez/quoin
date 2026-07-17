import { useState } from "react";
import { useFetcher } from "react-router";

import { exposureKindSchema, KINDS_NEEDING_LEAF } from "~/core/domain";
import { DASH, es, formatMoney, type InstrumentListItem } from "~/lib";

const KINDS = exposureKindSchema.options;

export function InstrumentsTable({ items }: { items: InstrumentListItem[] }) {
  const copy = es.instruments;

  if (items.length === 0) {
    return (
      <p className="px-5 py-10 text-center text-[13px] text-muted">
        {copy.empty}
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <div className="min-w-225">
        <div className="grid grid-cols-[minmax(0,1.5fr)_150px_180px_120px_112px] gap-3 border-b border-border px-5 py-2 text-[11px] font-medium tracking-wide text-muted">
          <span>{copy.columns.instrument}</span>
          <span>{copy.columns.exposure}</span>
          <span>{copy.columns.leaf}</span>
          <span>{copy.columns.resolvesTo}</span>
          <span className="text-right">{copy.columns.held}</span>
        </div>
        <ul>
          {items.map((item) => (
            <InstrumentRow key={item.id} item={item} />
          ))}
        </ul>
      </div>
    </div>
  );
}

function InstrumentRow({ item }: { item: InstrumentListItem }) {
  const copy = es.instruments;
  const fetcher = useFetcher<{ ok: boolean; error?: string }>();

  const [kind, setKind] = useState<string>(item.exposureKind ?? "");
  const [leaf, setLeaf] = useState<string>(item.exposureLeafId ?? "");

  const needsLeaf = KINDS_NEEDING_LEAF.some((k) => k === kind);
  const dirty =
    kind !== (item.exposureKind ?? "") || leaf !== (item.exposureLeafId ?? "");
  const busy = fetcher.state !== "idle";
  const saved = fetcher.data?.ok === true && !dirty;
  const error = fetcher.data?.ok === false ? fetcher.data.error : undefined;

  return (
    <li className="grid grid-cols-[minmax(0,1.5fr)_150px_180px_120px_112px] items-center gap-3 border-b border-border px-5 py-2.5 text-[13px] last:border-b-0">
      <div className="min-w-0">
        <div className="truncate">{item.name}</div>
        <div className="font-mono text-[11px] text-muted">
          {item.id}
          {item.isClosed && (
            <span className="ml-2 rounded-full border border-border px-1.5 py-0.5 text-[10px] tracking-wide">
              {copy.closed}
            </span>
          )}
        </div>
      </div>

      <fetcher.Form method="post" className="contents">
        <input type="hidden" name="id" value={item.id} />

        <select
          name="exposureKind"
          value={kind}
          aria-label={copy.columns.exposure}
          onChange={(e) => setKind(e.target.value)}
          className="w-full rounded-md border border-border bg-surface px-2 py-1.5 text-[12px]"
        >
          <option value="">{copy.defaultOption}</option>
          {KINDS.map((k) => (
            <option key={k} value={k}>
              {k}
            </option>
          ))}
        </select>

        <div className="flex items-center gap-2">
          <input
            name="exposureLeafId"
            value={leaf}
            onChange={(e) => setLeaf(e.target.value)}
            disabled={!needsLeaf}
            required={needsLeaf}
            aria-label={copy.columns.leaf}
            placeholder={needsLeaf ? copy.leafPlaceholder : DASH}
            className="w-23 rounded-md border border-border bg-surface px-2 py-1.5 text-[12px] disabled:opacity-40"
          />
          <button
            type="submit"
            disabled={!dirty || busy}
            className="rounded-md border border-border px-2 py-1.5 text-[12px] transition-colors hover:bg-surface-2 disabled:opacity-30"
          >
            {busy ? copy.saving : saved ? copy.saved : copy.save}
          </button>
        </div>
      </fetcher.Form>

      <span
        className={`font-mono text-[11px] ${item.resolvesTo.startsWith("UNRESOLVED") ? "text-muted" : ""}`}
        title={error}
      >
        {error ? (
          <span className="text-negative">{error}</span>
        ) : (
          item.resolvesTo
        )}
      </span>

      <span className="text-right text-[12px] tabular-nums text-muted">
        {item.value === null ? DASH : formatMoney(item.value)}
      </span>
    </li>
  );
}
