import { useRouteLoaderData } from "react-router";

export interface Zones {
  calendarZone: string;
  displayZone: string;
}

export function useZones(): Zones {
  const root = useRouteLoaderData("root") as Partial<Zones> | undefined;
  if (!root?.calendarZone || !root.displayZone) {
    throw new Error("The root loader resolved no zones");
  }
  return { calendarZone: root.calendarZone, displayZone: root.displayZone };
}
