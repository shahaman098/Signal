import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { CompanyContext } from "@signal/core";

/**
 * Persists one context JSON file per company under CONTEXT_DIR. This is the
 * "full company/purchaser information" document the agent reasons over:
 * Companies House data (with filing PDF links), financial news (with source
 * links), and identity/role metadata.
 *
 * File-per-company keeps it human-inspectable and trivially diffable. The
 * interface is narrow on purpose — swapping in GCS/Firestore later is a new
 * implementation of these three methods, nothing more.
 */
export class ContextStore {
  constructor(private readonly dir: string) {}

  private fileFor(contactId: string): string {
    // contactIds are our own slugs, but sanitise anyway.
    return join(this.dir, `${contactId.replace(/[^a-zA-Z0-9_-]/g, "_")}.json`);
  }

  async save(context: CompanyContext): Promise<void> {
    await mkdir(this.dir, { recursive: true });
    await writeFile(this.fileFor(context.contactId), JSON.stringify(context, null, 2), "utf8");
  }

  async load(contactId: string): Promise<CompanyContext | null> {
    try {
      return JSON.parse(await readFile(this.fileFor(contactId), "utf8")) as CompanyContext;
    } catch {
      return null;
    }
  }

  async loadAll(): Promise<CompanyContext[]> {
    try {
      const files = await readdir(this.dir);
      const out: CompanyContext[] = [];
      for (const f of files) {
        if (!f.endsWith(".json")) continue;
        try {
          out.push(JSON.parse(await readFile(join(this.dir, f), "utf8")) as CompanyContext);
        } catch {
          // skip corrupt files rather than failing the whole read
        }
      }
      return out;
    } catch {
      return []; // directory doesn't exist yet
    }
  }
}
