import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import OnboardingShell from "./shell";

export const metadata = { title: "Setup · Platstock" };

export default async function OnboardingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/");

  return <OnboardingShell>{children}</OnboardingShell>;
}
