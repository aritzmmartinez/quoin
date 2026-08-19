import {
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  useRouteLoaderData,
} from "react-router";

import type { Route } from "./+types/root";
import { parseBasis } from "~/lib/basis";
import "./app.css";

type Theme = "light" | "dark";

export const links: Route.LinksFunction = () => [
  { rel: "preconnect", href: "https://fonts.googleapis.com" },
  {
    rel: "preconnect",
    href: "https://fonts.gstatic.com",
    crossOrigin: "anonymous",
  },
  {
    rel: "stylesheet",
    href: "https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700&display=swap",
  },
];

export function loader({ request }: Route.LoaderArgs) {
  const cookie = request.headers.get("Cookie") ?? "";
  const theme: Theme = cookie.includes("quoin-theme=light") ? "light" : "dark";
  return { theme, basis: parseBasis(cookie) };
}

export function Layout({ children }: { children: React.ReactNode }) {
  const data = useRouteLoaderData<typeof loader>("root");
  const theme: Theme = data?.theme ?? "dark";
  return (
    <html lang="es" className={theme}>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <Meta />
        <Links />
      </head>
      <body>
        {children}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export default function App() {
  return <Outlet />;
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  let message = "Error";
  let details = "An unexpected error occurred.";
  if (error && typeof error === "object" && "status" in error) {
    message = (error as { status: number }).status === 404 ? "404" : "Error";
    details =
      (error as { statusText?: string; data?: string }).statusText ||
      (error as { data?: string }).data ||
      details;
  }
  return (
    <main className="mx-auto max-w-md p-8">
      <h1 className="text-2xl font-semibold">{message}</h1>
      <p className="mt-2 text-muted">{details}</p>
    </main>
  );
}
