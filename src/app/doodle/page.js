import DoodleJump from "./DoodleJump";

export default function DoodlePage() {
  return (
    <div className="min-h-screen p-6 sm:p-10 flex flex-col items-center gap-6">
      <h1 className="text-2xl font-bold">Doodle Jump</h1>
      <DoodleJump attempts={5} transactionId="123" />
    </div>
  );
}


