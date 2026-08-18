import { useFetcher } from "react-router";

import { es } from "~/lib";

const FIELD =
  "w-full rounded-md border border-border bg-surface px-2 py-1.5 text-[13px]";

export function TargetForm({ defaultLines = "" }: { defaultLines?: string }) {
  const copy = es.target.form;
  const fetcher = useFetcher<{ ok: boolean; error?: string }>();
  const busy = fetcher.state !== "idle";
  const error = fetcher.data?.ok === false ? fetcher.data.error : undefined;

  return (
    <fetcher.Form method="post" className="grid gap-3 px-5 py-4">
      <input type="hidden" name="intent" value="create" />

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1 text-[12px] text-muted">
          {copy.name}
          <input
            name="name"
            required
            placeholder={copy.namePlaceholder}
            className={FIELD}
          />
        </label>

        <label className="grid gap-1 text-[12px] text-muted">
          {copy.activeFrom}
          <input type="date" name="activeFrom" required className={FIELD} />
        </label>
      </div>

      <label className="grid gap-1 text-[12px] text-muted">
        {copy.note}
        <input
          name="note"
          placeholder={copy.notePlaceholder}
          className={FIELD}
        />
      </label>

      <label className="grid gap-1 text-[12px] text-muted">
        {copy.lines}
        <textarea
          name="lines"
          required
          rows={6}
          defaultValue={defaultLines}
          placeholder={copy.linesPlaceholder}
          className={`${FIELD} font-mono`}
        />
        <span className="text-[11px]">{copy.linesHint}</span>
      </label>

      {error && <p className="text-[12px] text-negative">{error}</p>}

      <div>
        <button
          type="submit"
          disabled={busy}
          className="rounded-md border border-border px-3 py-1.5 text-[12px] transition-colors hover:bg-surface-2 disabled:opacity-30"
        >
          {busy ? copy.saving : copy.submit}
        </button>
      </div>
    </fetcher.Form>
  );
}
