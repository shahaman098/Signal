"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Banknote, Building, Compass, FileText, House } from "./icons";

/**
 * Navigation mirrors the product's pipeline, top to bottom:
 * raw evidence → per-company intelligence → money workbench → decisions.
 */
const SECTIONS: { label?: string; links: { href: string; label: string; icon: React.ReactNode }[] }[] = [
  {
    links: [{ href: "/", label: "Overview", icon: <House size={16} /> }],
  },
  {
    label: "Intelligence",
    links: [
      { href: "/sources", label: "Sources", icon: <FileText size={16} /> },
      { href: "/companies", label: "Companies", icon: <Building size={16} /> },
    ],
  },
  {
    label: "Action",
    links: [
      { href: "/receivables", label: "Receivables", icon: <Banknote size={16} /> },
      { href: "/plan", label: "Plan", icon: <Compass size={16} /> },
    ],
  },
];

export function Nav() {
  const pathname = usePathname();
  return (
    <nav style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      {SECTIONS.map((section, si) => (
        <div key={si} style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          {section.label && <div className="nav-label">{section.label}</div>}
          {section.links.map((l) => {
            const active = l.href === "/" ? pathname === "/" : pathname.startsWith(l.href);
            return (
              <Link key={l.href} href={l.href} className={`nav-link${active ? " active" : ""}`}>
                {l.icon} {l.label}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}
