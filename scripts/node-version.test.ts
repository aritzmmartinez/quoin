import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function read(path: string): string {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

const major = read(".node-version").trim();

describe("Node major", () => {
  it("is a bare major in .node-version", () => {
    expect(major).toMatch(/^\d+$/);
  });

  it("is the major of every Dockerfile base image", () => {
    const bases = [...read("Dockerfile").matchAll(/^FROM node:(\d+)-/gm)].map(
      (match) => match[1],
    );
    expect(bases.length).toBeGreaterThan(0);
    expect(bases.every((base) => base === major)).toBe(true);
  });

  it("is the major of @types/node and the floor of engines.node", () => {
    const pkg = JSON.parse(read("package.json")) as {
      devDependencies: Record<string, string>;
      engines: Record<string, string>;
    };
    expect(pkg.devDependencies["@types/node"]).toMatch(
      new RegExp(`^\\^${major}\\.`),
    );
    expect(pkg.engines["node"]).toBe(`>=${major}`);
  });
});
