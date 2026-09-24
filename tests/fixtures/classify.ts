import type { StagedFile } from "../../src/types";

export function file(
  path: string,
  status: StagedFile["status"] = "A",
  added = 1,
  deleted = 0,
): StagedFile {
  return { path, status, added, deleted, binary: false };
}

/** New Laravel controller + model + migration + route change. */
export const laravelFeature: StagedFile[] = [
  file("app/Http/Controllers/TaskController.php", "A", 80, 0),
  file("app/Models/Task.php", "A", 20, 0),
  file("database/migrations/2026_09_24_create_tasks_table.php", "A", 30, 0),
  file("routes/web.php", "M", 2, 0),
];

/** Laravel migration only. */
export const laravelMigrationOnly: StagedFile[] = [
  file("database/migrations/2026_09_24_add_priority_to_tasks_table.php", "A", 15, 0),
];

/** Next.js page plus new component. */
export const nextjsFeature: StagedFile[] = [
  file("app/(store)/checkout/page.tsx", "A", 40, 0),
  file("components/CheckoutForm.tsx", "A", 60, 0),
];

/** Lockfile and manifest only. */
export const depsOnly: StagedFile[] = [
  file("package.json", "M", 1, 1),
  file("package-lock.json", "M", 30, 5),
];

/** Documentation only. */
export const docsOnly: StagedFile[] = [
  file("README.md", "M", 5, 2),
  file("docs/guide.md", "A", 10, 0),
];

/** Tests only. */
export const testsOnly: StagedFile[] = [
  file("tests/Feature/TaskTest.php", "A", 25, 0),
];

/** Mixed fix + refactor (existing source modified, no additions). */
export const mixedFixRefactor: StagedFile[] = [
  file("src/order.ts", "M", 6, 6),
  file("src/worker.ts", "M", 3, 3),
];

export const binaryFile: StagedFile[] = [
  file("assets/logo.png", "A", 0, 0),
];