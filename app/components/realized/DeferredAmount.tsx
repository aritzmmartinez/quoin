import { isBelowCent, useCopy, useFormat } from "~/lib";

import { SignedMoney } from "../SignedMoney";

export function DeferredAmount({ value }: { value: string }) {
  const { formatMoney } = useFormat();
  const copy = useCopy().realized.fiscal;
  if (!isBelowCent(value)) return <SignedMoney value={value} />;
  return (
    <span className="text-muted">{copy.belowCent(formatMoney("0.01"))}</span>
  );
}
