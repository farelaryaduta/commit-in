import { describe, expect, it } from "vitest";
import {
  inferScopeFromPath,
  pickScope,
  reconcileWithKnownScopes,
} from "../../src/classify/scope";

describe("inferScopeFromPath", () => {
  it("strips class suffixes from Laravel classes", () => {
    expect(inferScopeFromPath("app/Http/Controllers/TaskController.php", "controller")).toBe("task");
    expect(inferScopeFromPath("app/Services/OrderService.php", "service")).toBe("order");
  });

  it("derives scope from models", () => {
    expect(inferScopeFromPath("app/Models/Task.php", "model")).toBe("task");
  });

  it("derives scope from create_*_table migrations", () => {
    expect(
      inferScopeFromPath("database/migrations/2026_09_24_create_tasks_table.php", "migration"),
    ).toBe("tasks");
  });

  it("ignores route groups and dynamic segments in Next.js pages", () => {
    expect(
      inferScopeFromPath("app/(store)/checkout/page.tsx", "page"),
    ).toBe("checkout");
    expect(
      inferScopeFromPath("app/blog/[slug]/page.tsx", "page"),
    ).toBe("blog");
    expect(
      inferScopeFromPath("app/page.tsx", "page"),
    ).toBeUndefined();
  });

  it("uses the first meaningful directory below a source root", () => {
    expect(inferScopeFromPath("src/orders/create.ts", "source")).toBe("orders");
    expect(inferScopeFromPath("app/api/route.ts", "route")).toBe("api");
  });

  it("uses the top-level directory when not under a known source root", () => {
    expect(inferScopeFromPath("widgets/gauge.ts", "source")).toBe("widgets");
  });

  it("returns undefined for files with no directory", () => {
    expect(inferScopeFromPath("README.md", "docs")).toBeUndefined();
  });
});

describe("pickScope", () => {
  it("picks the most frequent candidate", () => {
    expect(
      pickScope(["task", "tasks", "task", undefined]),
    ).toBe("task");
  });

  it("returns undefined on a tie", () => {
    expect(pickScope(["task", "tasks", "task", "tasks"])).toBeUndefined();
  });

  it("returns undefined when there are no candidates", () => {
    expect(pickScope([undefined, undefined])).toBeUndefined();
  });
});

describe("reconcileWithKnownScopes", () => {
  it("prefers the known spelling when it matches or contains the candidate", () => {
    expect(
      reconcileWithKnownScopes("task", ["auth", "tasks", "billing"]),
    ).toBe("tasks");
    expect(reconcileWithKnownScopes("checkout", ["Checkout"])).toBe("Checkout");
  });

  it("keeps the candidate when nothing known relates", () => {
    expect(reconcileWithKnownScopes("orders", ["auth"])).toBe("orders");
    expect(reconcileWithKnownScopes(undefined, ["auth"])).toBeUndefined();
  });
});