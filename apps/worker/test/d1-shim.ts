/** Just enough of the D1 API over node:sqlite to run the worker's real SQL in vitest. */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { SQLInputValue } from "node:sqlite";
import type { D1Database } from "@cloudflare/workers-types";

class Statement {
  constructor(
    private readonly db: DatabaseSync,
    readonly sql: string,
    readonly params: SQLInputValue[] = [],
  ) {}
  bind(...params: unknown[]) {
    return new Statement(this.db, this.sql, params as SQLInputValue[]);
  }
  async all<T>() {
    return { results: this.db.prepare(this.sql).all(...this.params) as T[], success: true, meta: {} };
  }
  async first<T>(column?: string) {
    const row = this.db.prepare(this.sql).get(...this.params) as Record<string, unknown> | undefined;
    if (!row) return null;
    return (column ? row[column] : row) as T;
  }
  async run() {
    const r = this.db.prepare(this.sql).run(...this.params);
    return { results: [], success: true, meta: { changes: Number(r.changes) } };
  }
}

export class FakeD1 {
  readonly sqlite = new DatabaseSync(":memory:");
  /** `schemaPath` is one .sql file, or a migrations directory applied in name order. */
  constructor(schemaPath: string) {
    const files = statSync(schemaPath).isDirectory()
      ? readdirSync(schemaPath).filter((f) => f.endsWith(".sql")).sort().map((f) => join(schemaPath, f))
      : [schemaPath];
    for (const f of files) this.sqlite.exec(readFileSync(f, "utf8"));
  }
  prepare(sql: string) {
    return new Statement(this.sqlite, sql);
  }
  async batch(statements: Statement[]) {
    this.sqlite.exec("BEGIN");
    try {
      const out = [];
      for (const s of statements) out.push(await s.all());
      this.sqlite.exec("COMMIT");
      return out;
    } catch (err) {
      this.sqlite.exec("ROLLBACK");
      throw err;
    }
  }
  asD1(): D1Database {
    return this as unknown as D1Database;
  }
}
