"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  LayoutDashboard, TrendingUp, Upload, Key, BarChart2,
  FileText, Shield, LogOut, Heart, Clock, Briefcase, GitBranch,
  Menu, X,
} from "lucide-react";

const NAV = [
  { href: "/dashboard",                label: "Overview",      icon: LayoutDashboard },
  { href: "/dashboard/health-score",   label: "Health Score",  icon: Heart           },
  { href: "/dashboard/what-if",        label: "What-if",       icon: Clock           },
  { href: "/dashboard/holdings",       label: "Holdings",      icon: Briefcase       },
  { href: "/dashboard/pipeline",       label: "Test Pipeline", icon: GitBranch       },
  { href: "/dashboard/portfolio",      label: "Analytics",     icon: TrendingUp      },
  { href: "/dashboard/ingest",         label: "Import Data",   icon: Upload          },
  { href: "/dashboard/ledger",         label: "Ledger",        icon: Shield          },
  { href: "/dashboard/api-keys",       label: "API Keys",      icon: Key             },
  { href: "/dashboard/usage",          label: "Usage",         icon: BarChart2       },
  { href: "/dashboard/audit",          label: "Audit Log",     icon: FileText        },
];

function NavLinks({ pathname, onNavigate }: { pathname: string; onNavigate?: () => void }) {
  return (
    <nav className="flex-1 space-y-0.5 overflow-y-auto">
      {NAV.map(({ href, label, icon: Icon }) => {
        const active = pathname === href || (href !== "/dashboard" && pathname.startsWith(href));
        return (
          <Link
            key={href}
            href={href}
            onClick={onNavigate}
            className={`flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm transition-colors ${
              active
                ? "bg-accent/15 text-accent font-medium"
                : "text-muted hover:text-white hover:bg-white/5"
            }`}
          >
            <Icon size={16} className="shrink-0" />
            <span className="truncate">{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

export default function Sidebar({ email }: { email: string }) {
  const pathname  = usePathname();
  const router    = useRouter();
  const supabase  = createClient();
  const [open, setOpen] = useState(false);

  async function signOut() {
    await supabase.auth.signOut();
    router.push("/");
    router.refresh();
  }

  const brand = (
    <div className="flex items-center gap-2.5 px-2 mb-7 shrink-0">
      <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-accent shrink-0">
        <svg viewBox="0 0 24 24" fill="none" className="w-4 h-4 text-white" stroke="currentColor" strokeWidth={2.5}>
          <path d="M3 3v18h18" /><path d="m7 16 4-4 4 4 5-5" />
        </svg>
      </div>
      <span className="font-semibold text-white text-sm">Vestara</span>
    </div>
  );

  const footer = (signOutFn: () => void) => (
    <div className="border-t border-border pt-3 mt-3 shrink-0">
      <p className="text-xs text-muted px-2 mb-2 truncate">{email}</p>
      <button
        onClick={signOutFn}
        className="flex items-center gap-2.5 w-full px-2.5 py-2 rounded-lg text-sm text-muted hover:text-white hover:bg-white/5 transition-colors"
      >
        <LogOut size={16} className="shrink-0" />
        Sign out
      </button>
    </div>
  );

  return (
    <>
      {/* ── Mobile top bar ───────────────────────────────────────────────── */}
      <div className="lg:hidden fixed top-0 left-0 right-0 z-30 flex items-center gap-3 bg-card border-b border-border px-4 h-14 shrink-0">
        <button
          onClick={() => setOpen(true)}
          className="p-1.5 rounded-lg text-muted hover:text-white hover:bg-white/5 transition-colors"
        >
          <Menu size={20} />
        </button>
        <div className="flex items-center gap-2">
          <div className="flex items-center justify-center w-6 h-6 rounded bg-accent">
            <svg viewBox="0 0 24 24" fill="none" className="w-3 h-3 text-white" stroke="currentColor" strokeWidth={2.5}>
              <path d="M3 3v18h18" /><path d="m7 16 4-4 4 4 5-5" />
            </svg>
          </div>
          <span className="font-semibold text-white text-sm">Vestara</span>
        </div>
      </div>

      {/* ── Mobile drawer overlay ────────────────────────────────────────── */}
      {open && (
        <div
          className="lg:hidden fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
          onClick={() => setOpen(false)}
        />
      )}

      {/* ── Mobile drawer ───────────────────────────────────────────────── */}
      <aside className={`
        lg:hidden fixed top-0 left-0 z-50 h-full w-64 bg-card border-r border-border
        flex flex-col px-3 py-4 transition-transform duration-200
        ${open ? "translate-x-0" : "-translate-x-full"}
      `}>
        <div className="flex items-center justify-between mb-4 shrink-0">
          {brand}
          <button
            onClick={() => setOpen(false)}
            className="p-1.5 rounded-lg text-muted hover:text-white hover:bg-white/5 transition-colors"
          >
            <X size={18} />
          </button>
        </div>
        <NavLinks pathname={pathname} onNavigate={() => setOpen(false)} />
        {footer(signOut)}
      </aside>

      {/* ── Desktop sidebar ──────────────────────────────────────────────── */}
      <aside className="hidden lg:flex flex-col w-56 min-h-screen bg-card border-r border-border px-3 py-4 shrink-0">
        {brand}
        <NavLinks pathname={pathname} />
        {footer(signOut)}
      </aside>
    </>
  );
}
