import { useReducer } from "react";

import type { SymbolCheck } from "~/lib/symbol-check";

import { useCopy, useFormat } from "~/lib";
import { Button } from "../ui/Button";
import { postIngest } from "./api";
import {
  canRedownload,
  canSave,
  canVerify,
  checkRequest,
  initialMapper,
  isVerified,
  mapperReducer,
  trimmedSymbol,
} from "./symbol-mapper";

export function SymbolMapper({
  instrumentId,
  stored,
  saveLabel,
  disabled = false,
  onSave,
  onVerify,
  redownload,
}: {
  instrumentId: string;
  stored: string | null;
  saveLabel: string;
  disabled?: boolean;
  onSave: (symbol: string) => Promise<string | null>;
  onVerify?: () => void;
  redownload?: {
    label: (symbol: string) => string;
    run: (symbol: string) => void;
  };
}) {
  const t = useCopy();
  const copy = t.ingest.map;
  const [state, dispatch] = useReducer(
    mapperReducer,
    stored ?? "",
    initialMapper,
  );
  const symbol = trimmedSymbol(state);

  async function verify() {
    if (!canVerify(state) || disabled) return;
    dispatch({ type: "verify" });
    onVerify?.();
    const response = await postIngest(t, checkRequest(instrumentId, state));
    if (!response.ok) dispatch({ type: "failed", error: response.error });
    else if (response.step === "check") {
      dispatch({ type: "verified", check: response.check });
    }
  }

  async function save() {
    dispatch({ type: "save" });
    const error = await onSave(symbol);
    dispatch(error ? { type: "failed", error } : { type: "saved" });
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={state.symbol}
          onChange={(event) =>
            dispatch({ type: "edit", symbol: event.target.value })
          }
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
          disabled={!canVerify(state) || disabled}
        >
          {state.busy === "check" ? copy.verifying : copy.verify}
        </Button>
        {redownload && stored !== null && symbol === stored ? (
          <Button
            size="sm"
            onClick={() => redownload.run(stored)}
            disabled={!canRedownload(state, stored) || disabled}
          >
            {redownload.label(stored)}
          </Button>
        ) : (
          <Button
            size="sm"
            onClick={() => void save()}
            disabled={!canSave(state, stored) || disabled}
          >
            {state.busy === "save" ? copy.saving : saveLabel}
          </Button>
        )}
        {!redownload && stored !== null && stored === symbol && (
          <span className="text-[12px] text-positive">{copy.saved}</span>
        )}
      </div>

      {isVerified(state) && state.check && <CheckDetail check={state.check} />}

      {state.error && (
        <p className="mt-2 text-[12px] text-negative">{state.error}</p>
      )}
    </div>
  );
}

function CheckDetail({ check }: { check: SymbolCheck }) {
  const { formatDate, formatMoney, formatPercent, formatRelativeTime } =
    useFormat();
  const t = useCopy();
  const copy = t.ingest.map;
  const value =
    check.currency === "EUR"
      ? formatMoney(check.impliedValue)
      : `${check.impliedValue} ${check.currency}`;

  return (
    <div className="mt-2 rounded-md border border-border bg-surface-2 px-3 py-2 text-[12px]">
      {check.name && <p className="mb-1 font-semibold">{check.name}</p>}
      <div className="flex flex-wrap items-baseline gap-x-5 gap-y-1">
        <span className="text-muted">
          {copy.price}{" "}
          <span className="font-mono tabular-nums text-text">
            {check.price} {check.currency}
          </span>
        </span>
        {!check.closed && (
          <span className="text-muted">
            {copy.impliedValue}{" "}
            <span className="font-mono tabular-nums text-text">{value}</span>
          </span>
        )}
        <span className="text-muted">{formatRelativeTime(check.asOf)}</span>
      </div>
      {check.foreignCurrency && (
        <p className="mt-1 text-negative">
          {copy.notEur(check.foreignCurrency)}
        </p>
      )}
      {!check.fresh && <p className="mt-1 text-negative">{copy.stale}</p>}

      {check.trades.length > 0 && (
        <div className="mt-2">
          <p className="text-muted">{copy.trades}</p>
          <ul className="mt-1 space-y-0.5 font-mono tabular-nums">
            {check.trades.map((trade) => (
              <li
                key={trade.ts}
                className={trade.off ? "text-negative" : "text-text"}
              >
                {copy.tradeLine(
                  formatDate(trade.ts),
                  formatMoney(trade.traded),
                  formatMoney(trade.close),
                  formatPercent(trade.deviation, 1, { signed: true }),
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
      {check.tradesOff && (
        <p className="mt-1 text-negative">{copy.tradesOff}</p>
      )}
      {check.tradesAsked > 0 &&
        check.trades.length === 0 &&
        !check.foreignCurrency && (
          <p className="mt-1 text-muted">{copy.noTrades}</p>
        )}
    </div>
  );
}
