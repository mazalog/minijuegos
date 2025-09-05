import Link from "next/link";

export default function Home() {
  return (
    <div className="min-h-screen p-6 sm:p-10 flex flex-col items-center gap-6">
      <h1 className="text-2xl font-bold">Juegos</h1>
      <div className="flex gap-4">
        <Link className="underline" href="/flappy">Flappy Bird</Link>
        <Link className="underline" href="/doodle">Doodle Jump</Link>
        <Link className="underline" href="/dino">Dino</Link>
      </div>
    </div>
  );
}
