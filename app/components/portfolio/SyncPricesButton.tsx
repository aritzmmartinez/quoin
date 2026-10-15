import { RefreshCw } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useRevalidator } from "react-router";
import { toast } from "sonner";

import type { PriceSyncResponse } from "~/routes/prices-sync";

import {
  failedSync,
  inTurn,
  priceSyncToast,
  useCopy,
  type InstrumentSync,
} from "~/lib";
import { Button } from "../ui/Button";

const ENDPOINT = "/api/prices/sync";

export interface SyncPricesTarget {
  id: string;
  name: string;
}

async function syncOne(target: SyncPricesTarget): Promise<InstrumentSync> {
  const response = await fetch(ENDPOINT, {
    method: "POST",
    body: new URLSearchParams({ instrumentId: target.id }),
  });
  const body = (await response.json()) as PriceSyncResponse;
  if (!body.ok) return failedSync(target);
  const { ok: _ok, ...sync } = body;
  return sync;
}

export function SyncPricesButton({
  targets,
  unmapped,
}: {
  targets: readonly SyncPricesTarget[];
  unmapped: { open: number; closed: number };
}) {
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

  async function onClick() {
    setBusy(true);
    const total = targets.length;
    const id = toast.loading(copy.syncing(Math.min(1, total), total));
    let current = 0;

    const steps = await inTurn(
      targets,
      (target) => {
        current += 1;
        toast.loading(copy.syncing(current, total), {
          id,
          description: target.name,
        });
        return syncOne(target);
      },
      {
        onError: (_error, target) => failedSync(target),
        stopped: () => !mounted.current,
      },
    );

    const summary = priceSyncToast(t, steps, unmapped);
    if (summary.failures.length === 0) {
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

  return (
    <Button size="sm" onClick={() => void onClick()} disabled={busy}>
      <RefreshCw
        size={13}
        strokeWidth={1.75}
        aria-hidden
        className={busy ? "animate-spin" : undefined}
      />
      {copy.action}
    </Button>
  );
}
