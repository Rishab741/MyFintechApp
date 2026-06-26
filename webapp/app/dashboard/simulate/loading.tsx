export default function SimulateLoading() {
  return (
    <div className="max-w-7xl mx-auto animate-pulse">
      <div className="grid grid-cols-1 xl:grid-cols-[340px_1fr] gap-6">
        <div className="bg-white/4 border border-white/6 rounded-2xl h-[520px]" />
        <div className="bg-white/4 border border-white/6 rounded-2xl h-80" />
      </div>
    </div>
  );
}
