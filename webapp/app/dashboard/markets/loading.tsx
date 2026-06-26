export default function MarketsLoading() {
  return (
    <div className="max-w-7xl mx-auto space-y-5 animate-pulse">
      <div className="h-10 bg-white/4 border border-white/6 rounded-xl" />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="bg-white/4 border border-white/6 rounded-xl p-4 space-y-2">
            <div className="h-3 w-20 bg-white/8 rounded" />
            <div className="h-6 w-16 bg-white/10 rounded" />
          </div>
        ))}
      </div>
      <div className="bg-white/4 border border-white/6 rounded-xl h-64" />
    </div>
  );
}
