import { describe, expect, it } from "vitest";
import { createProgram } from "../src/cli";

describe("cli program", () => {
  it("exposes a help text mentioning the command name", () => {
    const info = createProgram().helpInformation();
    expect(info).toMatch(/Usage: commitnow/);
    expect(info).toContain("git commit messages");
    expect(info).toContain("--echo");
  });

  it("reports the package version via --version", () => {
    const program = createProgram().exitOverride();
    let out = "";
    program.configureOutput({
      writeOut: (str) => {
        out += str;
      },
      writeErr: (str) => {
        out += str;
      },
    });
    expect(() => program.parse(["node", "commitnow", "--version"])).toThrow();
    expect(out.trim()).toMatch(/^\d+\.\d+\.\d+$/);
  });
});