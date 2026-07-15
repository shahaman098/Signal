"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { House, Radar } from "./icons";

/**
 * Navigation mirrors the product’s surface area: creative intelligence first.
 */
const SECTIONS: { label?: string; links: { href: string; label: string; icon: React.ReactNode }[] }[] = [
  {
    links: [
      { href: "/", label: "Home", icon: <House size={16} /> },
      { href: "/creative", label: "Creative Radar", icon: <Radar size={16} /> },
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
