import { useEffect, useRef, useState } from "react";
import { useRevalidator } from "react-router";
import { toast } from "sonner";

import type { PriceSyncResponse } from "~/routes/prices-sync";

import {
  failedSync,
  priceSyncToast,
  SyncHaltedError,
  syncInTurn,
  useCopy,
  type InstrumentSync,
} from "~/lib";

const ENDPOINT = "/api/prices/sync";

export interface PriceRefreshTarget {
  id: string;
  name: string;
}

async function syncOne(target: PriceRefreshTarget): Promise<InstrumentSync> {
  const response = await fetch(ENDPOINT, {
    method: "POST",
    body: new URLSearchParams({ instrumentId: target.id }),
  });
  const body = (await response.json()) as PriceSyncResponse;
  if (!body.ok && body.problem === "error") {
    throw new SyncHaltedError(body.cause ?? response.statusText);
  }
  if (!body.ok) return failedSync(target, body.problem);
  const { ok: _ok, ...sync } = body;
  return sync;
}

export function usePriceRefresh(
  targets: readonly PriceRefreshTarget[],
  unmapped: { open: number; closed: number },
) {
  const t = useCopy();
  const revalidator = useRevalidator();
  const mounted = useRef(true);
  const [busy, setBusy] = useState(false);
  const copy = t.instruments.sync;

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  async function refresh() {
    setBusy(true);
    const total = targets.length;
    const id = toast.loading(copy.syncing(Math.min(1, total), total));

    const { steps, halted } = await syncInTurn(targets, syncOne, {
      onStart: (target, index) => {
        toast.loading(copy.syncing(index + 1, total), {
          id,
          description: target.name,
        });
      },
      stopped: () => !mounted.current,
    });

    const summary = priceSyncToast(t, steps, unmapped);
    if (halted !== null) {
      toast.error(t.common.halted(halted), {
        id,
        description: undefined,
        duration: Infinity,
        closeButton: true,
      });
    } else if (summary.failures.length === 0) {
      toast.success(summary.message, {
        id,
        description: summary.description,
      });
    } else {
      toast.error(summary.message, {
        id,
        duration: Infinity,
        closeButton: true,
        description: (
          <>
            {summary.description && <p>{summary.description}</p>}
            <p>{copy.failedList}</p>
            <ul className="mt-1 list-disc pl-4">
              {summary.failures.map((failure) => (
                <li key={failure.name}>
                  {failure.name}: {failure.reason}
                </li>
              ))}
            </ul>
          </>
        ),
      });
    }

    if (!mounted.current) return;
    setBusy(false);
    void revalidator.revalidate();
  }

  return { refresh: () => void refresh(), busy };
}
