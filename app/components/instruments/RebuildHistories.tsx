import { useEffect, useRef, useState } from "react";
import { useRevalidator } from "react-router";

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
  const [progress, setProgress] = useState<number | null>(null);
  const [finished, setFinished] = useState<Step[] | null>(null);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  if (targets.length === 0) return null;

  async function run() {
    setConfirming(false);
    setFinished(null);
    setProgress(0);

    const steps = await inTurn(
      targets,
      async (target): Promise<Step> => {
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
        onEach: (_step, index) => {
          if (mounted.current) setProgress(index + 1);
        },
        stopped: () => !mounted.current,
      },
    );

    if (!mounted.current) return;
    setProgress(null);
    setFinished(steps);
    void revalidator.revalidate();
  }

  const failed = finished?.filter((step) => step.error !== null) ?? [];

  return (
    <div className="text-[12px]">
      {!confirming && progress === null && (
        <Button size="sm" onClick={() => setConfirming(true)}>
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

      {progress !== null && (
        <p className="text-muted" role="status">
          {copy.rebuilding(progress, targets.length)}
        </p>
      )}

      {finished && (
        <div className="mt-2" role="status">
          <p className="text-muted">
            {copy.rebuilt(finished.length - failed.length, targets.length)}
          </p>
          {failed.length > 0 && (
            <>
              <p className="mt-1 text-negative">{copy.rebuildFailed}</p>
              <ul className="mt-1 list-disc pl-4 text-negative">
                {failed.map((step) => (
                  <li key={step.name}>
                    {step.name}: {step.error}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </div>
  );
}
