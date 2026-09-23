import { useState } from "react";

import {
  BENCHMARK_COOKIE,
  type BenchmarkCandidate,
  useCopy,
  useFormat,
  writePreferenceCookie,
} from "~/lib";

import { Select, type SelectOption } from "./Select";

export function BenchmarkSetting({
  benchmark,
  candidates,
}: {
  benchmark: string;
  candidates: readonly BenchmarkCandidate[];
}) {
  const t = useCopy();
  const copy = t.settings.portfolio.benchmark;
  const { formatDate } = useFormat();
  const [symbol, setSymbol] = useState(benchmark);

  const options: SelectOption[] = candidates.map((candidate) => ({
    value: candidate.symbol,
    label: candidate.symbol,
    desc: `${candidate.name} · ${copy.since(formatDate(candidate.since))}`,
  }));
  const usable = options.some((option) => option.value === symbol);
  if (!usable) {
    options.unshift({ value: symbol, label: symbol, desc: copy.unusable });
  }

  function select(next: string) {
    writePreferenceCookie(BENCHMARK_COOKIE, next);
    setSymbol(next);
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Select
        label={copy.label}
        value={symbol}
        options={options}
        searchPlaceholder={copy.search}
        onChange={select}
        disabled={candidates.length === 0}
      />
      {!usable && (
        <span className="max-w-60 text-right text-[11px] text-negative">
          {candidates.length === 0 ? copy.none : copy.unusable}
        </span>
      )}
    </div>
  );
}
