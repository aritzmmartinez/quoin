import { useState } from "react";
import { ChevronDown, Upload } from "lucide-react";
import { useFetcher } from "react-router";

import { exposureKindSchema, KINDS_NEEDING_LEAF } from "~/core/domain";
import {
  DASH,
  es,
  formatDate,
  formatMoney,
  formatPercent,
  terToPercentInput,
  type InstrumentListItem,
} from "~/lib";

import { HoldingsUpload } from "./HoldingsUpload";

const KINDS = exposureKindSchema.options;
const GRID =
  "grid-cols-[minmax(0,1.4fr)_150px_120px_150px_minmax(0,160px)_112px] items-center gap-3";

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
      <div className="min-w-240">
        <div
          className={`grid ${GRID} border-b border-border px-5 py-2 text-[11px] font-medium tracking-wide text-muted`}
        >
          <span>{copy.columns.instrument}</span>
          <span>{copy.columns.exposure}</span>
          <span>{copy.columns.leaf}</span>
          <span>{copy.columns.ter}</span>
          <span>{copy.columns.composition}</span>
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
  const [ter, setTer] = useState<string>(terToPercentInput(item.ter));
  const [uploading, setUploading] = useState(false);

  const needsLeaf = KINDS_NEEDING_LEAF.some((k) => k === kind);
  const dirty =
    kind !== (item.exposureKind ?? "") ||
    leaf !== (item.exposureLeafId ?? "") ||
    ter !== terToPercentInput(item.ter);
  const busy = fetcher.state !== "idle";
  const saved = fetcher.data?.ok === true && !dirty;
  const error = fetcher.data?.ok === false ? fetcher.data.error : undefined;
  const canImport = item.exposureKind === "EQUITY_FUND";

  return (
    <li className="border-b border-border last:border-b-0">
      <div className={`grid ${GRID} px-5 py-2.5 text-[13px]`}>
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
          <input type="hidden" name="intent" value="exposure" />

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

          <input
            name="exposureLeafId"
            value={leaf}
            onChange={(e) => setLeaf(e.target.value)}
            disabled={!needsLeaf}
            required={needsLeaf}
            aria-label={copy.columns.leaf}
            placeholder={needsLeaf ? copy.leafPlaceholder : DASH}
            className="w-full rounded-md border border-border bg-surface px-2 py-1.5 text-[12px] disabled:opacity-40"
          />

          <div className="flex items-center gap-2">
            <input
              name="ter"
              value={ter}
              onChange={(e) => setTer(e.target.value)}
              inputMode="decimal"
              aria-label={copy.columns.ter}
              placeholder={copy.terPlaceholder}
              className="w-16 rounded-md border border-border bg-surface px-2 py-1.5 text-right text-[12px] tabular-nums"
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

        <div className="min-w-0 text-[12px]">
          {error ? (
            <span className="text-negative">{error}</span>
          ) : canImport ? (
            <Composition
              item={item}
              open={uploading}
              onToggle={() => setUploading((v) => !v)}
            />
          ) : (
            <span
              className={`font-mono text-[11px] ${item.resolvesTo.startsWith("UNRESOLVED") ? "text-muted" : ""}`}
            >
              {item.resolvesTo}
            </span>
          )}
        </div>

        <span className="text-right text-[12px] tabular-nums text-muted">
          {item.value === null ? DASH : formatMoney(item.value)}
        </span>
      </div>

      {uploading && (
        <HoldingsUpload
          instrumentId={item.id}
          onDone={() => setUploading(false)}
        />
      )}
    </li>
  );
}

function Composition({
  item,
  open,
  onToggle,
}: {
  item: InstrumentListItem;
  open: boolean;
  onToggle: () => void;
}) {
  const copy = es.holdings;

  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      className="flex w-full items-center gap-1.5 rounded-md px-1.5 py-1 text-left transition-colors hover:bg-surface-2"
    >
      {item.holdingsCount > 0 ? (
        <>
          <ChevronDown
            size={13}
            strokeWidth={1.75}
            aria-hidden
            className={`shrink-0 text-muted transition-transform ${open ? "" : "-rotate-90"}`}
          />
          <span className="truncate">
            {copy.summary(
              item.holdingsCount,
              formatPercent(item.holdingsCovered ?? "0"),
            )}
          </span>
          {item.holdingsAsOf && (
            <span className="shrink-0 text-[11px] text-muted">
              {formatDate(item.holdingsAsOf)}
            </span>
          )}
        </>
      ) : (
        <>
          <Upload
            size={13}
            strokeWidth={1.75}
            aria-hidden
            className="shrink-0 text-muted"
          />
          <span className="text-muted">{copy.import}</span>
        </>
      )}
    </button>
  );
}
