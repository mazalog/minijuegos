import RoadFighter from "./RoadFighter";

export default function RoadPage() {
  return (
    <div className="min-h-screen p-6 sm:p-10 flex flex-col items-center gap-6">
      <h1 className="text-2xl font-bold">Road Fighter</h1>
      <RoadFighter attempts={5} transactionId="RF-001" />
    </div>
  );
}


