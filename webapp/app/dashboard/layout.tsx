import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Sidebar from "@/components/sidebar";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();

  // getSession() reads the JWT from the cookie — no network round-trip to
  // Supabase Auth. The middleware already validated the session on every
  // request, so this is safe. Using getUser() here was adding 200–2000 ms
  // of network latency to every single dashboard page load.
  const { data: { session } } = await supabase.auth.getSession();

  if (!session) redirect("/");

  return (
    <div className="flex min-h-screen">
      <Sidebar email={session.user.email ?? ""} />
      {/* pt-14 on mobile to clear the fixed top bar; no padding on lg+ */}
      <main className="flex-1 overflow-auto p-4 sm:p-6 pt-[4.5rem] lg:pt-6">
        {children}
      </main>
    </div>
  );
}
