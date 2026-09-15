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

import type { Copy } from "~/lib";

export interface NavItem {
  label: string;
  icon: LucideIcon;
  to: string | null;
  end?: boolean;
}

export function navItems(t: Copy): readonly NavItem[] {
  return [
    { label: t.nav.overview, icon: LayoutDashboard, to: "/", end: true },
    { label: t.nav.portfolio, icon: Wallet, to: "/portfolio" },
    { label: t.nav.allocation, icon: PieChart, to: "/allocation" },
    { label: t.nav.movements, icon: ArrowLeftRight, to: "/movements" },
    { label: t.target.title, icon: Target, to: "/target" },
    { label: t.projection.title, icon: TrendingUp, to: "/projection" },
    { label: t.nav.instruments, icon: Boxes, to: "/instruments" },
  ];
}

export function navItemFor(
  t: Copy,
  parent: string | undefined,
): NavItem | undefined {
  return navItems(t).find((item) => item.to === parent);
}

export function systemItems(t: Copy): readonly NavItem[] {
  return [{ label: t.settings.title, icon: Settings, to: "/settings" }];
}

export interface NavGroup {
  title: string;
  items: readonly NavItem[];
}

export function navGroups(t: Copy): readonly NavGroup[] {
  const items = navItems(t);
  return [
    { title: t.nav.groups.portfolio, items: items.slice(0, 4) },
    { title: t.nav.groups.analysis, items: items.slice(4) },
  ];
}

export interface SubView {
  label: string;
  to: string;
}

export function summarySubviews(t: Copy): readonly SubView[] {
  return [
    { label: t.realized.title, to: "/realized" },
    { label: t.opportunity.title, to: "/opportunity-cost" },
    { label: t.ter.title, to: "/ter-cost" },
  ];
}
