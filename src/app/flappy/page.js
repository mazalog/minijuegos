"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import FlappyBird from "./FlappyBird";
import { addGameResult, addJuiceMinigame, fetchTransactionById } from "../../lib/firebase";

export default function FlappyPage() {


  const searchParams = useSearchParams();
  const [attempts, setAttempts] = useState(5);
  const [loading, setLoading] = useState(true);
  const [raffleData, setRaffleData] = useState(null);
  const transactionId = searchParams.get("transactionId") ?? "";
  const [juiceMinigame, setJuiceMinigame] = useState(false);
  const [summary, setSummary] = useState(null);

  const gameEnded = async (x) => {
    setSummary({
      totalPoints: x.totalPoints,
      bestAttempt: x.bestAttempt,
      bestScore: x.bestScore,
      attemptsBreakdown: Array.isArray(x.attemptsBreakdown) ? x.attemptsBreakdown : [],
    });

    const scheme = {
      game: "Flappy Bird",
      saleId: transactionId,
      raffleName: raffleData.raffleName,
      totalPoints: x.totalPoints,
      userInfo: raffleData.userInfo,
      bestAttempt: x.bestAttempt,
      bestScore: x.bestScore,
      attemptsBreakdown: Array.isArray(x.attemptsBreakdown) ? x.attemptsBreakdown : [],
    };
    await addGameResult(scheme);
    await addJuiceMinigame(scheme);
  };

  const requestTransaction = async () => {
    try {
      const tx = await fetchTransactionById(transactionId);
      setAttempts(tx.ticketNumbers.length);
      console.log(tx);
      setSummary(tx.dateInGame);
      setRaffleData(tx);
      setJuiceMinigame(tx.juiceMinigame);
      setLoading(false);
    } catch (_) {
    }
  }

  useEffect(() => {
    requestTransaction();
  }, [transactionId]);

  return (
    <div className="min-h-screen p-6 sm:p-10 flex flex-col items-center gap-6 justify-center">
      {
        loading ? <></> :
        juiceMinigame ? (
          <div className="w-full flex-1 flex flex-col items-center justify-center gap-6">
            <div className="w-full max-w-md rounded-xl border border-black/[.08] dark:border-white/[.145] bg-white/70 dark:bg-white/5 backdrop-blur p-6 shadow-sm text-center">
              <div className="mx-auto mb-3 h-10 w-10 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
                <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-emerald-600 dark:text-emerald-400">
                  <path d="M9 12l2 2 4-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" opacity=".35" />
                </svg>
              </div>
              <h2 className="text-lg font-semibold">Intentos agotados</h2>
              <p className="mt-1 text-sm text-black/70 dark:text-white/70">Ya no tienes intentos disponibles para este minijuego.</p>
              <p className="mt-2 text-xs text-black/60 dark:text-white/60">Transacción: <span className="font-mono">{transactionId}</span></p>
            </div>

            {summary ? (
              <div className="w-full max-w-md rounded-xl border border-black/[.08] dark:border-white/[.145] bg-white/70 dark:bg-white/5 backdrop-blur p-6 shadow-sm">
                <h2 className="text-lg font-semibold text-center">Resumen de tu ronda</h2>
                <p className="mt-1 text-xs text-center text-black/60 dark:text-white/60">Transacción: <span className="font-mono">{transactionId}</span></p>
                <p className="mt-1 text-sm text-black/70 dark:text-white/70 text-center">Total puntos: <span className="font-semibold">{summary.totalPoints}</span></p>
                {(summary.bestAttempt !== undefined || summary.bestScore !== undefined) && (
                  <div className="mt-4 rounded-lg bg-black/[.04] dark:bg-white/[.06] p-3">
                    <p className="text-sm">Mejor intento: <span className="font-semibold">#{summary.bestAttempt}</span> — <span className="font-semibold">{summary.bestScore}</span> pts</p>
                  </div>
                )}
                {Array.isArray(summary.attemptsBreakdown) && summary.attemptsBreakdown.length > 0 && (
                  <div className="mt-4">
                    <p className="text-sm mb-2 font-medium">Detalle por intento</p>
                    <ul className="text-sm space-y-1">
                      {summary.attemptsBreakdown.map((pts, idx) => (
                        <li key={idx} className="flex items-center justify-between rounded-md border border-black/[.06] dark:border-white/[.12] px-3 py-2">
                          <span className="text-black/70 dark:text-white/70">Intento #{idx + 1}</span>
                          <span className="font-semibold">{pts}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            ) : null}
          </div>
        ) : summary ? (
          <div className="w-full flex-1 flex items-center justify-center">
            <div className="w-full max-w-md rounded-xl border border-black/[.08] dark:border-white/[.145] bg-white/70 dark:bg-white/5 backdrop-blur p-6 shadow-sm">
              <h2 className="text-lg font-semibold text-center">Resumen de tu ronda</h2>
              <p className="mt-1 text-xs text-center text-black/60 dark:text-white/60">Transacción: <span className="font-mono">{transactionId}</span></p>
              <p className="mt-1 text-sm text-black/70 dark:text-white/70 text-center">Total puntos: <span className="font-semibold">{summary.totalPoints}</span></p>
              {(summary.bestAttempt !== undefined || summary.bestScore !== undefined) && (
                <div className="mt-4 rounded-lg bg-black/[.04] dark:bg-white/[.06] p-3">
                  <p className="text-sm">Mejor intento: <span className="font-semibold">#{summary.bestAttempt}</span> — <span className="font-semibold">{summary.bestScore}</span> pts</p>
                </div>
              )}
              {Array.isArray(summary.attemptsBreakdown) && summary.attemptsBreakdown.length > 0 && (
                <div className="mt-4">
                  <p className="text-sm mb-2 font-medium">Detalle por intento</p>
                  <ul className="text-sm space-y-1">
                    {summary.attemptsBreakdown.map((pts, idx) => (
                      <li key={idx} className="flex items-center justify-between rounded-md border border-black/[.06] dark:border-white/[.12] px-3 py-2">
                        <span className="text-black/70 dark:text-white/70">Intento #{idx + 1}</span>
                        <span className="font-semibold">{pts}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        ) :
          <FlappyBird
            attempts={attempts}
            transactionId={transactionId}
            gameEnded={gameEnded}
          />
      }
    </div>
  );
}


