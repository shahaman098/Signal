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
            <div className="rail-brand" aria-label="Signal">
              <span />
              <span />
            </div>
            <Nav />
          </aside>
          <div className="workspace-shell">
            <main className="content">
              <div className="content-inner">{children}</div>
            </main>
          </div>
        </div>
      </body>
    </html>
  );
}
