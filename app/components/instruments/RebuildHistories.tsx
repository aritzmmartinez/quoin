import { RefreshCw } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useRevalidator } from "react-router";
import { toast } from "sonner";

import { inTurn, rangeSince, useCopy } from "~/lib";
import { postIngest } from "../ingest/api";
import { Button } from "../ui/Button";
import { Modal } from "../ui/Modal";

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
  const dialog = useRef<HTMLDialogElement>(null);
  const mounted = useRef(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  if (targets.length === 0) return null;

  async function run() {
    dialog.current?.close();
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
    <>
      <Button
        size="sm"
        onClick={() => dialog.current?.showModal()}
        disabled={busy}
      >
        <RefreshCw
          size={13}
          strokeWidth={1.75}
          aria-hidden
          className={busy ? "animate-spin" : undefined}
        />
        {copy.rebuild}
      </Button>

      <Modal ref={dialog} title={copy.rebuild}>
        <div className="py-4 text-[13px]">
          <p className="text-body">{copy.rebuildConfirm(targets.length)}</p>
          <div className="mt-4 flex justify-end gap-2">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => dialog.current?.close()}
            >
              {copy.cancel}
            </Button>
            <Button size="sm" variant="primary" onClick={() => void run()}>
              {copy.confirm}
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
