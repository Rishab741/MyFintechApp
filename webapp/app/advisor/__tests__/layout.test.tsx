import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

const push = vi.fn();

vi.mock("next/navigation", () => ({
  usePathname: () => "/advisor/dashboard",
  useRouter: () => ({ push }),
}));

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    auth: {
      getUser: () => Promise.resolve({ data: { user: null } }),
      signOut: () => Promise.resolve({ error: null }),
    },
  }),
}));

import AdvisorLayout from "@/app/advisor/layout";

describe("AdvisorLayout — Firm settings (unimplemented route)", () => {
  it("never points at a real href, so Next.js cannot prefetch a 404", async () => {
    const user = userEvent.setup();
    render(<AdvisorLayout>{null}</AdvisorLayout>);

    // Open the account dropdown.
    await user.click(screen.getByText("…"));

    const settingsLink = screen.getByText("Firm settings").closest("a");
    expect(settingsLink).not.toBeNull();
    // A real href here is what caused Next to prefetch /advisor/settings
    // in production and 404 — it must stay inert until the page exists.
    expect(settingsLink).toHaveAttribute("href", "#");

    await user.click(settingsLink!);
    expect(push).not.toHaveBeenCalled();
  });
});
