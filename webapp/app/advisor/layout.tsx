"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  Building2, ChevronDown, FileText, LayoutDashboard,
  LogOut, Settings, Upload,
} from "lucide-react";

// ── Brand tokens ──────────────────────────────────────────────────────────────
const A        = "#C9A84C";
const A_BG     = "rgba(201,168,76,0.08)";
const A_BORDER = "rgba(201,168,76,0.18)";

// Pages that don't need the advisor nav (auth flow pages).
const AUTH_PATHS = ["/advisor/login", "/advisor/signup", "/advisor/verify"];

function isAuthPage(pathname: string) {
  return AUTH_PATHS.some(p => pathname === p || pathname.startsWith(`${p}/`));
}

// ── Nav link ──────────────────────────────────────────────────────────────────
function NavLink({
  href,
  icon: Icon,
  label,
  active,
  disabled,
}: {
  href:     string;
  icon:     React.ElementType;
  label:    string;
  active:   boolean;
  disabled?: boolean;
}) {
  return (
    <Link
      href={disabled ? "#" : href}
      onClick={disabled ? (e: React.MouseEvent) => e.preventDefault() : undefined}
      className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-all
        ${active   ? "text-white" : "text-[#6B7280] hover:text-[#9CA3AF]"}
        ${disabled ? "cursor-default opacity-40" : ""}
      `}
      style={active ? { background: A_BG, color: A, border: `1px solid ${A_BORDER}` } : {}}
    >
      <Icon size={14} />
      {label}
      {disabled && (
        <span
          className="text-[9px] uppercase font-semibold tracking-wide px-1 py-0.5 rounded"
          style={{ background: "rgba(255,255,255,0.05)", color: "#4B5563" }}
        >
          Soon
        </span>
      )}
    </Link>
  );
}

// ── Advisor nav ───────────────────────────────────────────────────────────────
function AdvisorNav() {
  const router   = useRouter();
  const pathname = usePathname();
  const supabase = createClient();

  const [firmName,  setFirmName]  = useState<string | null>(null);
  const [menuOpen,  setMenuOpen]  = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      setFirmName(
        (user?.user_metadata?.firm_name as string | undefined) ?? user?.email ?? null
      );
    });
  }, [supabase]);

  async function handleSignOut() {
    setSigningOut(true);
    setMenuOpen(false);
    try {
      await supabase.auth.signOut();
      router.push("/advisor/login");
    } finally {
      setSigningOut(false);
    }
  }

  const NAV_ITEMS = [
    { href: "/advisor/dashboard", icon: LayoutDashboard, label: "Dashboard",  disabled: false },
    { href: "/advisor/diagnose",  icon: Upload,          label: "Diagnostic", disabled: false },
    { href: "/advisor/reports",   icon: FileText,        label: "Reports",    disabled: false },
    { href: "/advisor/settings",  icon: Settings,        label: "Settings",   disabled: true  },
  ];

  return (
    <header
      className="sticky top-0 z-40 w-full border-b"
      style={{ background: "rgba(9,9,14,0.92)", backdropFilter: "blur(12px)", borderColor: "#1A1A28" }}
    >
      <div className="max-w-5xl mx-auto px-6 h-14 flex items-center justify-between gap-6">

        {/* ── Brand ─────────────────────────────────────────────────────── */}
        <Link href="/advisor/dashboard" className="flex items-center gap-2.5 shrink-0">
          <div
            className="w-7 h-7 rounded-lg flex items-center justify-center"
            style={{ background: A_BG, border: `1px solid ${A_BORDER}` }}
          >
            <Building2 size={13} style={{ color: A }} />
          </div>
          <span className="text-white font-semibold text-sm hidden sm:block">
            Platstock <span style={{ color: A }}>Advisor</span>
          </span>
        </Link>

        {/* ── Nav links (desktop) ───────────────────────────────────────── */}
        <nav className="hidden md:flex items-center gap-1">
          {NAV_ITEMS.map(item => (
            <NavLink
              key={item.href}
              href={item.href}
              icon={item.icon}
              label={item.label}
              active={pathname === item.href || pathname.startsWith(`${item.href}/`)}
              disabled={item.disabled}
            />
          ))}
        </nav>

        {/* ── User menu ─────────────────────────────────────────────────── */}
        <div className="relative shrink-0">
          <button
            onClick={() => setMenuOpen(v => !v)}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm transition-all hover:bg-white/5"
            style={{ border: "1px solid #1A1A28" }}
          >
            <div
              className="w-5 h-5 rounded-md flex items-center justify-center text-[10px] font-bold shrink-0"
              style={{ background: A_BG, color: A }}
            >
              {firmName ? firmName[0].toUpperCase() : "?"}
            </div>
            <span className="text-[#9CA3AF] text-xs hidden sm:block max-w-[120px] truncate">
              {firmName ?? "…"}
            </span>
            <ChevronDown size={12} className={`text-[#4B5563] transition-transform ${menuOpen ? "rotate-180" : ""}`} />
          </button>

          {menuOpen && (
            <>
              {/* Backdrop */}
              <div
                className="fixed inset-0 z-40"
                onClick={() => setMenuOpen(false)}
              />
              {/* Dropdown */}
              <div
                className="absolute right-0 top-full mt-1.5 z-50 w-44 rounded-xl py-1 shadow-xl"
                style={{
                  background: "#111118",
                  border:     "1px solid #1E1E2E",
                  boxShadow:  "0 8px 32px rgba(0,0,0,0.5)",
                }}
              >
                <Link
                  href="/advisor/settings"
                  onClick={() => setMenuOpen(false)}
                  className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-[#9CA3AF] hover:text-white hover:bg-white/4 transition-colors opacity-40 cursor-default"
                >
                  <Settings size={13} />
                  Firm settings
                  <span className="ml-auto text-[9px] text-[#4B5563] font-semibold uppercase">soon</span>
                </Link>
                <div className="h-px mx-3 my-1" style={{ background: "#1E1E2E" }} />
                <button
                  onClick={handleSignOut}
                  disabled={signingOut}
                  className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-[#EF4444] hover:bg-red-500/8 transition-colors disabled:opacity-50"
                >
                  <LogOut size={13} />
                  {signingOut ? "Signing out…" : "Sign out"}
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── Mobile nav ────────────────────────────────────────────────────── */}
      <div
        className="md:hidden border-t px-4 py-2 flex gap-1 overflow-x-auto"
        style={{ borderColor: "#1A1A28" }}
      >
        {NAV_ITEMS.map(item => (
          <NavLink
            key={item.href}
            href={item.href}
            icon={item.icon}
            label={item.label}
            active={pathname === item.href || pathname.startsWith(`${item.href}/`)}
            disabled={item.disabled}
          />
        ))}
      </div>
    </header>
  );
}

// ── Layout ────────────────────────────────────────────────────────────────────
export default function AdvisorLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const showNav  = !isAuthPage(pathname);

  return (
    <div className="min-h-screen bg-[#09090E] text-white">
      {showNav && <AdvisorNav />}
      <main className={showNav ? "" : ""}>{children}</main>
    </div>
  );
}
