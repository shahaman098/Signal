import type { Contact, Invoice, SlipRisk } from "@signal/core";
import type { GeminiClient } from "./gemini.js";

export interface ChaseEmailInput {
  contact: Contact;
  invoice: Invoice;
  slipRisk?: SlipRisk;
  tone?: "friendly" | "firm";
  senderName?: string;
  companyName?: string;
}

export interface ChaseEmailDraft {
  subject: string;
  body: string;
  generatedBy: "gemini" | "template";
}

const DRAFT_SCHEMA = {
  type: "object",
  properties: {
    subject: { type: "string" },
    body: { type: "string" },
  },
  required: ["subject", "body"],
} as const;

/**
 * Drafts a payment-chase email. Chase emails are NOT a Xero object — they're
 * drafted here and sent by whatever outbound channel the app wires up. With a
 * Gemini key configured the model writes it; otherwise a deterministic template
 * keeps the endpoint working (and tests offline).
 */
export interface OwnerVoice {
  name: string;
  business: string;
  /** Free-text style hint, e.g. "warm but direct, no corporate filler". */
  style: string;
}

export class ChaseEmailDrafter {
  constructor(
    private readonly llm: GeminiClient,
    private readonly owner: OwnerVoice = { name: "Accounts", business: "our team", style: "" },
  ) {}

  async draft(input: ChaseEmailInput): Promise<ChaseEmailDraft> {
    // Owner voice: explicit input wins, otherwise the configured identity.
    const voiced: ChaseEmailInput = {
      senderName: this.owner.name,
      companyName: this.owner.business,
      ...input,
    };
    const styleLine = this.owner.style
      ? ` Write in the owner's voice: ${this.owner.style}.`
      : "";
    const text = await this.llm.complete({
      system:
        "You draft concise, professional accounts-receivable chase emails for a small business." +
        styleLine +
        ' Respond with a JSON object of string fields "subject" and "body".',
      prompt: this.buildPrompt(voiced),
      maxTokens: 700,
      jsonSchema: DRAFT_SCHEMA as unknown as Record<string, unknown>,
    });

    if (text) {
      try {
        const parsed = JSON.parse(text) as { subject: string; body: string };
        if (parsed.subject && parsed.body) {
          return { subject: parsed.subject, body: parsed.body, generatedBy: "gemini" };
        }
      } catch {
        // fall through to template on any parsing issue
      }
    }
    return this.template(voiced);
  }

  private buildPrompt(input: ChaseEmailInput): string {
    const { contact, invoice, slipRisk, tone = "friendly" } = input;
    return [
      `Write a ${tone} chase email.`,
      `Customer: ${contact.name}`,
      `Invoice: ${invoice.invoiceNumber ?? invoice.invoiceId}`,
      `Amount due: ${invoice.amountDue} ${invoice.currencyCode ?? ""}`.trim(),
      `Due date: ${invoice.dueDate}`,
      slipRisk ? `Days overdue: ${slipRisk.daysOverdue}` : "",
      slipRisk ? `Context: ${slipRisk.reasons.join("; ")}` : "",
      input.senderName ? `From: ${input.senderName}` : "",
      input.companyName ? `Company: ${input.companyName}` : "",
      "Keep it under 150 words. Include a clear call to action to pay or get in touch.",
    ]
      .filter(Boolean)
      .join("\n");
  }

  private template(input: ChaseEmailInput): ChaseEmailDraft {
    const { contact, invoice, slipRisk } = input;
    const ref = invoice.invoiceNumber ?? invoice.invoiceId;
    const overdue = slipRisk ? ` (now ${slipRisk.daysOverdue} days overdue)` : "";
    const company = input.companyName ?? "our team";
    const sender = input.senderName ?? "Accounts";
    return {
      subject: `Reminder: invoice ${ref} — ${invoice.amountDue} ${invoice.currencyCode ?? ""}`.trim(),
      body: [
        `Hi ${contact.name},`,
        "",
        `This is a friendly reminder that invoice ${ref} for ${invoice.amountDue} ${
          invoice.currencyCode ?? ""
        }`.trim() + ` was due on ${invoice.dueDate}${overdue}.`,
        "",
        "If you've already sent payment, thank you and please ignore this note. " +
          "Otherwise, we'd appreciate settlement at your earliest convenience, or a quick reply if anything's holding it up.",
        "",
        "Many thanks,",
        `${sender}, ${company}`,
      ].join("\n"),
      generatedBy: "template",
    };
  }
}
