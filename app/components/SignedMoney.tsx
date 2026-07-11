import { formatSignedMoney, type MoneySign } from "~/lib";

const SIGN_CLASS: Record<MoneySign, string> = {
  positive: "text-positive",
  negative: "text-negative",
  zero: "text-muted",
};

export function SignedMoney({
  value,
  className = "",
}: {
  value: string;
  className?: string;
}) {
  const { text, sign } = formatSignedMoney(value);
  return <span className={`${SIGN_CLASS[sign]} ${className}`}>{text}</span>;
}
