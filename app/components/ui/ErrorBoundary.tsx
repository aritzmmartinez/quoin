import { PortfolioError } from "../portfolio/PortfolioError";
import { Card } from "./Card";

export function ErrorBoundary() {
  return (
    <Card>
      <PortfolioError onRetry={() => window.location.reload()} />
    </Card>
  );
}
