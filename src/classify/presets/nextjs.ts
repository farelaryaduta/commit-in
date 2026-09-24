import type { Rule } from "../rules";

/** Next.js-specific classification rules, checked before generic rules. */
export const nextjsRules: Rule[] = [
  { match: /(^|\/)app\/.*\/?(page|layout|loading|error|not-found)\.[jt]sx$/, category: "page" },
  { match: /(^|\/)route\.[jt]s$/, category: "route" },
  { match: /(^|\/)components\//, category: "component" },
  { match: /(^|\/)(lib|utils|services)\//, category: "service" },
  { match: /prisma\/schema\.prisma$|^prisma\/migrations\//, category: "migration" },
  { match: /(^|\/)middleware\.[jt]s$/, category: "config" },
];