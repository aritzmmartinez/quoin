import { useRef, useState } from "react";
import { useFetcher } from "react-router";

import {
  HoldingsParseError,
  parseHoldingsCsv,
  type ColumnMap,
  type ParsedHoldings,
} from "~/adapters/ingestion/holdings";
import { es, formatPercent } from "~/lib";

type Override = Partial<Pick<ColumnMap, "identity" | "name" | "weight">>;

export function HoldingsUpload({
  instrumentId,
  onDone,
}: {
  instrumentId: string;
  onDone: () => void;
}) {
  const copy = es.holdings;
  const fetcher = useFetcher<{
    ok: boolean;
    error?: string;
    imported?: number;
  }>();
  const inputRef = useRef<HTMLInputElement>(null);

  const [csv, setCsv] = useState<string | null>(null);
  const [preview, setPreview] = useState<ParsedHoldings | null>(null);
  const [override, setOverride] = useState<Override>({});
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  function read(file: File, next: Override = {}) {
    file
      .text()
      .then((text) => {
        try {
          setPreview(parseHoldingsCsv(text, next));
          setCsv(text);
          setError(null);
        } catch (e) {
          setPreview(null);
          setError(
            e instanceof HoldingsParseError ? e.message : copy.unreadable,
          );
        }
      })
      .catch(() => setError(copy.unreadable));
  }

  function reparse(next: Override) {
    setOverride(next);
    if (csv === null) return;
    try {
      setPreview(parseHoldingsCsv(csv, next));
      setError(null);
    } catch (e) {
      setError(e instanceof HoldingsParseError ? e.message : copy.unreadable);
    }
  }

  if (fetcher.data?.ok) {
    onDone();
  }

  return (
    <div className="border-t border-border bg-surface px-5 py-4">
      {preview === null ? (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            const file = e.dataTransfer.files[0];
            if (file) read(file);
          }}
          onClick={() => inputRef.current?.click()}
          className={`cursor-pointer rounded-lg border border-dashed px-4 py-8 text-center transition-colors ${
            dragging ? "border-text bg-surface-2" : "border-border"
          }`}
        >
          <p className="text-[13px]">{copy.drop}</p>
          <p className="mt-1 text-[12px] text-muted">{copy.dropHint}</p>
          <input
            ref={inputRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) read(file);
            }}
          />
        </div>
      ) : (
        <Preview
          preview={preview}
          override={override}
          onOverride={reparse}
          onReset={() => {
            setPreview(null);
            setCsv(null);
            setOverride({});
          }}
          busy={fetcher.state !== "idle"}
          onConfirm={() =>
            fetcher.submit(
              {
                intent: "holdings",
                id: instrumentId,
                csv: csv ?? "",
                asOf: preview.asOfHint ?? "",
                ...override,
              },
              { method: "post", encType: "application/x-www-form-urlencoded" },
            )
          }
        />
      )}

      {(error ?? fetcher.data?.error) && (
        <p className="mt-3 text-[12px] text-negative">
          {error ?? fetcher.data?.error}
        </p>
      )}
    </div>
  );
}

