import DinoGame from "./DinoGame";

export default function DinoPage() {
  return (
    <div className="min-h-screen p-6 sm:p-10 flex flex-col items-center gap-6">
      <h1 className="text-2xl font-bold">Dino</h1>
      <DinoGame />
    </div>
  );
}


