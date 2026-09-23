import { useState } from "react";
import { useRouteLoaderData } from "react-router";

import {
  resolveTheme,
  type Theme,
  THEME_COOKIE,
  THEME_KEYS,
  useCopy,
  writePreferenceCookie,
} from "~/lib";

import { SegmentedButtons } from "./Segmented";

type RootData = { theme?: Theme };

export function ThemeSetting() {
  const t = useCopy();
  const labels: Record<Theme, string> = {
    dark: t.theme.dark,
    light: t.theme.light,
    system: t.theme.system,
  };
  const root = useRouteLoaderData("root") as RootData | undefined;
  const [theme, setTheme] = useState<Theme>(root?.theme ?? "dark");

  function select(next: Theme) {
    const prefersLight = window.matchMedia(
      "(prefers-color-scheme: light)",
    ).matches;
    const resolved = resolveTheme(next, prefersLight);
    document.documentElement.className = resolved;
    writePreferenceCookie(THEME_COOKIE, next);
    setTheme(next);
  }

  return (
    <SegmentedButtons
      label={t.theme.label}
      value={theme}
      onSelect={select}
      segments={THEME_KEYS.map((key) => ({ key, label: labels[key] }))}
    />
  );
}
