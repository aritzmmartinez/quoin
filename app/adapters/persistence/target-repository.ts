import { portfolioTargetSchema, type PortfolioTarget } from "~/core/domain";
import type { TargetRepository } from "~/core/ports";

import { prisma } from "./db.server";

export class PrismaTargetRepository implements TargetRepository {
  async list(): Promise<PortfolioTarget[]> {
    const rows = await prisma.portfolioTarget.findMany({
      include: { lines: { orderBy: { instrumentId: "asc" } } },
      orderBy: { activeFrom: "asc" },
    });

    return rows.map((row) =>
      portfolioTargetSchema.parse({
        id: row.id,
        name: row.name,
        activeFrom: row.activeFrom,
        note: row.note,
        createdAt: row.createdAt,
        lines: row.lines.map((line) => ({
          instrumentId: line.instrumentId,
          monthlyAmount: line.monthlyAmount,
        })),
      }),
    );
  }

  async create(target: PortfolioTarget): Promise<void> {
    await prisma.portfolioTarget.create({
      data: {
        id: target.id,
        name: target.name,
        activeFrom: target.activeFrom,
        note: target.note ?? null,
        lines: {
          create: target.lines.map((line) => ({
            instrumentId: line.instrumentId,
            monthlyAmount: line.monthlyAmount,
          })),
        },
      },
    });
  }

  async remove(id: string): Promise<void> {
    await prisma.portfolioTarget.delete({ where: { id } });
  }
}
