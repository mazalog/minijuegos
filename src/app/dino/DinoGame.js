"use client";

import { useEffect, useRef, useState } from "react";

const W = 600;
const H = 300;
const GROUND_Y = 240;

// Física
const GRAVITY = 2400; // px/s^2
const JUMP_V = -720;  // px/s
const SPEED_START = 240; // px/s
const SPEED_INCREASE = 0.02; // por segundo

// Obstáculos
const CACTUS_MIN_GAP = 220;
const CACTUS_MAX_GAP = 360;

export default function DinoGame() {
  const canvasRef = useRef(null);
  const animRef = useRef(null);
  const lastRef = useRef(0);
  const speedRef = useRef(SPEED_START);
  const isTouchRef = useRef(false);
  const runningRef = useRef(false);
  const gameOverRef = useRef(false);

  const [running, setRunning] = useState(false);
  const [gameOver, setGameOver] = useState(false);
  const [score, setScore] = useState(0);

  const dinoRef = useRef({ x: 60, y: GROUND_Y, vy: 0, w: 40, h: 44, onGround: true });
  const cactiRef = useRef([]);
  const nextGapRef = useRef(rand(CACTUS_MIN_GAP, CACTUS_MAX_GAP));
  const groundXRef = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    canvas.width = W * dpr; canvas.height = H * dpr;
    canvas.style.width = `${W}px`; canvas.style.height = `${H}px`;
    ctx.scale(dpr, dpr);

    const onKey = (e) => {
      if ((e.code === "Space" || e.code === "ArrowUp") && !gameOverRef.current) {
        e.preventDefault();
        if (!runningRef.current) start(); else jump();
      } else if (e.code === "Enter" && gameOverRef.current) {
        start();
      }
    };
    window.addEventListener("keydown", onKey);
    const firstTouch = () => { isTouchRef.current = true; window.removeEventListener("touchstart", firstTouch); };
    window.addEventListener("touchstart", firstTouch, { passive: true });

    drawStart(ctx);

    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("touchstart", firstTouch);
      cancelAnimationFrame(animRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const start = () => {
    setRunning(true); runningRef.current = true;
    setGameOver(false); gameOverRef.current = false;
    setScore(0);
    dinoRef.current = { x: 60, y: GROUND_Y, vy: 0, w: 40, h: 44, onGround: true };
    cactiRef.current = [];
    nextGapRef.current = rand(CACTUS_MIN_GAP, CACTUS_MAX_GAP);
    speedRef.current = SPEED_START;
    groundXRef.current = 0;
    lastRef.current = 0;
    animRef.current = requestAnimationFrame(loop);
  };

  const jump = () => {
    const d = dinoRef.current;
    if (d.onGround) { d.vy = JUMP_V; d.onGround = false; }
  };

  const loop = (ts) => {
    const canvas = canvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!lastRef.current) lastRef.current = ts;
    const dt = Math.min(50, ts - lastRef.current) / 1000;
    lastRef.current = ts;
    update(dt);
    render(ctx);
    if (!gameOverRef.current) animRef.current = requestAnimationFrame(loop);
  };

  const update = (dt) => {
    // velocidad aumenta con el tiempo
    speedRef.current += SPEED_INCREASE * speedRef.current * dt;
    groundXRef.current = (groundXRef.current - speedRef.current * dt) % 40;

    // mover cactus
    for (let i = cactiRef.current.length - 1; i >= 0; i--) {
      const c = cactiRef.current[i];
      c.x -= speedRef.current * dt;
      if (c.x + c.w < 0) cactiRef.current.splice(i, 1);
    }

    // spawn cactus por distancia
    nextGapRef.current -= speedRef.current * dt;
    if (nextGapRef.current <= 0) {
      const w = rand(16, 24) * rand(1, 2); // cactus simple o doble ancho
      cactiRef.current.push({ x: W + 10, y: GROUND_Y, w, h: 36 });
      nextGapRef.current = rand(CACTUS_MIN_GAP, CACTUS_MAX_GAP);
    }

    // dino física
    const d = dinoRef.current;
    d.vy += GRAVITY * dt;
    d.y += d.vy * dt;
    if (d.y >= GROUND_Y) { d.y = GROUND_Y; d.vy = 0; d.onGround = true; }

    // colisiones
    for (const c of cactiRef.current) {
      if (rectsOverlap(d.x - d.w / 2, d.y - d.h, d.w, d.h, c.x - c.w / 2, c.y - c.h, c.w, c.h)) {
        setGameOver(true); gameOverRef.current = true;
        return;
      }
    }

    // puntuación por tiempo
    setScore((s) => s + Math.floor(10 * dt));
  };

  const render = (ctx) => {
    // cielo
    ctx.fillStyle = "#f7f7f7";
    ctx.fillRect(0, 0, W, H);

    // suelo
    ctx.strokeStyle = "#8f8f8f";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, GROUND_Y + 1);
    ctx.lineTo(W, GROUND_Y + 1);
    ctx.stroke();
    // marcas del suelo
    ctx.strokeStyle = "#bdbdbd";
    ctx.lineWidth = 2;
    for (let x = groundXRef.current; x < W; x += 40) {
      ctx.beginPath(); ctx.moveTo(x, GROUND_Y + 14); ctx.lineTo(x + 16, GROUND_Y + 14); ctx.stroke();
    }

    // cacti
    ctx.fillStyle = "#517a3e";
    for (const c of cactiRef.current) {
      drawCactus(ctx, c.x, c.y, c.w, c.h);
    }

    // dino (simple pixel art vector)
    drawDino(ctx, dinoRef.current);

    // HUD
    ctx.fillStyle = "#333";
    ctx.font = "bold 16px system-ui, -apple-system, Segoe UI, Roboto";
    ctx.textAlign = "right";
    ctx.fillText(`${score}`.padStart(5, "0"), W - 12, 24);

    if (!running) {
      ctx.textAlign = "center";
      ctx.fillText("Pulsa Espacio/Toque para iniciar", W / 2, 60);
    } else if (gameOver) {
      ctx.textAlign = "center";
      ctx.fillText("Game Over - Enter para reiniciar", W / 2, 60);
    }
  };

  const drawStart = (ctx) => {
    // Pantalla inicial estática antes de iniciar el loop
    ctx.fillStyle = "#f7f7f7";
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = "#8f8f8f";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, GROUND_Y + 1);
    ctx.lineTo(W, GROUND_Y + 1);
    ctx.stroke();
    // Dino de muestra
    drawDino(ctx, { x: 60, y: GROUND_Y, w: 40, h: 44 });
    ctx.fillStyle = "#333";
    ctx.font = "bold 16px system-ui, -apple-system, Segoe UI, Roboto";
    ctx.textAlign = "center";
    ctx.fillText("Pulsa Espacio/Toque para iniciar", W / 2, 60);
  };

  return (
    <div className="flex flex-col items-center gap-2 relative">
      <canvas ref={canvasRef} className="rounded-md border border-black/[.08] dark:border-white/[.145]"
        onTouchStart={() => { if (!runningRef.current) start(); else if (!gameOverRef.current) jump(); }}
      />
      <div className="text-sm text-center select-none">
        <p>Controles: Espacio/Toque para saltar</p>
      </div>
    </div>
  );
}

function drawDino(ctx, d) {
  ctx.save();
  ctx.translate(d.x, d.y);
  // cuerpo
  ctx.fillStyle = "#444";
  ctx.fillRect(-18, -36, 30, 24);
  // cabeza
  ctx.fillRect(6, -46, 18, 16);
  // pierna
  ctx.fillRect(-14, -12, 10, 12);
  ctx.fillRect(0, -12, 10, 12);
  // ojo
  ctx.fillStyle = "#fff";
  ctx.fillRect(18, -42, 4, 4);
  ctx.restore();
}

function drawCactus(ctx, x, y, w, h) {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillRect(-w / 2, -h, w, h);
  ctx.restore();
}

function rectsOverlap(ax, ay, aw, ah, bx, by, bw, bh) {
  return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
}

function rand(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }


