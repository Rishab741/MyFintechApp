// No auth gate — the advisor tool is a public landing page.
export default function AdvisorLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#09090E] text-white">
      {children}
    </div>
  );
}
