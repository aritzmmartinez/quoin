import {
  ArrowLeftRight,
  Boxes,
  LayoutDashboard,
  PieChart,
  Wallet,
  type LucideIcon,
} from "lucide-react";

import { es } from "~/lib";

export interface NavItem {
  label: string;
  icon: LucideIcon;
  to: string | null;
  end?: boolean;
}

export const NAV_ITEMS: readonly NavItem[] = [
  { label: es.nav.overview, icon: LayoutDashboard, to: "/", end: true },
  { label: es.nav.portfolio, icon: Wallet, to: "/cartera" },
  { label: es.nav.allocation, icon: PieChart, to: "/asignacion" },
  { label: es.nav.movements, icon: ArrowLeftRight, to: "/movimientos" },
  { label: es.nav.instruments, icon: Boxes, to: "/instrumentos" },
];
