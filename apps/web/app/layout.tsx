import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Poppins } from "next/font/google";
import { Nav } from "./nav";
import "./globals.css";

const poppins = Poppins({ subsets: ["latin"], weight: ["400", "500", "600", "700"] });

export const metadata: Metadata = {
  title: "Signal — Xero Intelligence",
  description:
    "Signals, company intelligence and human-approved actions over Xero, Companies House and financial news.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className={poppins.className}>
        <div className="shell">
          <aside className="sidebar">
            <div className="brand">
              <div className="brand-mark">S</div>
              <div>
                <div className="brand-name">Signal</div>
                <div className="brand-tag">Xero intelligence</div>
              </div>
            </div>
            <Nav />
            <div className="sidebar-foot">
              Xero · Companies House · Gazette · News
            </div>
          </aside>
          <main className="content">
            <div className="content-inner">{children}</div>
          </main>
        </div>
      </body>
    </html>
  );
}
