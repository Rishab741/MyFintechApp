import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Sidebar from "@/components/sidebar";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect("/");

  return (
    <div className="flex min-h-screen">
      <Sidebar email={user.email ?? ""} />
      {/* pt-14 on mobile to clear the fixed top bar; no padding on lg+ */}
      <main className="flex-1 overflow-auto p-4 sm:p-6 pt-[4.5rem] lg:pt-6">
        {children}
      </main>
    </div>
  );
}
