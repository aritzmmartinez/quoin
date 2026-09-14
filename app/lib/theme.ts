export type Theme = "dark" | "light" | "system";

export const THEME_COOKIE = "quoin-theme";
export const THEME_KEYS = ["dark", "light", "system"] as const;
export const DEFAULT_THEME: Theme = "dark";

export function parseTheme(cookieHeader: string | null): Theme {
  const value = new RegExp(`${THEME_COOKIE}=([a-z]+)`).exec(
    cookieHeader ?? "",
  )?.[1];
  return THEME_KEYS.includes(value as Theme) ? (value as Theme) : DEFAULT_THEME;
}

export function resolveTheme(
  theme: Theme,
  prefersLight: boolean,
): "dark" | "light" {
  if (theme === "system") return prefersLight ? "light" : "dark";
  return theme;
}

export const THEME_SCRIPT = `(function(){try{var m=document.cookie.match(/${THEME_COOKIE}=([a-z]+)/);var p=m?m[1]:"${DEFAULT_THEME}";var l=p==="light"||(p==="system"&&window.matchMedia("(prefers-color-scheme: light)").matches);document.documentElement.className=l?"light":"dark"}catch(e){}})()`;
