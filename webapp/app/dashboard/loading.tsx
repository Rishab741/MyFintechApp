// Renders instantly while the dashboard page compiles/executes.
// Next.js streams this HTML to the browser in <5ms; actual content
// replaces it via React streaming once ready.
export default function DashboardLoading() {
  return (
    <div className="max-w-6xl mx-auto space-y-6 animate-pulse">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <div className="h-5 w-24 bg-white/6 rounded-lg" />
          <div className="h-3 w-40 bg-white/4 rounded" />
        </div>
        <div className="h-3 w-32 bg-white/4 rounded" />
      </div>

      {/* Metric cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="bg-white/4 border border-white/6 rounded-xl p-5 space-y-3">
            <div className="h-3 w-24 bg-white/8 rounded" />
            <div className="h-7 w-20 bg-white/10 rounded" />
            <div className="h-2 w-16 bg-white/5 rounded" />
          </div>
        ))}
      </div>

      {/* Health score + chart */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="bg-white/4 border border-white/6 rounded-xl p-5 space-y-3">
          <div className="h-3 w-28 bg-white/8 rounded" />
          <div className="h-12 w-16 bg-white/10 rounded" />
          <div className="h-2 w-full bg-white/5 rounded" />
        </div>
        <div className="lg:col-span-2 bg-white/4 border border-white/6 rounded-xl p-5">
          <div className="h-3 w-40 bg-white/8 rounded mb-4" />
          <div className="h-40 bg-white/3 rounded-lg" />
        </div>
      </div>
    </div>
  );
}
