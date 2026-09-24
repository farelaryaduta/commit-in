import { describe, expect, it } from "vitest";
import {
  fallbackCategory,
  matchGeneric,
  matchPreset,
} from "../../src/classify/rules";
import { laravelRules } from "../../src/classify/presets/laravel";
import { nextjsRules } from "../../src/classify/presets/nextjs";

describe("generic rules", () => {
  it("classifies docs", () => {
    expect(matchGeneric("README.md")?.category).toBe("docs");
    expect(matchGeneric("docs/api.md")?.category).toBe("docs");
    expect(matchGeneric("guide.txt")?.category).toBe("docs");
  });

  it("classifies tests", () => {
    expect(matchGeneric("foo.test.ts")?.category).toBe("test");
    expect(matchGeneric("foo.spec.jsx")?.category).toBe("test");
    expect(matchGeneric("tests/foo.ts")?.category).toBe("test");
    expect(matchGeneric("__tests__/foo.tsx")?.category).toBe("test");
  });

  it("classifies dependency manifests and locks", () => {
    expect(matchGeneric("package.json")?.category).toBe("deps");
    expect(matchGeneric("composer.json")?.category).toBe("deps");
    expect(matchGeneric("package-lock.json")?.category).toBe("deps");
    expect(matchGeneric("pnpm-lock.yaml")?.category).toBe("deps");
    expect(matchGeneric("package.json")?.typeHint).toBe("chore");
  });

  it("classifies CI files", () => {
    expect(matchGeneric(".github/workflows/deploy.yml")?.category).toBe("ci");
    expect(matchGeneric(".gitlab-ci.yml")?.category).toBe("ci");
  });

  it("classifies Dockerfiles as build-coupled config", () => {
    expect(matchGeneric("Dockerfile")?.category).toBe("config");
    expect(matchGeneric("Dockerfile")?.typeHint).toBe("build");
    expect(matchGeneric("docker-compose.yml")?.category).toBe("config");
  });

  it("classifies styles, assets, and config files", () => {
    expect(matchGeneric("app.css")?.category).toBe("style");
    expect(matchGeneric("public/logo.svg")?.category).toBe("asset");
    expect(matchGeneric("tsconfig.json")?.category).toBe("config");
    expect(matchGeneric("vite.config.ts")?.category).toBe("config");
    expect(matchGeneric(".prettierrc")?.category).toBe("config");
    expect(matchGeneric("tailwind.config.js")?.category).toBe("config");
  });

  it("falls back to source or other", () => {
    expect(matchGeneric("src/order.ts")).toBeNull();
    expect(fallbackCategory("src/order.ts")).toBe("source");
    expect(fallbackCategory("src/frog.weird")).toBe("other");
  });
});

describe("laravel preset", () => {
  it("classifies controllers, models, migrations, routes, views, services", () => {
    expect(matchPreset("app/Http/Controllers/TaskController.php", laravelRules)?.category).toBe("controller");
    expect(matchPreset("app/Models/Task.php", laravelRules)?.category).toBe("model");
    expect(matchPreset("database/migrations/2026_create_tasks_table.php", laravelRules)?.category).toBe("migration");
    expect(matchPreset("routes/web.php", laravelRules)?.category).toBe("route");
    expect(matchPreset("resources/views/tasks/index.blade.php", laravelRules)?.category).toBe("view");
    expect(matchPreset("app/Services/OrderService.php", laravelRules)?.category).toBe("service");
    expect(matchPreset("database/seeders/TaskSeeder.php", laravelRules)?.category).toBe("model");
    expect(matchPreset("tests/Feature/TaskTest.php", laravelRules)?.category).toBe("test");
  });
});

describe("nextjs preset", () => {
  it("classifies pages, routes, components, services, migrations, middleware", () => {
    expect(matchPreset("app/(store)/checkout/page.tsx", nextjsRules)?.category).toBe("page");
    expect(matchPreset("app/api/route.ts", nextjsRules)?.category).toBe("route");
    expect(matchPreset("components/Button.tsx", nextjsRules)?.category).toBe("component");
    expect(matchPreset("lib/api/client.ts", nextjsRules)?.category).toBe("service");
    expect(matchPreset("prisma/schema.prisma", nextjsRules)?.category).toBe("migration");
    expect(matchPreset("middleware.ts", nextjsRules)?.category).toBe("config");
  });
});