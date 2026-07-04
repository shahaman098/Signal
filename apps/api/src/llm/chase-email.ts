import Anthropic from "@anthropic-ai/sdk";
import type { Contact, Invoice, SlipRisk } from "@signal/core";

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
  generatedBy: "claude" | "template";
}

/**
 * Drafts a payment-chase email. Chase emails are NOT a Xero object — they're
 * drafted here and sent by whatever outbound channel the app wires up. When an
 * Anthropic API key is present we let Claude write it; otherwise we fall back to
 * a deterministic template so the endpoint always works (and tests stay offline).
 */
export class ChaseEmailDrafter {
  private client?: Anthropic;

  constructor(
    private readonly apiKey: string,
    private readonly model: string,
  ) {
    if (apiKey) this.client = new Anthropic({ apiKey });
  }

  async draft(input: ChaseEmailInput): Promise<ChaseEmailDraft> {
    if (!this.client) return this.template(input);

    const prompt = this.buildPrompt(input);
    const message = await this.client.messages.create({
      model: this.model,
      max_tokens: 700,
      system:
        "You draft concise, professional accounts-receivable chase emails for a small business. " +
        "Return ONLY a JSON object with string fields \"subject\" and \"body\". No markdown, no preamble.",
      messages: [{ role: "user", content: prompt }],
    });

    const text = message.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");

    try {
      const parsed = JSON.parse(text) as { subject: string; body: string };
      if (parsed.subject && parsed.body) {
        return { subject: parsed.subject, body: parsed.body, generatedBy: "claude" };
      }
    } catch {
      // fall through to template on any parsing issue
    }
    return this.template(input);
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
