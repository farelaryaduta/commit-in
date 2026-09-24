import * as clack from "@clack/prompts";

/** Cancel/exit-on-escape signal thrown by prompts. */
export class CancelError extends Error {
  constructor() {
    super("cancelled by user");
    this.name = "CancelError";
  }
}

export interface SelectOption<T extends string> {
  value: T;
  label: string;
  hint?: string;
}

/** Injectable interactive interface, satisfied by clack in production. */
export interface Prompts {
  select<T extends string>(opts: {
    message: string;
    options: SelectOption<T>[];
  }): Promise<T>;
  text(opts: {
    message: string;
    initialValue?: string;
    placeholder?: string;
  }): Promise<string | undefined>;
  confirm(opts: { message: string; initialValue?: boolean }): Promise<boolean>;
  multiselect<T extends string>(opts: {
    message: string;
    options: SelectOption<T>[];
    initialValues?: T[];
  }): Promise<T[]>;
}

/** Production prompts backed by @clack/prompts. */
export const clackPrompts: Prompts = {
  async select<T extends string>(opts: {
    message: string;
    options: SelectOption<T>[];
  }): Promise<T> {
    const options = opts.options.map((o) => ({
      value: o.value,
      label: o.label,
      hint: o.hint,
    })) as clack.Option<string>[];
    const picked = await clack.select({
      message: opts.message,
      options: options as never,
    });
    if (clack.isCancel(picked)) throw new CancelError();
    return picked as unknown as T;
  },
  async text(opts) {
    const result = await clack.text({
      message: opts.message,
      initialValue: opts.initialValue,
      placeholder: opts.placeholder,
    });
    if (clack.isCancel(result)) throw new CancelError();
    return result === "" ? undefined : result;
  },
  async confirm(opts) {
    const result = await clack.confirm({
      message: opts.message,
      initialValue: opts.initialValue,
    });
    if (clack.isCancel(result)) throw new CancelError();
    return result;
  },
  async multiselect<T extends string>(opts: {
    message: string;
    options: SelectOption<T>[];
    initialValues?: T[];
  }): Promise<T[]> {
    const options = opts.options.map((o) => ({
      value: o.value,
      label: o.label,
      hint: o.hint,
    })) as clack.Option<string>[];
    const result = await clack.multiselect({
      message: opts.message,
      options: options as never,
      initialValues: opts.initialValues as string[] | undefined,
    });
    if (clack.isCancel(result)) throw new CancelError();
    return result as unknown as T[];
  },
};

/** Scripted prompts for tests: answers are popped from a queue. */
export class ScriptedPrompts implements Prompts {
  private queue: Array<string | string[] | boolean> = [];

  /** Push answers in call order: string (select), string|undefined (text), boolean (confirm), string[] (multiselect). */
  with(...answers: Array<string | string[] | boolean | undefined>): this {
    for (const a of answers) if (a !== undefined) this.queue.push(a);
    return this;
  }

  private next(expected: string): string | string[] | boolean {
    const v = this.queue.shift();
    if (v === undefined) {
      throw new CancelError();
    }
    if (expected === "select" && (typeof v === "string" || Array.isArray(v))) return v;
    if (expected === "confirm" && typeof v === "boolean") return v;
    if (expected === "text" && typeof v === "string") return v;
    throw new CancelError();
  }

  async select<T extends string>(opts: {
    message: string;
    options: SelectOption<T>[];
  }): Promise<T> {
    const v = this.next("select") as string;
    const found = opts.options.find((o) => o.value === v);
    if (found) return found.value;
    return v as T;
  }

  async text(_opts: { message: string }): Promise<string | undefined> {
    return this.next("text") as string;
  }

  async confirm(_opts: { message: string; initialValue?: boolean }): Promise<boolean> {
    return this.next("confirm") as boolean;
  }

  async multiselect<T extends string>(opts: {
    message: string;
    options: SelectOption<T>[];
  }): Promise<T[]> {
    const v = this.next("multiselect") as string[];
    const values = v.filter((x) => opts.options.some((o) => o.value === x));
    return values as T[];
  }
}