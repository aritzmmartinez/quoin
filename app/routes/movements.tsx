import { useNavigation } from "react-router";

import type { Route } from "./+types/movements";

import {
  PrismaInstrumentRepository,
  PrismaLedgerRepository,
} from "~/adapters/persistence";
import { Card, MovementsTable } from "~/components";
import {
  type Copy,
  copyFromMatches,
  netCashFlow,
  paginate,
  parsePage,
  toMovementRows,
  useCopy,
  useFormat,
} from "~/lib";

export function meta({ matches }: Route.MetaArgs) {
  const t = copyFromMatches(matches);
  return [
    { title: t.meta.movements.title },
    { name: "description", content: t.meta.movements.description },
  ];
}

export const handle = { title: (t: Copy) => t.movements.title };

export async function loader({ request }: Route.LoaderArgs) {
  const page = parsePage(new URL(request.url).searchParams);

  const [events, instruments] = await Promise.all([
    new PrismaLedgerRepository().list(),
    new PrismaInstrumentRepository().list(),
  ]);

  const all = toMovementRows(events, instruments);
  const { items, info } = paginate(all, page);

  return {
    rows: items,
    info,
    net: netCashFlow(all),
  };
}

export default function Movements({ loaderData }: Route.ComponentProps) {
  const { formatMoney } = useFormat();
  const t = useCopy();
  const { rows, info, net } = loaderData;
  const navigation = useNavigation();
  const busy = navigation.state === "loading";

  return (
    <>
      <header className="mb-4">
        {info.total > 0 && (
          <>
            <span className="text-[13px] text-muted">
              {t.movements.summary(info.total, formatMoney(net))}
            </span>
            <p className="mt-1 text-[12px] text-muted">
              {t.movements.amountHint}
            </p>
          </>
        )}
      </header>

      <Card
        className={`overflow-hidden transition-opacity ${busy ? "opacity-60" : ""}`}
      >
        {info.total === 0 ? (
          <div className="px-6 py-16 text-center">
            <div className="text-[15px] font-semibold">
              {t.movements.emptyScreen.title}
            </div>
            <p className="mx-auto mt-1.5 max-w-sm text-[13px] text-muted">
              {t.movements.emptyScreen.body}
            </p>
          </div>
        ) : (
          <MovementsTable rows={rows} info={info} />
        )}
      </Card>
    </>
  );
}

export { ErrorBoundary } from "~/components/ui/ErrorBoundary";
