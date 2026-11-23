import { useFetcher } from "react-router";

import { RESIDENCES, type Residence } from "~/core/domain";
import { useCopy } from "~/lib";

import { Select } from "../ui/Select";

export function ResidenceSetting({ residence }: { residence: Residence }) {
  const copy = useCopy().settings.tax.residence;
  const fetcher = useFetcher();
  const pending = fetcher.formData?.get("residence");
  const value = typeof pending === "string" ? pending : residence;

  return (
    <Select
      label={copy.label}
      value={value}
      disabled={fetcher.state !== "idle"}
      onChange={(next) =>
        fetcher.submit({ intent: "residence", residence: next }, { method: "post" })
      }
      options={RESIDENCES.map((key) => ({
        value: key,
        label: copy.options[key].label,
        desc: copy.options[key].desc,
      }))}
    />
  );
}
