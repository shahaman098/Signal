import { mkdir, readFile, readdir, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { ActionProposal } from "./proposal.service.js";

/**
 * One JSON file per proposal (same idiom as ContextStore) — human-inspectable,
 * diffable, and the approval audit trail survives restarts.
 */
export class ProposalStore {
  constructor(private readonly dir: string) {}

  private fileFor(id: string): string {
    return join(this.dir, `${id.replace(/[^a-zA-Z0-9_@-]/g, "_")}.json`);
  }

  async save(proposal: ActionProposal): Promise<void> {
    await mkdir(this.dir, { recursive: true });
    await writeFile(this.fileFor(proposal.id), JSON.stringify(proposal, null, 2), "utf8");
  }

  async load(id: string): Promise<ActionProposal | null> {
    try {
      return JSON.parse(await readFile(this.fileFor(id), "utf8")) as ActionProposal;
    } catch {
      return null;
    }
  }

  async loadAll(): Promise<ActionProposal[]> {
    try {
      const files = await readdir(this.dir);
      const out: ActionProposal[] = [];
      for (const f of files) {
        if (!f.endsWith(".json")) continue;
        try {
          out.push(JSON.parse(await readFile(join(this.dir, f), "utf8")) as ActionProposal);
        } catch {
          // skip corrupt files rather than failing the whole read
        }
      }
      return out;
    } catch {
      return [];
    }
  }

  async remove(id: string): Promise<void> {
    try {
      await unlink(this.fileFor(id));
    } catch {
      // already gone
    }
  }
}
