import type { PortfolioTarget } from "../domain";

export interface TargetRepository {
  list(): Promise<PortfolioTarget[]>;
  create(target: PortfolioTarget): Promise<void>;
  remove(id: string): Promise<void>;
}
