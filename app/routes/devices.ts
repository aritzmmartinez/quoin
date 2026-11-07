import { devicesAction, pollDevices } from "~/lib/sync-devices.server";

import type { Route } from "./+types/devices";

export async function loader(_: Route.LoaderArgs) {
  return Response.json(await pollDevices());
}

export async function action({ request }: Route.ActionArgs) {
  return Response.json(await devicesAction(request));
}
