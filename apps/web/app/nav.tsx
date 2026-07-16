"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Bars, Cards, Chat, Gear, House, Radar, Wallet } from "./icons";

const PRIMARY_LINKS = [
  { hash: "#overview", label: "Home", icon: <House size={20} /> },
  { hash: "#operator", label: "Creative Radar", icon: <Radar size={20} /> },
];

const UTILITY_ICONS = [
  { hash: "#campaigns", label: "Monitoring", icon: <Bars size={20} /> },
  { hash: "#portfolio", label: "Canvas", icon: <Cards size={20} /> },
  { hash: "#operator", label: "Messages", icon: <Chat size={20} /> },
  { hash: "#pressure-board", label: "Funding", icon: <Wallet size={20} /> },
];

export function Nav() {
  const pathname = usePathname();
  const [hash, setHash] = useState("#overview");

  useEffect(() => {
    function syncHash() {
      setHash(window.location.hash || "#overview");
    }

    syncHash();
    window.addEventListener("hashchange", syncHash);
    return () => window.removeEventListener("hashchange", syncHash);
  }, [pathname]);

  function handleHashLink(nextHash: string) {
    if (pathname !== "/creative") return;
    setHash(nextHash);
    if (window.location.hash !== nextHash) {
      window.location.hash = nextHash;
    }

    const target = document.getElementById(nextHash.slice(1));
    if (!target) return;

    target.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <nav className="rail-nav">
      <div className="rail-group">
        {PRIMARY_LINKS.map((link) => {
          const active = pathname === "/creative" && hash === link.hash;
          return (
            <button
              key={link.label}
              type="button"
              className={`rail-link${active ? " active" : ""}`}
              aria-label={link.label}
              title={link.label}
              onClick={() => handleHashLink(link.hash)}
            >
              {link.icon}
            </button>
          );
        })}
      </div>

      <div className="rail-group rail-group-secondary">
        {UTILITY_ICONS.map((entry) => (
          <button
            key={entry.label}
            type="button"
            className={`rail-link rail-link-muted${pathname === "/creative" && hash === entry.hash ? " active" : ""}`}
            aria-label={entry.label}
            title={entry.label}
            onClick={() => handleHashLink(entry.hash)}
          >
            {entry.icon}
          </button>
        ))}
      </div>

      <div className="rail-spacer" />

      <button
        type="button"
        className={`rail-link rail-link-muted${pathname === "/creative" && hash === "#approval-gate" ? " active" : ""}`}
        aria-label="Settings"
        title="Settings"
        onClick={() => handleHashLink("#approval-gate")}
      >
        <Gear size={20} />
      </button>
    </nav>
  );
}
