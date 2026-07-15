import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Poppins } from "next/font/google";
import { Nav } from "./nav";
import "./globals.css";

const poppins = Poppins({ subsets: ["latin"], weight: ["400", "500", "600", "700"] });

export const metadata: Metadata = {
  title: "Signal — Creative Intelligence",
  description: "Live creative intelligence over the upstream ad-radar backend, with Qwen-driven analysis.",
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
                <div className="brand-tag">Creative intelligence</div>
              </div>
            </div>
            <Nav />
            <div className="sidebar-foot">Creative radar · live backend</div>
          </aside>
          <main className="content">
            <div className="content-inner">{children}</div>
          </main>
        </div>
      </body>
    </html>
  );
}
