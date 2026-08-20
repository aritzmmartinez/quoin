import { useFetcher } from "react-router";

import { es, formatDate, formatMoney, type TargetVersionRow } from "~/lib";

export function TargetVersions({ versions }: { versions: TargetVersionRow[] }) {
  const copy = es.target.history;

  if (versions.length === 0) {
    return (
      <p className="px-5 py-8 text-center text-[13px] text-muted">
        {copy.empty}
      </p>
    );
  }

  return (
    <ul>
      {versions.map((version) => (
        <VersionRow key={version.id} version={version} />
      ))}
    </ul>
  );
}

function VersionRow({ version }: { version: TargetVersionRow }) {
  const copy = es.target.history;
  const fetcher = useFetcher();
  const busy = fetcher.state !== "idle";

  return (
    <li className="flex items-center gap-3 border-b border-border px-5 py-2.5 text-[13px] last:border-b-0">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate">{version.name}</span>
          {version.isActive && (
            <span className="shrink-0 rounded-full border border-border px-1.5 py-0.5 text-[10px] tracking-wide">
              {copy.active}
            </span>
          )}
        </div>
        <div className="text-[11px] text-muted">
          {formatDate(version.activeFrom)} ·{" "}
          {copy.summary(version.lineCount, formatMoney(version.monthlyTotal))}
        </div>
        {version.note && (
          <div className="mt-0.5 text-[11px] text-muted">{version.note}</div>
        )}
      </div>

      <fetcher.Form method="post">
        <input type="hidden" name="intent" value="delete" />
        <input type="hidden" name="id" value={version.id} />
        <button
          type="submit"
          disabled={busy}
          className="rounded-md border border-border px-2 py-1.5 text-[12px] transition-colors hover:bg-surface-2 disabled:opacity-30"
        >
          {busy ? copy.deleting : copy.delete}
        </button>
      </fetcher.Form>
    </li>
  );
}
