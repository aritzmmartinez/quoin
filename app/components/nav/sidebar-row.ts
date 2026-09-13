export const FOLD = "duration-[250ms] ease-[cubic-bezier(0.2,0.8,0.2,1)]";

export function sidebarRow(collapsed: boolean): string {
  return [
    "relative flex h-9 items-center gap-3 whitespace-nowrap rounded-md pr-2",
    "text-[13px] font-medium transition-[padding-left,background-color,color]",
    FOLD,
    collapsed ? "pl-3" : "pl-2",
  ].join(" ");
}
