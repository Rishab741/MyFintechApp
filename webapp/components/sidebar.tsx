"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  LayoutDashboard, TrendingUp, Upload, Key, BarChart2,
  FileText, Shield, LogOut, Heart, Clock, Briefcase, GitBranch, Globe,
  Menu, Sigma, Smartphone, X, ChevronRight,
} from "lucide-react";

const NAV_GROUPS = [
  {
    label: "Analytics",
    items: [
      { href: "/dashboard",              label: "Overview",      icon: LayoutDashboard },
      { href: "/dashboard/markets",      label: "Alpha Screen",  icon: Globe           },
      { href: "/dashboard/health-score", label: "Health Score",  icon: Heart           },
      { href: "/dashboard/what-if",      label: "What-if",       icon: Clock           },
      { href: "/dashboard/simulate",     label: "Simulate",      icon: Sigma           },
    ],
  },
  {
    label: "Portfolio",
    items: [
      { href: "/dashboard/holdings",  label: "Holdings",  icon: Briefcase  },
      { href: "/dashboard/portfolio", label: "Analytics", icon: TrendingUp },
    ],
  },
  {
    label: "Tools",
    items: [
      { href: "/dashboard/sync",     label: "Mobile Sync",   icon: Smartphone },
      { href: "/dashboard/ingest",   label: "Import Data",   icon: Upload     },
      { href: "/dashboard/pipeline", label: "Test Pipeline", icon: GitBranch  },
    ],
  },
  {
    label: "Admin",
    items: [
      { href: "/dashboard/ledger",   label: "Ledger",    icon: Shield    },
      { href: "/dashboard/api-keys", label: "API Keys",  icon: Key       },
      { href: "/dashboard/usage",    label: "Usage",     icon: BarChart2 },
      { href: "/dashboard/audit",    label: "Audit Log", icon: FileText  },
    ],
  },
];

function initials(email: string) {
  return email.slice(0, 2).toUpperCase();
}

function NavContent({
  pathname,
  email,
  onNavigate,
  onSignOut,
}: {
  pathname: string;
  email: string;
  onNavigate?: () => void;
  onSignOut: () => void;
}) {
  return (
    <>
      {/* Brand */}
      <div className="flex items-center gap-2.5 px-3 mb-6 shrink-0">
        <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-accent shrink-0">
          <svg viewBox="0 0 24 24" fill="none" className="w-4 h-4 text-white" stroke="currentColor" strokeWidth={2.5}>
            <path d="M3 3v18h18" /><path d="m7 16 4-4 4 4 5-5" />
          </svg>
        </div>
        <span className="font-semibold text-white text-sm tracking-tight">Platstock</span>
      </div>

      {/* Nav groups */}
      <nav className="flex-1 overflow-y-auto space-y-5 px-2">
        {NAV_GROUPS.map((group) => (
          <div key={group.label}>
            <p className="text-[10px] font-semibold uppercase tracking-widest text-[#3B3B4F] px-2 mb-1.5">
              {group.label}
            </p>
            <div className="space-y-0.5">
              {group.items.map(({ href, label, icon: Icon }) => {
                const active =
                  pathname === href ||
                  (href !== "/dashboard" && pathname.startsWith(href));
                return (
                  <Link
                    key={href}
                    href={href}
                    onClick={onNavigate}
                    className={`group flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm transition-all ${
                      active
                        ? "bg-accent/12 text-accent font-medium"
                        : "text-[#6B7280] hover:text-white hover:bg-white/4"
                    }`}
                  >
                    <Icon
                      size={15}
                      className={`shrink-0 transition-colors ${
                        active ? "text-accent" : "text-[#4B5563] group-hover:text-white"
                      }`}
                    />
                    <span className="truncate">{label}</span>
                    {active && (
                      <ChevronRight size={12} className="ml-auto text-accent/60 shrink-0" />
                    )}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* User footer */}
      <div className="px-2 pt-3 mt-3 border-t border-[#1A1A28] shrink-0">
        <div className="flex items-center gap-2.5 px-2 py-2 rounded-lg mb-1">
          <div className="flex items-center justify-center w-7 h-7 rounded-full bg-accent/20 text-accent text-xs font-bold shrink-0">
            {initials(email)}
          </div>
          <p className="text-xs text-[#6B7280] truncate flex-1">{email}</p>
        </div>
        <button
          onClick={onSignOut}
          className="flex items-center gap-2.5 w-full px-2.5 py-2 rounded-lg text-sm text-[#4B5563] hover:text-red-400 hover:bg-red-500/5 transition-all"
        >
          <LogOut size={14} className="shrink-0" />
          Sign out
        </button>
      </div>
    </>
  );
}

export default function Sidebar({ email }: { email: string }) {
  const pathname = usePathname();
  const router   = useRouter();
  const supabase = createClient();
  const [open, setOpen] = useState(false);

  async function signOut() {
    await supabase.auth.signOut();
    router.push("/");
    router.refresh();
  }

  return (
    <>
      {/* ── Mobile top bar ─────────────────────────────────────────────── */}
      <div className="lg:hidden fixed top-0 left-0 right-0 z-30 flex items-center gap-3 h-14 px-4 shrink-0"
        style={{ background: "#0D0D14", borderBottom: "1px solid #1A1A28" }}>
        <button
          onClick={() => setOpen(true)}
          className="p-1.5 rounded-lg text-[#6B7280] hover:text-white hover:bg-white/5 transition-colors"
        >
          <Menu size={20} />
        </button>
        <div className="flex items-center gap-2">
          <div className="flex items-center justify-center w-6 h-6 rounded bg-accent">
            <svg viewBox="0 0 24 24" fill="none" className="w-3 h-3 text-white" stroke="currentColor" strokeWidth={2.5}>
              <path d="M3 3v18h18" /><path d="m7 16 4-4 4 4 5-5" />
            </svg>
          </div>
          <span className="font-semibold text-white text-sm">Platstock</span>
        </div>
      </div>

      {/* ── Mobile overlay ──────────────────────────────────────────────── */}
      {open && (
        <div
          className="lg:hidden fixed inset-0 z-40 bg-black/70 backdrop-blur-sm"
          onClick={() => setOpen(false)}
        />
      )}

      {/* ── Mobile drawer ───────────────────────────────────────────────── */}
      <aside
        className={`lg:hidden fixed top-0 left-0 z-50 h-full w-60 flex flex-col py-4 transition-transform duration-200 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
        style={{ background: "#0D0D14", borderRight: "1px solid #1A1A28" }}
      >
        <div className="flex items-center justify-end px-3 mb-2 shrink-0">
          <button
            onClick={() => setOpen(false)}
            className="p-1.5 rounded-lg text-[#6B7280] hover:text-white hover:bg-white/5 transition-colors"
          >
            <X size={16} />
          </button>
        </div>
        <NavContent
          pathname={pathname}
          email={email}
          onNavigate={() => setOpen(false)}
          onSignOut={signOut}
        />
      </aside>

      {/* ── Desktop sidebar ─────────────────────────────────────────────── */}
      <aside
        className="hidden lg:flex flex-col w-56 min-h-screen py-4 shrink-0"
        style={{ background: "#0D0D14", borderRight: "1px solid #1A1A28" }}
      >
        <NavContent pathname={pathname} email={email} onSignOut={signOut} />
      </aside>
    </>
  );
}
