import { useState } from "react";
import { useRouteLoaderData } from "react-router";

import { es, resolveTheme, THEME_COOKIE, THEME_KEYS, type Theme } from "~/lib";

import { SegmentedButtons } from "./Segmented";

const ONE_YEAR = 60 * 60 * 24 * 365;

const LABELS: Record<Theme, string> = {
  dark: es.theme.dark,
  light: es.theme.light,
  system: es.theme.system,
};

type RootData = { theme?: Theme };

export function ThemeSetting() {
  const root = useRouteLoaderData("root") as RootData | undefined;
  const [theme, setTheme] = useState<Theme>(root?.theme ?? "dark");

  function select(next: Theme) {
    const prefersLight = window.matchMedia(
      "(prefers-color-scheme: light)",
    ).matches;
    const resolved = resolveTheme(next, prefersLight);
    document.documentElement.className = resolved;
    document.cookie = `${THEME_COOKIE}=${next};path=/;max-age=${ONE_YEAR};samesite=lax`;
    setTheme(next);
  }

  return (
    <SegmentedButtons
      label={es.theme.label}
      value={theme}
      onSelect={select}
      segments={THEME_KEYS.map((key) => ({ key, label: LABELS[key] }))}
    />
  );
}
