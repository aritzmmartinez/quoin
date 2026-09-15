import {
  isRouteErrorResponse,
  Link,
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  useRouteLoaderData,
} from "react-router";

import { SearchX, TriangleAlert } from "lucide-react";
import { Toaster } from "sonner";

import type { Route } from "./+types/root";
import { buttonClass } from "~/components/ui/Button";
import { ErrorState } from "~/components/ui/ErrorState";
import { parseBasis } from "~/lib/basis";
import { useCopy } from "~/lib/i18n";
import { parseLocale } from "~/lib/locale";
import { parseTheme, resolveTheme, THEME_SCRIPT } from "~/lib/theme";
import "./app.css";

export const links: Route.LinksFunction = () => [
  { rel: "preconnect", href: "https://fonts.googleapis.com" },
  {
    rel: "preconnect",
    href: "https://fonts.gstatic.com",
    crossOrigin: "anonymous",
  },
  {
    rel: "stylesheet",
    href: "https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700&family=Geist+Mono:wght@400;500;600;700&display=swap",
  },
];

export function loader({ request }: Route.LoaderArgs) {
  const cookie = request.headers.get("Cookie") ?? "";
  return {
    theme: parseTheme(cookie),
    basis: parseBasis(cookie),
    locale: parseLocale(cookie),
  };
}

export function Layout({ children }: { children: React.ReactNode }) {
  const data = useRouteLoaderData<typeof loader>("root");
  const theme = resolveTheme(data?.theme ?? "dark", false);
  const locale = data?.locale ?? "es";
  return (
    <html lang={locale} className={theme} suppressHydrationWarning>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
        <Meta />
        <Links />
      </head>
      <body>
        {children}
        <Toaster position="bottom-right" />
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
  const notFound = isRouteErrorResponse(error) && error.status === 404;
  const t = useCopy();
  const copy = notFound ? t.notFound : t.portfolio.error;

  return (
    <main>
      <ErrorState
        icon={notFound ? SearchX : TriangleAlert}
        tone={notFound ? "neutral" : "negative"}
        frame="viewport"
        title={copy.title}
        body={copy.body}
      >
        <Link to="/" className={buttonClass()}>
          {t.notFound.home}
        </Link>
      </ErrorState>
    </main>
  );
}
