import type { Rule } from "../rules";

/** Laravel-specific classification rules, checked before generic rules. */
export const laravelRules: Rule[] = [
  { match: /^app\/Http\/Controllers\//, category: "controller" },
  { match: /^app\/Models\//, category: "model" },
  { match: /^database\/migrations\//, category: "migration" },
  { match: /^database\/(seeders|factories)\//, category: "model" },
  { match: /^routes\//, category: "route" },
  { match: /^resources\/views\//, category: "view" },
  { match: /^app\/(Services|Actions)\//, category: "service" },
  { match: /^config\//, category: "config" },
  { match: /^tests\/(Feature|Unit)\//, category: "test" },
];