function Preview({
  preview,
  override,
  onOverride,
  onReset,
  onConfirm,
  busy,
}: {
  preview: ParsedHoldings;
  override: Override;
  onOverride: (next: Override) => void;
  onReset: () => void;
  onConfirm: () => void;
  busy: boolean;
}) {
  const copy = es.holdings;
  const residual = Number(preview.residual);
  const [correcting, setCorrecting] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [filter, setFilter] = useState("");

  const needle = filter.trim().toLowerCase();
  const matching =
    needle === ""
      ? preview.holdings
      : preview.holdings.filter(
          (h) =>
            h.name.toLowerCase().includes(needle) ||
            h.identity.toLowerCase().includes(needle),
        );
  const shown = expanded || needle !== "" ? matching : matching.slice(0, 12);

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-x-5 gap-y-1 text-[12px]">
        <span>
          <strong className="tabular-nums">{preview.holdings.length}</strong>{" "}
          {copy.leaves}
        </span>
        <span className="text-muted">
          {copy.covered}{" "}
          <span className="tabular-nums text-text">
            {formatPercent(preview.covered)}
          </span>
        </span>
        <span className="text-muted">
          {copy.residual}{" "}
          <span className="tabular-nums text-text">
            {formatPercent(preview.residual)}
          </span>
        </span>
        {preview.foldedRows > 0 && (
          <span className="text-muted">{copy.folded(preview.foldedRows)}</span>
        )}
        {preview.asOfHint && (
          <span className="text-muted">
            {copy.asOf} <span className="text-text">{preview.asOfHint}</span>
          </span>
        )}
      </div>

      {preview.qualifier && (
        <p className="mb-3 text-[12px] text-muted">
          {copy.qualifier(preview.qualifier)}
        </p>
      )}

      {residual < 0 && (
        <p className="mb-3 text-[12px] text-muted">{copy.negativeResidual}</p>
      )}

      {correcting ? (
        <div className="mb-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
          <ColumnSelect
            label={copy.columns.identity}
            value={override.identity ?? preview.columns.identity}
            headers={preview.headers}
            onChange={(v) => onOverride({ ...override, identity: v })}
            note={preview.columns.identityKind}
          />
          <ColumnSelect
            label={copy.columns.name}
            value={override.name ?? preview.columns.name}
            headers={preview.headers}
            onChange={(v) => onOverride({ ...override, name: v })}
          />
          <ColumnSelect
            label={copy.columns.weight}
            value={override.weight ?? preview.columns.weight}
            headers={preview.headers}
            onChange={(v) => onOverride({ ...override, weight: v })}
          />
        </div>
      ) : (
        <p className="mb-3 text-[12px] text-muted">
          {copy.detected}:{" "}
          <span className="font-mono text-text">
            {preview.columns.identity}
          </span>
          {" · "}
          <span className="font-mono text-text">{preview.columns.name}</span>
          {" · "}
          <span className="font-mono text-text">{preview.columns.weight}</span>
          <button
            type="button"
            onClick={() => setCorrecting(true)}
            className="ml-2 underline transition-colors hover:text-text"
          >
            {copy.correct}
          </button>
        </p>
      )}

      {(expanded || preview.holdings.length > 12) && (
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder={copy.filter}
          aria-label={copy.filter}
          className="mb-2 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-[12px]"
        />
      )}

      <ul
        className={`mb-2 overflow-y-auto rounded-md border border-border ${
          expanded || needle !== "" ? "max-h-80" : "max-h-40"
        }`}
      >
        {shown.length === 0 && (
          <li className="px-3 py-3 text-center text-[12px] text-muted">
            {copy.noMatches}
          </li>
        )}
        {shown.map((h) => (
          <li
            key={h.identity}
            className="flex items-center gap-3 border-b border-border px-3 py-1.5 text-[12px] last:border-b-0"
          >
            <span className="w-32 shrink-0 truncate font-mono text-[11px] text-muted">
              {h.identity}
            </span>
            <span className="flex-1 truncate">{h.name}</span>
            <span className="tabular-nums">{formatPercent(h.weight)}</span>
          </li>
        ))}
      </ul>
      <p className="mb-3 flex items-center gap-2 text-[11px] text-muted">
        {needle !== "" ? (
          <span>{copy.showing(shown.length, preview.holdings.length)}</span>
        ) : (
          <>
            {preview.holdings.length > shown.length && (
              <span>{copy.showing(shown.length, preview.holdings.length)}</span>
            )}
            {preview.holdings.length > 12 && (
              <button
                type="button"
                onClick={() => setExpanded((v) => !v)}
                className="underline transition-colors hover:text-text"
              >
                {expanded
                  ? copy.showLess
                  : copy.showAll(preview.holdings.length)}
              </button>
            )}
          </>
        )}
      </p>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onConfirm}
          disabled={busy}
          className="rounded-md border border-border px-3 py-1.5 text-[12px] transition-colors hover:bg-surface-2 disabled:opacity-40"
        >
          {busy ? copy.importing : copy.confirm}
        </button>
        <button
          type="button"
          onClick={onReset}
          className="rounded-md px-3 py-1.5 text-[12px] text-muted transition-colors hover:text-text"
        >
          {copy.cancel}
        </button>
        <span className="text-[12px] text-muted">{copy.replaces}</span>
      </div>
    </div>
  );
}

function ColumnSelect({
  label,
  value,
  headers,
  onChange,
  note,
}: {
  label: string;
  value: string;
  headers: string[];
  onChange: (value: string) => void;
  note?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] text-muted">
        {label}
        {note && <span className="ml-1 font-mono">({note})</span>}
      </span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-md border border-border bg-surface px-2 py-1.5 text-[12px]"
      >
        {headers.map((h) => (
          <option key={h} value={h}>
            {h}
          </option>
        ))}
      </select>
    </label>
  );
}
