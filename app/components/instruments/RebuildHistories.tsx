import { RefreshCw } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useRevalidator } from "react-router";
import { toast } from "sonner";

import { inTurn, rangeSince, useCopy } from "~/lib";
import { postIngest } from "../ingest/api";
import { Button } from "../ui/Button";

export interface RebuildTarget {
  id: string;
  name: string;
  symbol: string;
  historyStart: string | null;
}

type Step = { name: string; error: string | null };

export function RebuildHistories({
  targets,
}: {
  targets: readonly RebuildTarget[];
}) {
  const t = useCopy();
  const copy = t.instruments.history;
  const revalidator = useRevalidator();
  const mounted = useRef(true);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  if (targets.length === 0) return null;

  async function run() {
    setConfirming(false);
    setBusy(true);
    const total = targets.length;
    const id = toast.loading(copy.rebuilding(1, total));
    let current = 0;

    const steps = await inTurn(
      targets,
      async (target): Promise<Step> => {
        current += 1;
        toast.loading(copy.rebuilding(current, total), {
          id,
          description: target.name,
        });
        const response = await postIngest(t, {
          intent: "replace",
          instrumentId: target.id,
          symbol: target.symbol,
          range: rangeSince(
            target.historyStart ? new Date(target.historyStart) : null,
            new Date(),
          ),
        });
        return {
          name: target.name,
          error: response.ok ? null : response.error,
        };
      },
      {
        onError: (_error, target) => ({
          name: target.name,
          error: copy.failed,
        }),
        stopped: () => !mounted.current,
      },
    );

    const failed = steps.filter((step) => step.error !== null);
    const summary = copy.rebuilt(steps.length - failed.length, total);

    if (failed.length === 0) {
      toast.success(summary, { id, description: undefined });
    } else {
      toast.error(summary, {
        id,
        duration: Infinity,
        closeButton: true,
        description: (
          <>
            <p>{copy.rebuildFailed}</p>
            <ul className="mt-1 list-disc pl-4">
              {failed.map((step) => (
                <li key={step.name}>
                  {step.name}: {step.error}
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
    <div className="text-[12px]">
      {!confirming && (
        <Button size="sm" onClick={() => setConfirming(true)} disabled={busy}>
          <RefreshCw
            size={13}
            strokeWidth={1.75}
            aria-hidden
            className={busy ? "animate-spin" : undefined}
          />
          {copy.rebuild}
        </Button>
      )}

      {confirming && (
        <div className="mt-2 max-w-3xl rounded-md border border-border bg-surface px-3 py-2">
          <p>{copy.rebuildConfirm(targets.length)}</p>
          <div className="mt-2 flex items-center gap-2">
            <Button size="sm" onClick={() => void run()}>
              {copy.confirm}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setConfirming(false)}
            >
              {copy.cancel}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
