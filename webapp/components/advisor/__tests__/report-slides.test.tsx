import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { SlideDeck } from "@/components/advisor/report-slides";
import { Diagnostic } from "@/components/advisor/diagnostic-report";

// A "rich" diagnostic whose prospect deck includes every conditional slide
// (cover, hero, metrics, summary, wealth, projection, findings, closing = 8).
const richDiagnostic: Diagnostic = {
  firm_name: "Acme Advisors",
  client_label: "Rich Client",
  analysis_date: "2026-01-01",
  transaction_count: 42,
  period_start: "2024-01-01",
  period_end: "2026-01-01",
  mwr_annualized: 8.2,
  behavioral_tax_pct: -3.1,
  panic_liquidation_rate: 12,
  trade_win_rate: 55,
  grades: { overall: "B", timing: "B", discipline: "B", returns: "B" },
  insights: ["Insight one.", "Insight two."],
  wealth_path: [
    { date: "2024-01-01", cumulative_in: 1000, cumulative_out: 0, net_position: 1000 },
    { date: "2025-01-01", cumulative_in: 2000, cumulative_out: 100, net_position: 1900 },
  ],
  estimated_portfolio_value: 100_000,
  opportunity_cost_dollars: 5_000,
  narrative: ["Executive summary paragraph."],
  projection: {
    horizon_years: 5,
    start_value: 100_000,
    mu_current: 0.05,
    sigma_current: 0.1,
    mu_disciplined: 0.08,
    sigma_disciplined: 0.09,
    yearly: [1, 2, 3, 4, 5].map(year => ({
      year,
      cur_p10: 90_000, cur_p50: 105_000, cur_p90: 120_000,
      dis_p10: 95_000, dis_p50: 115_000, dis_p90: 130_000,
    })),
    terminal_gap_p50: 10_000,
  },
};

// A "sparse" diagnostic whose prospect deck only has the three
// unconditional slides (cover, metrics, closing).
const sparseDiagnostic: Diagnostic = {
  firm_name: "Acme Advisors",
  client_label: "Sparse Client",
  analysis_date: "2026-01-01",
  transaction_count: 3,
  period_start: "2025-06-01",
  period_end: "2026-01-01",
  mwr_annualized: 1.1,
  behavioral_tax_pct: 0,
  panic_liquidation_rate: 0,
  trade_win_rate: 50,
  grades: { overall: "C", timing: "C", discipline: "C", returns: "C" },
  insights: [],
  wealth_path: [],
};

function nextButton() {
  return screen.getByText("Next").closest("button")!;
}
function prevButton() {
  return screen.getByText("Prev").closest("button")!;
}

describe("SlideDeck", () => {
  it("does not crash when the diagnostic changes to one with fewer slides", async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      <SlideDeck d={richDiagnostic} mode="prospect" firmName="Acme Advisors" />
    );

    // Walk to the last slide of the 8-slide rich deck.
    for (let i = 0; i < 7; i++) {
      await user.click(nextButton());
    }
    expect(nextButton()).toBeDisabled(); // confirms we're on slide index 7

    // Simulate navigating to a different saved report — same SlideDeck
    // instance, a diagnostic with far fewer slides. Before the fix this
    // threw "Cannot read properties of undefined (reading 'eyebrow')"
    // because `index` stayed at 7 while the new deck only has 3 slides.
    rerender(<SlideDeck d={sparseDiagnostic} mode="prospect" firmName="Acme Advisors" />);

    // Index is clamped/reset back into range instead of crashing.
    expect(prevButton()).toBeDisabled();
    expect(screen.getByText("Sparse Client")).toBeInTheDocument();
  });

  it("resets to the first slide when switching between prospect and compliance mode", async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      <SlideDeck d={richDiagnostic} mode="prospect" firmName="Acme Advisors" />
    );

    await user.click(nextButton());
    expect(prevButton()).not.toBeDisabled(); // moved off slide 0

    rerender(<SlideDeck d={richDiagnostic} mode="compliance" firmName="Acme Advisors" />);
    expect(prevButton()).toBeDisabled(); // back to slide 0
  });
});
