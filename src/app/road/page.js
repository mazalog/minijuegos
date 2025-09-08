import RoadFighter from "./RoadFighter";

export default function RoadPage({ searchParams }) {
  const attemptsRaw = searchParams?.attempts;
  const attemptsParsed = Array.isArray(attemptsRaw) ? attemptsRaw[0] : attemptsRaw;
  const attempts = Number.isFinite(parseInt(attemptsParsed, 10)) ? Math.max(0, parseInt(attemptsParsed, 10)) : 5;

  const txRaw = searchParams?.transactionId;
  const transactionId = Array.isArray(txRaw) ? (txRaw[0] ?? "") : (txRaw ?? "");

  return (
    <div className="min-h-screen p-6 sm:p-10 flex flex-col items-center gap-6">
      <h1 className="text-2xl font-bold">Road Fighter</h1>
      <RoadFighter attempts={attempts} transactionId={transactionId} />
    </div>
  );
}
