"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  LayoutDashboard, TrendingUp, Upload, Key, BarChart2,
  FileText, Shield, LogOut, Heart, Clock, Briefcase,
} from "lucide-react";

const NAV = [
  { href: "/dashboard",                label: "Overview",      icon: LayoutDashboard },
  { href: "/dashboard/health-score",   label: "Health Score",  icon: Heart           },
  { href: "/dashboard/what-if",        label: "What-if",       icon: Clock           },
  { href: "/dashboard/holdings",       label: "Holdings",      icon: Briefcase       },
  { href: "/dashboard/portfolio",      label: "Analytics",     icon: TrendingUp      },
  { href: "/dashboard/ingest",         label: "Import Data",   icon: Upload          },
  { href: "/dashboard/ledger",         label: "Ledger",        icon: Shield          },
  { href: "/dashboard/api-keys",       label: "API Keys",      icon: Key             },
  { href: "/dashboard/usage",          label: "Usage",         icon: BarChart2       },
  { href: "/dashboard/audit",          label: "Audit Log",     icon: FileText        },
];

export default function Sidebar({ email }: { email: string }) {
  const pathname = usePathname();
  const router   = useRouter();
  const supabase = createClient();

  async function signOut() {
    await supabase.auth.signOut();
    router.push("/");
    router.refresh();
  }

  return (
    <aside className="flex flex-col w-56 min-h-screen bg-card border-r border-border px-3 py-4 shrink-0">
      {/* Brand */}
      <div className="flex items-center gap-2.5 px-2 mb-7">
        <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-accent shrink-0">
          <svg viewBox="0 0 24 24" fill="none" className="w-4 h-4 text-white" stroke="currentColor" strokeWidth={2.5}>
            <path d="M3 3v18h18" /><path d="m7 16 4-4 4 4 5-5" />
          </svg>
        </div>
        <span className="font-semibold text-white text-sm">Vestara</span>
      </div>

      {/* Nav */}
      <nav className="flex-1 space-y-0.5">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || (href !== "/dashboard" && pathname.startsWith(href));
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm transition-colors ${
                active
                  ? "bg-accent/15 text-accent font-medium"
                  : "text-muted hover:text-white hover:bg-white/5"
              }`}
            >
              <Icon size={16} />
              {label}
            </Link>
          );
        })}
      </nav>

      {/* User */}
      <div className="border-t border-border pt-3 mt-3">
        <p className="text-xs text-muted px-2 mb-2 truncate">{email}</p>
        <button
          onClick={signOut}
          className="flex items-center gap-2.5 w-full px-2.5 py-2 rounded-lg text-sm text-muted hover:text-white hover:bg-white/5 transition-colors"
        >
          <LogOut size={16} />
          Sign out
        </button>
      </div>
    </aside>
  );
}
