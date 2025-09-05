import FlappyBird from "./FlappyBird";

export default function FlappyPage() {
  return (
    <div className="min-h-screen p-6 sm:p-10 flex flex-col items-center gap-6">
      <h1 className="text-2xl font-bold">Flappy Bird</h1>
      <FlappyBird attempts={5} transactionId="FB-001" />
    </div>
  );
}


