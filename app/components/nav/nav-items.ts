import {
  ArrowLeftRight,
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
  { label: es.nav.overview, icon: LayoutDashboard, to: null },
  { label: es.nav.portfolio, icon: Wallet, to: "/", end: true },
  { label: es.nav.allocation, icon: PieChart, to: null },
  { label: es.nav.movements, icon: ArrowLeftRight, to: null },
];
