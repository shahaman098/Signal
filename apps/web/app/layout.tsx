import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Signal — Xero Receivables Intelligence",
  description: "Payment patterns, slip-risk, recoverable value and churn signals from Xero.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          fontFamily: "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
          background: "#0b0d12",
          color: "#e7e9ee",
        }}
      >
        <div style={{ maxWidth: 1100, margin: "0 auto", padding: "32px 24px" }}>{children}</div>
      </body>
    </html>
  );
}
