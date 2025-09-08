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
// Voladores
const FLYER_MIN_GAP = 420;
const FLYER_MAX_GAP = 720;
const FREEZE_TIME = 1.4; // segundos congelado
// Fondo
const CLOUD_COUNT = 8;
// Separación mínima horizontal entre aéreo y terrestre para evitar solapamiento vertical
const SAFE_X_WINDOW = 160;

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
  const cloudsRef = useRef([]);
  const flyersRef = useRef([]);
  const nextFlyerGapRef = useRef(rand(FLYER_MIN_GAP, FLYER_MAX_GAP));
  const frozenTimerRef = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    canvas.width = W * dpr; canvas.height = H * dpr;
    canvas.style.width = `100%`; canvas.style.height = `auto`;
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
    // fondo inicial
    cloudsRef.current = Array.from({ length: CLOUD_COUNT }).map(() => ({
      x: Math.random() * W,
      y: 40 + Math.random() * 120,
      w: 30 + Math.random() * 40,
      h: 12 + Math.random() * 8,
      speed: 20 + Math.random() * 20,
    }));
    // voladores
    flyersRef.current = [];
    nextFlyerGapRef.current = rand(FLYER_MIN_GAP, FLYER_MAX_GAP);
    frozenTimerRef.current = 0;
    lastRef.current = 0;
    animRef.current = requestAnimationFrame(loop);
  };

  const jump = () => {
    if (frozenTimerRef.current > 0) return; // congelado, no puede saltar
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
    // actualizar congelación
    if (frozenTimerRef.current > 0) {
      frozenTimerRef.current = Math.max(0, frozenTimerRef.current - dt);
    }

    // mover cactus
    for (let i = cactiRef.current.length - 1; i >= 0; i--) {
      const c = cactiRef.current[i];
      c.x -= speedRef.current * dt;
      if (c.x + c.w < 0) cactiRef.current.splice(i, 1);
    }

    // mover voladores (horizontal + oscilación vertical + velocidad propia)
    for (let i = flyersRef.current.length - 1; i >= 0; i--) {
      const f = flyersRef.current[i];
      if (f.speed == null) f.speed = 60; // compatibilidad si ya existen
      if (f.amp == null) f.amp = 12;
      if (f.baseY == null) f.baseY = f.y;
      if (f.phase == null) f.phase = 0;
      if (f.vphase == null) f.vphase = 2;
      f.x -= (speedRef.current + f.speed) * dt;
      f.phase += f.vphase * dt;
      f.y = f.baseY + Math.sin(f.phase) * f.amp;
      if (f.x + f.w < 0) flyersRef.current.splice(i, 1);
    }

    // spawn cactus por distancia
    nextGapRef.current -= speedRef.current * dt;
    if (nextGapRef.current <= 0) {
      const w = rand(16, 24) * rand(1, 2); // cactus simple o doble ancho
      let spawnX = W + 10;
      // Evitar nacer debajo de un volador cercano
      for (const f of flyersRef.current) {
        if (Math.abs(f.x - spawnX) < SAFE_X_WINDOW) {
          spawnX = f.x + SAFE_X_WINDOW;
        }
      }
      cactiRef.current.push({ x: spawnX, y: GROUND_Y, w, h: 36 });
      nextGapRef.current = rand(CACTUS_MIN_GAP, CACTUS_MAX_GAP);
    }

    // spawn voladores por distancia
    nextFlyerGapRef.current -= speedRef.current * dt;
    if (nextFlyerGapRef.current <= 0) {
      const size = rand(24, 34);
      const baseY = GROUND_Y - rand(90, 140);
      let spawnX = W + 10;
      // Evitar nacer encima de un cactus cercano
      for (const c of cactiRef.current) {
        if (Math.abs(c.x - spawnX) < SAFE_X_WINDOW) {
          spawnX = c.x + SAFE_X_WINDOW;
        }
      }
      flyersRef.current.push({
        x: spawnX,
        y: baseY,
        baseY,
        w: size,
        h: size * 0.6,
        speed: 40 + Math.random() * 80,
        amp: 8 + Math.random() * 18,
        phase: Math.random() * Math.PI * 2,
        vphase: 1.5 + Math.random() * 2.5,
      });
      nextFlyerGapRef.current = rand(FLYER_MIN_GAP, FLYER_MAX_GAP);
    }

    // dino física
    const d = dinoRef.current;
    if (frozenTimerRef.current > 0) {
      // congelado: quieto en el suelo
      d.vy = 0;
      d.y = GROUND_Y;
      d.onGround = true;
    } else {
      d.vy += GRAVITY * dt;
      d.y += d.vy * dt;
      if (d.y >= GROUND_Y) { d.y = GROUND_Y; d.vy = 0; d.onGround = true; }
    }

    // colisiones
    for (const c of cactiRef.current) {
      if (rectsOverlap(d.x - d.w / 2, d.y - d.h, d.w, d.h, c.x - c.w / 2, c.y - c.h, c.w, c.h)) {
        setGameOver(true); gameOverRef.current = true;
        return;
      }
    }
    // colisión con voladores -> aplicar congelación
    for (let i = flyersRef.current.length - 1; i >= 0; i--) {
      const f = flyersRef.current[i];
      if (rectsOverlap(d.x - d.w / 2, d.y - d.h, d.w, d.h, f.x - f.w / 2, f.y - f.h, f.w, f.h)) {
        frozenTimerRef.current = FREEZE_TIME;
        flyersRef.current.splice(i, 1);
      }
    }

    // puntuación por tiempo
    setScore((s) => s + Math.floor(10 * dt));
  };

  const render = (ctx) => {
    // cielo y fondo
    const skyGrad = ctx.createLinearGradient(0, 0, 0, H);
    skyGrad.addColorStop(0, "#eaf6ff");
    skyGrad.addColorStop(1, "#f7f7f7");
    ctx.fillStyle = skyGrad; ctx.fillRect(0, 0, W, H);
    // nubes
    ctx.fillStyle = "#ffffff";
    for (const cl of cloudsRef.current) {
      cl.x -= cl.speed * 0.016; // suave parallax
      if (cl.x + cl.w < 0) { cl.x = W + rand(10, 80); cl.y = 30 + Math.random() * 130; }
      drawCloud(ctx, cl.x, cl.y, cl.w, cl.h);
    }

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

    // voladores
    ctx.fillStyle = "#444c7a";
    for (const f of flyersRef.current) {
      drawFlyer(ctx, f.x, f.y, f.w, f.h);
    }

    // dino (simple pixel art vector)
    drawDino(ctx, dinoRef.current);

    // indicador de congelación
    if (frozenTimerRef.current > 0) {
      ctx.fillStyle = "rgba(80,140,255,0.15)";
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = "#3b5edb";
      ctx.font = "bold 14px system-ui, -apple-system, Segoe UI, Roboto";
      ctx.textAlign = "left";
      ctx.fillText("Congelado", 10, 22);
    }

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
    const skyGrad = ctx.createLinearGradient(0, 0, 0, H);
    skyGrad.addColorStop(0, "#eaf6ff");
    skyGrad.addColorStop(1, "#f7f7f7");
    ctx.fillStyle = skyGrad; ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = "#8f8f8f";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, GROUND_Y + 1);
    ctx.lineTo(W, GROUND_Y + 1);
    ctx.stroke();
    // algunas nubes
    for (let i = 0; i < 6; i++) drawCloud(ctx, 40 + i * 90, 50 + (i % 2) * 20, 36, 12);
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

function drawCloud(ctx, x, y, w, h) {
  ctx.save();
  ctx.translate(x, y);
  ctx.beginPath();
  ctx.ellipse(0, 0, w * 0.6, h, 0, 0, Math.PI * 2);
  ctx.ellipse(-w * 0.4, 2, w * 0.35, h * 0.85, 0, 0, Math.PI * 2);
  ctx.ellipse(w * 0.35, 2, w * 0.35, h * 0.85, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawFlyer(ctx, x, y, w, h) {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillRect(-w / 2, -h * 0.5, w, h * 0.5); // cuerpo
  // alas
  ctx.beginPath();
  ctx.moveTo(-w / 2, -h * 0.2);
  ctx.lineTo(0, -h);
  ctx.lineTo(w / 2, -h * 0.2);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}


