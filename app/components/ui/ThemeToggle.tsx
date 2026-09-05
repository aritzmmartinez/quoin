import { Moon, Sun } from "lucide-react";
import { useState } from "react";
import { useRouteLoaderData } from "react-router";

import { es } from "~/lib";
import { Button } from "./Button";

const COOKIE = "quoin-theme";
const ONE_YEAR = 60 * 60 * 24 * 365;

type RootData = { theme?: "light" | "dark" };

export function ThemeToggle() {
  const root = useRouteLoaderData("root") as RootData | undefined;
  const [light, setLight] = useState(root?.theme === "light");

  function toggle() {
    const next = !light;
    const el = document.documentElement;
    el.classList.toggle("light", next);
    el.classList.toggle("dark", !next);
    document.cookie = `${COOKIE}=${next ? "light" : "dark"};path=/;max-age=${ONE_YEAR};samesite=lax`;
    setLight(next);
  }

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={toggle}
      aria-label={es.theme.toggle}
    >
      {light ? (
        <Sun size={18} strokeWidth={1.75} aria-hidden />
      ) : (
        <Moon size={18} strokeWidth={1.75} aria-hidden />
      )}
    </Button>
  );
}
