"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import FlappyBird from "./FlappyBird";
import { addGameResult, addJuiceMinigame, fetchTransactionById } from "../../lib/firebase";

function FlappyPageContent() {


  const searchParams = useSearchParams();
  const [attempts, setAttempts] = useState(5);
  const [loading, setLoading] = useState(true);
  const [raffleData, setRaffleData] = useState(null);
  const transactionId = searchParams.get("transactionId") ?? "";
  const [juiceMinigame, setJuiceMinigame] = useState(false);
  const [summary, setSummary] = useState(null);
  const raffleUrl = "https://www.pegalachapa.com/rifas/BcK49bSWfzlGVdMskufj";

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
            <div className="w-full max-w-md rounded-xl border border-white/20 bg-black/60 backdrop-blur-md p-6 shadow-sm text-center text-white">
              <div className="mx-auto mb-3 h-10 w-10 rounded-full bg-emerald-400/20 flex items-center justify-center">
                <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-emerald-600 dark:text-emerald-400">
                  <path d="M9 12l2 2 4-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" opacity=".35" />
                </svg>
              </div>
              <h2 className="text-lg font-semibold">Intentos agotados</h2>
              <p className="mt-1 text-sm text-white/80">Ya no tienes intentos disponibles para este minijuego.</p>
              <p className="mt-2 text-xs text-white/70">Transacción: <span className="font-mono">{transactionId}</span></p>
            </div>

            {summary ? (
              <div className="w-full max-w-md rounded-xl border border-white/20 bg-black/60 backdrop-blur-md p-6 shadow-sm text-white">
                <h2 className="text-lg font-semibold text-center">Resumen de tu ronda</h2>
                <p className="mt-1 text-xs text-center text-white/70">Transacción: <span className="font-mono">{transactionId}</span></p>
                <p className="mt-1 text-sm text-white/80 text-center">Total puntos: <span className="font-semibold">{summary.totalPoints}</span></p>
                {(summary.bestAttempt !== undefined || summary.bestScore !== undefined) && (
                  <div className="mt-4 rounded-lg bg-white/5 p-3">
                    <p className="text-sm">Mejor intento: <span className="font-semibold">#{summary.bestAttempt}</span> — <span className="font-semibold">{summary.bestScore}</span> pts</p>
                  </div>
                )}
                {Array.isArray(summary.attemptsBreakdown) && summary.attemptsBreakdown.length > 0 && (
                  <div className="mt-4">
                    <p className="text-sm mb-2 font-medium">Detalle por intento</p>
                    <ul className="text-sm space-y-1">
                      {summary.attemptsBreakdown.map((pts, idx) => (
                        <li key={idx} className="flex items-center justify-between rounded-md border border-white/20 px-3 py-2">
                          <span className="text-white/80">Intento #{idx + 1}</span>
                          <span className="font-semibold">{pts}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                <div className="mt-6 text-center">
                  <p className="text-xs text-white/70 mb-2">Para seguir jugando debes comprar otros números de la rifa.</p>
                  <button
                    type="button"
                    onClick={() => { window.location.href = raffleUrl; }}
                    className="inline-flex items-center justify-center rounded-md bg-emerald-600 hover:bg-emerald-700 px-4 py-2 text-sm font-medium text-white shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-400/60 focus:ring-offset-0 w-full"
                    aria-label="Seguir jugando"
                  >
                    Seguir jugando
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        ) : summary ? (
          <div className="w-full flex-1 flex items-center justify-center">
            <div className="w-full max-w-md rounded-xl border border-white/20 bg-black/60 backdrop-blur-md p-6 shadow-sm text-white">
              <h2 className="text-lg font-semibold text-center">Resumen de tu ronda</h2>
              <p className="mt-1 text-xs text-center text-white/70">Transacción: <span className="font-mono">{transactionId}</span></p>
              <p className="mt-1 text-sm text-white/80 text-center">Total puntos: <span className="font-semibold">{summary.totalPoints}</span></p>
              {(summary.bestAttempt !== undefined || summary.bestScore !== undefined) && (
                <div className="mt-4 rounded-lg bg-white/5 p-3">
                  <p className="text-sm">Mejor intento: <span className="font-semibold">#{summary.bestAttempt}</span> — <span className="font-semibold">{summary.bestScore}</span> pts</p>
                </div>
              )}
              {Array.isArray(summary.attemptsBreakdown) && summary.attemptsBreakdown.length > 0 && (
                <div className="mt-4">
                  <p className="text-sm mb-2 font-medium">Detalle por intento</p>
                  <ul className="text-sm space-y-1">
                    {summary.attemptsBreakdown.map((pts, idx) => (
                      <li key={idx} className="flex items-center justify-between rounded-md border border-white/20 px-3 py-2">
                        <span className="text-white/80">Intento #{idx + 1}</span>
                        <span className="font-semibold">{pts}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <div className="mt-6 text-center">
                <p className="text-xs text-white/70 mb-2">Para seguir jugando debes comprar otros números de la rifa.</p>
                <button
                  type="button"
                  onClick={() => { window.location.href = raffleUrl; }}
                  className="inline-flex items-center justify-center rounded-md bg-emerald-600 hover:bg-emerald-700 px-4 py-2 text-sm font-medium text-white shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-400/60 focus:ring-offset-0 w-full"
                  aria-label="Seguir jugando"
                >
                  Seguir jugando
                </button>
              </div>
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

export default function FlappyPage() {
  return (
    <Suspense fallback={<div />}> 
      <FlappyPageContent />
    </Suspense>
  );
}

export const dynamic = "force-dynamic";


