"use client";

import TowerStack from './TowerStack';

export default function TowerPage({ searchParams }) {
  const attemptsRaw = searchParams?.attempts;
  const attemptsParsed = Array.isArray(attemptsRaw) ? attemptsRaw[0] : attemptsRaw;
  const attempts = Number.isFinite(parseInt(attemptsParsed, 10)) ? Math.max(0, parseInt(attemptsParsed, 10)) : 5;

  const txRaw = searchParams?.transactionId;
  const transactionId = Array.isArray(txRaw) ? (txRaw[0] ?? "") : (txRaw ?? "");

  return (
    <div className="flex min-h-screen flex-col items-center justify-between p-4">
      <TowerStack attempts={attempts} transactionId={transactionId} />
    </div>
  );
}
