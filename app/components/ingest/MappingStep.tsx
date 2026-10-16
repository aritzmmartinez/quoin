import type { PendingMapping } from "~/lib/ingest";

import { useCopy, useFormat } from "~/lib";
import { postIngest } from "./api";
import { SymbolMapper } from "./SymbolMapper";

export function MappingStep({
  pending,
  mapped,
  onMapped,
}: {
  pending: readonly PendingMapping[];
  mapped: Readonly<Record<string, string>>;
  onMapped: (instrumentId: string, symbol: string) => void;
}) {
  const t = useCopy();
  const copy = t.ingest.map;
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
  const { formatQuantity } = useFormat();
  const t = useCopy();
  const copy = t.ingest.map;

  async function save(symbol: string): Promise<string | null> {
    const response = await postIngest(t, {
      intent: "map",
      instrumentId: item.instrumentId,
      symbol,
    });
    if (!response.ok) return response.error;
    if (response.step === "map") onMapped(item.instrumentId, symbol);
    return null;
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

      <SymbolMapper
        instrumentId={item.instrumentId}
        stored={saved}
        saveLabel={copy.save}
        onSave={save}
      />
    </li>
  );
}
