import {
  ArrowLeftRight,
  Boxes,
  LayoutDashboard,
  PieChart,
  Settings,
  Target,
  TrendingUp,
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
  { label: es.target.title, icon: Target, to: "/objetivo" },
  { label: es.projection.title, icon: TrendingUp, to: "/proyeccion" },
  { label: es.nav.instruments, icon: Boxes, to: "/instrumentos" },
];

export function navItemFor(parent: string | undefined): NavItem | undefined {
  return NAV_ITEMS.find((item) => item.to === parent);
}

export const SYSTEM_ITEMS: readonly NavItem[] = [
  { label: es.settings.title, icon: Settings, to: "/ajustes" },
];

export interface NavGroup {
  title: string;
  items: readonly NavItem[];
}

export const NAV_GROUPS: readonly NavGroup[] = [
  { title: es.nav.groups.portfolio, items: NAV_ITEMS.slice(0, 4) },
  { title: es.nav.groups.analysis, items: NAV_ITEMS.slice(4) },
];

export interface SubView {
  label: string;
  to: string;
}

export const SUMMARY_SUBVIEWS: readonly SubView[] = [
  { label: es.realized.title, to: "/realizado" },
  { label: es.opportunity.title, to: "/coste-oportunidad" },
  { label: es.ter.title, to: "/coste-ter" },
];
