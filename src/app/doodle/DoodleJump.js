"use client";

import { useEffect, useRef, useState } from "react";
import { fetchTransactionById } from "../../lib/firebase";

const CANVAS_W = 360;
const CANVAS_H = 640;

// Física (px/s y px/s^2)
const GRAVITY = 1800;
const JUMP_VELOCITY = -700;
const H_MOVE_SPEED = 220;

// Plataformas
const PLATFORM_WIDTH_MIN = 55;
const PLATFORM_WIDTH_MAX = 85;
const PLATFORM_HEIGHT = 12;
const PLATFORM_GAP_Y = 80; // distancia vertical aproximada
const PLATFORM_X_PADDING = 12;

// Extras
const MOVING_PLATFORM_SPEED_MIN = 30;
const MOVING_PLATFORM_SPEED_MAX = 60;
const SPRING_BOOST = -1000;
const ENEMY_SPEED = 60;
const ENEMY_SPAWN_GAP_ALT = 800; // cada cuánto de altura aparece un enemigo
const BULLET_SPEED = 520;
const SHOOT_COOLDOWN_MS = 240;
const MAX_ATTEMPTS = 5; // número de intentos por ronda
const CLOUD_COUNT = 7;
const CLOUD_SPEED_MIN = 8;
const CLOUD_SPEED_MAX = 18;

export default function DoodleJump({ attempts = 5, transactionId = "" }) {
  const canvasRef = useRef(null);
  const animRef = useRef(null);
  const lastTimeRef = useRef(0);
  const keysRef = useRef({ left: false, right: false });
  const lastShotRef = useRef(0);
  const runningRef = useRef(false);
  const gameOverRef = useRef(false);
  const isTouchRef = useRef(false);

  const [running, setRunning] = useState(false);
  const [gameOver, setGameOver] = useState(false);
  const [score, setScore] = useState(0);
  const [attemptsLeft, setAttemptsLeft] = useState(attempts);
  const [roundTotal, setRoundTotal] = useState(0);

  const playerRef = useRef({ x: CANVAS_W / 2, y: CANVAS_H - 60, vx: 0, vy: 0, w: 32, h: 32 });
  const platformsRef = useRef([]);
  const maxAltitudeRef = useRef(0);
  const enemiesRef = useRef([]);
  const bulletsRef = useRef([]);
  const nextEnemyAltRef = useRef(ENEMY_SPAWN_GAP_ALT);
  const attemptsLeftRef = useRef(attempts);
  const roundTotalRef = useRef(0);
  const handledGameOverRef = useRef(false);
  const cloudsRef = useRef([]);
  const scoreRef = useRef(0);
  const totalAttemptsRef = useRef(attempts);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const dpr = Math.max(window.devicePixelRatio || 1, 1);
    canvas.width = CANVAS_W * dpr;
    canvas.height = CANVAS_H * dpr;
    canvas.style.width = `100%`;
    canvas.style.height = `auto`;
    ctx.scale(dpr, dpr);

    const onKeyDown = (e) => {
      if (e.code === "ArrowLeft" || e.code === "KeyA") keysRef.current.left = true;
      if (e.code === "ArrowRight" || e.code === "KeyD") keysRef.current.right = true;
      if (e.code === "Enter" && !runningRef.current && attemptsLeftRef.current > 0) start();
      if (e.code === "Space" && runningRef.current && !gameOverRef.current) shoot();
    };
    const onKeyUp = (e) => {
      if (e.code === "ArrowLeft" || e.code === "KeyA") keysRef.current.left = false;
      if (e.code === "ArrowRight" || e.code === "KeyD") keysRef.current.right = false;
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);

    // liberar controles si el usuario levanta el dedo fuera de los botones
    const releaseKeys = (e) => { keysRef.current.left = false; keysRef.current.right = false; };
    window.addEventListener("pointerup", releaseKeys);
    window.addEventListener("pointercancel", releaseKeys);

    // detectar touch
    const handleFirstTouch = () => { isTouchRef.current = true; window.removeEventListener("touchstart", handleFirstTouch); };
    window.addEventListener("touchstart", handleFirstTouch, { passive: true });

    drawStart(ctx);

    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      cancelAnimationFrame(animRef.current);
      window.removeEventListener("pointerup", releaseKeys);
      window.removeEventListener("pointercancel", releaseKeys);
      window.removeEventListener("touchstart", handleFirstTouch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Consultar Firestore por transactionId recibido
  useEffect(() => {
    let active = true;
    (async () => {
      if (!transactionId) return;
      try {
        const tx = await fetchTransactionById(transactionId);
        if (!active) return;
        // eslint-disable-next-line no-console
        console.log("[DoodleJump] TX", transactionId, tx || "NOT_FOUND");
      } catch (_) {}
    })();
    return () => { active = false; };
  }, [transactionId]);

  const start = () => {
    if (attemptsLeftRef.current <= 0) return;
    setRunning(true); runningRef.current = true;
    setGameOver(false); gameOverRef.current = false;
    setScore(0);
    scoreRef.current = 0;
    playerRef.current = { x: CANVAS_W / 2, y: CANVAS_H - 80, vx: 0, vy: JUMP_VELOCITY, w: 32, h: 32 };
    platformsRef.current = generateInitialPlatforms();
    enemiesRef.current = [];
    bulletsRef.current = [];
    maxAltitudeRef.current = 0;
    nextEnemyAltRef.current = ENEMY_SPAWN_GAP_ALT;
    lastTimeRef.current = 0;
    initClouds();
    handledGameOverRef.current = false;
    animRef.current = requestAnimationFrame(loop);
  };

  const loop = (ts) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!lastTimeRef.current) lastTimeRef.current = ts;
    const deltaMs = Math.min(50, ts - lastTimeRef.current);
    lastTimeRef.current = ts;
    update(deltaMs / 1000);
    render(ctx);
    if (!gameOverRef.current) {
      animRef.current = requestAnimationFrame(loop);
    } else {
      setRunning(false); runningRef.current = false;
      drawGameOver(ctx);
    }
  };

  const update = (dt) => {
    if (gameOverRef.current) return;
    const p = playerRef.current;
    const keys = keysRef.current;
    updateClouds(dt);
    // Movimiento horizontal
    p.vx = 0;
    if (keys.left) p.vx -= H_MOVE_SPEED;
    if (keys.right) p.vx += H_MOVE_SPEED;
    p.x += p.vx * dt;
    // Envoltura lateral
    if (p.x < -p.w / 2) p.x = CANVAS_W + p.w / 2;
    if (p.x > CANVAS_W + p.w / 2) p.x = -p.w / 2;

    // Gravedad y salto en plataformas
    p.vy += GRAVITY * dt;
    p.y += p.vy * dt;

    // Colisiones con plataformas (solo cuando cae)
    if (p.vy > 0) {
      for (const pl of platformsRef.current) {
        const withinX = p.x + p.w / 2 > pl.x && p.x - p.w / 2 < pl.x + pl.w;
        const feetPrev = p.y - p.vy * dt + p.h / 2;
        const feetNow = p.y + p.h / 2;
        if (withinX && feetPrev <= pl.y && feetNow >= pl.y) {
          p.y = pl.y - p.h / 2;
          p.vy = pl.type === "spring" ? SPRING_BOOST : JUMP_VELOCITY;
        }
      }
    }

    // Mover plataformas móviles y rebotar en bordes
    for (const pl of platformsRef.current) {
      if (pl.type === "moving") {
        pl.x += pl.vx * dt;
        if (pl.x < PLATFORM_X_PADDING || pl.x + pl.w > CANVAS_W - PLATFORM_X_PADDING) {
          pl.vx *= -1;
          pl.x = Math.max(PLATFORM_X_PADDING, Math.min(pl.x, CANVAS_W - PLATFORM_X_PADDING - pl.w));
        }
      }
    }

    // Cámara: si el jugador sube por encima del umbral, desplazar mundo hacia abajo
    const cameraThreshold = CANVAS_H * 0.4;
    if (p.y < cameraThreshold) {
      const dy = cameraThreshold - p.y;
      p.y = cameraThreshold;
      // bajar plataformas y acumular puntuación por altura subida
      for (const pl of platformsRef.current) pl.y += dy;
      for (const en of enemiesRef.current) en.y += dy;
      for (const b of bulletsRef.current) b.y += dy;
      maxAltitudeRef.current += dy;
      scoreRef.current = Math.floor(maxAltitudeRef.current / 20);
      setScore(scoreRef.current);
      // eliminar plataformas fuera de pantalla y crear nuevas arriba
      platformsRef.current = platformsRef.current.filter((pl) => pl.y < CANVAS_H + 40);
      spawnPlatformsAbove();
      // spawnear enemigos por altura alcanzada
      if (maxAltitudeRef.current >= nextEnemyAltRef.current) {
        spawnEnemyAbove();
        const diff = getDifficulty();
        const gapAlt = Math.max(300, ENEMY_SPAWN_GAP_ALT - Math.floor(300 * diff));
        nextEnemyAltRef.current += gapAlt;
      }
    }

    // Bullets
    for (let i = bulletsRef.current.length - 1; i >= 0; i--) {
      const b = bulletsRef.current[i];
      b.y += -BULLET_SPEED * dt;
      if (b.y < -20) bulletsRef.current.splice(i, 1);
    }

    // Enemies
    for (let i = enemiesRef.current.length - 1; i >= 0; i--) {
      const en = enemiesRef.current[i];
      en.x += en.vx * dt;
      if (en.x < -en.w) en.x = CANVAS_W;
      if (en.x > CANVAS_W) en.x = -en.w;
    }

    // Colisión bala-enemigo
    for (let i = bulletsRef.current.length - 1; i >= 0; i--) {
      const b = bulletsRef.current[i];
      for (let j = enemiesRef.current.length - 1; j >= 0; j--) {
        const en = enemiesRef.current[j];
        if (b.x > en.x && b.x < en.x + en.w && b.y > en.y && b.y < en.y + en.h) {
          enemiesRef.current.splice(j, 1);
          bulletsRef.current.splice(i, 1);
          break;
        }
      }
    }

    // Colisión jugador-enemigo: tocar el objeto morado SIEMPRE hace perder
    for (const en of enemiesRef.current) {
      const playerLeft = p.x - p.w / 2;
      const playerRight = p.x + p.w / 2;
      const playerTop = p.y - p.h / 2;
      const playerBottom = p.y + p.h / 2;
      const enemyLeft = en.x;
      const enemyRight = en.x + en.w;
      const enemyTop = en.y;
      const enemyBottom = en.y + en.h;
      const overlap = playerLeft < enemyRight && playerRight > enemyLeft && playerTop < enemyBottom && playerBottom > enemyTop;
      if (overlap) {
        setGameOver(true); gameOverRef.current = true;
        onGameOver();
        break;
      }
    }

    // Fin del juego si cae abajo
    if (p.y - p.h / 2 > CANVAS_H) {
      setGameOver(true); gameOverRef.current = true;
      onGameOver();
    }
  };

  const onGameOver = () => {
    if (handledGameOverRef.current) return;
    handledGameOverRef.current = true;
    const newAttempts = Math.max(0, attemptsLeftRef.current - 1);
    attemptsLeftRef.current = newAttempts;
    setAttemptsLeft(newAttempts);
    const newTotal = roundTotalRef.current + Math.floor(maxAltitudeRef.current / 20);
    roundTotalRef.current = newTotal;
    setRoundTotal(newTotal);
    // Si ya no quedan intentos, reportar el resultado por consola
    if (newAttempts === 0) {
      try {
        // Reporte básico: nombre del juego, transactionId y total de puntos
        // Nota: transactionId se recibe por props
        // eslint-disable-next-line no-console
        console.log({ game: "Doodle Jump", transactionId, totalPoints: newTotal });
      } catch (_) {}
    }
  };

  const generateInitialPlatforms = () => {
    const platforms = [];
    // plataforma base
    platforms.push({ x: CANVAS_W / 2 - 40, y: CANVAS_H - 40, w: 80, h: PLATFORM_HEIGHT, type: "static" });
    let y = CANVAS_H - 120;
    while (y > -CANVAS_H) {
      const { widthMin, widthMax, gapY } = getDynamicPlatformParams();
      const w = rand(widthMin, widthMax);
      const x = rand(PLATFORM_X_PADDING, CANVAS_W - PLATFORM_X_PADDING - w);
      platforms.push(createPlatform(x, y, w));
      y -= rand(gapY - 20, gapY + 20);
    }
    return platforms;
  };

  const spawnPlatformsAbove = () => {
    // asegurar que haya plataformas suficientes
    const highestY = Math.min(...platformsRef.current.map((pl) => pl.y));
    const { widthMin, widthMax, gapY } = getDynamicPlatformParams();
    let y = highestY - rand(gapY - 20, gapY + 20);
    while (y > -CANVAS_H) {
      const w = rand(widthMin, widthMax);
      const x = rand(PLATFORM_X_PADDING, CANVAS_W - PLATFORM_X_PADDING - w);
      platformsRef.current.push(createPlatform(x, y, w));
      y -= rand(gapY - 20, gapY + 20);
    }
  };

  function createPlatform(x, y, w) {
    // probabilidades de tipo
    const r = Math.random();
    const diff = getDifficulty();
    const movingProb = 0.18 + diff * 0.18; // aumenta con la altura
    const springProb = 0.34 + diff * 0.10;
    if (r < movingProb) {
      // móvil
      const speedBoost = Math.floor(30 * diff);
      const speed = (rand(MOVING_PLATFORM_SPEED_MIN, MOVING_PLATFORM_SPEED_MAX) + speedBoost) * (Math.random() < 0.5 ? -1 : 1);
      return { x, y, w, h: PLATFORM_HEIGHT, type: "moving", vx: speed };
    } else if (r < springProb) {
      // con resorte
      return { x, y, w, h: PLATFORM_HEIGHT, type: "spring" };
    }
    return { x, y, w, h: PLATFORM_HEIGHT, type: "static" };
  }

  function spawnEnemyAbove() {
    const w = 34, h = 26;
    const x = rand(0, CANVAS_W - w);
    const y = Math.min(...platformsRef.current.map((pl) => pl.y)) - rand(60, 140);
    const vx = Math.random() < 0.5 ? -ENEMY_SPEED : ENEMY_SPEED;
    enemiesRef.current.push({ x, y, w, h, vx });
  }

  function shoot() {
    const now = performance.now();
    if (now - lastShotRef.current < SHOOT_COOLDOWN_MS) return;
    lastShotRef.current = now;
    const p = playerRef.current;
    bulletsRef.current.push({ x: p.x, y: p.y - p.h / 2 });
  }

  // --- Nubes y dificultad dinámica ---
  function initClouds() {
    const arr = [];
    let x = 0;
    for (let i = 0; i < CLOUD_COUNT; i++) {
      const w = rand(40, 80);
      const h = rand(16, 28);
      const y = rand(20, 220);
      const speed = rand(CLOUD_SPEED_MIN, CLOUD_SPEED_MAX) / 10;
      arr.push({ x, y, w, h, speed, alpha: 0.9 });
      x += rand(60, 120);
    }
    cloudsRef.current = arr;
  }

  function updateClouds(dt) {
    const arr = cloudsRef.current;
    if (!arr.length) return;
    for (const c of arr) {
      c.x -= c.speed * 60 * dt;
    }
    for (let i = 0; i < arr.length; i++) {
      const c = arr[i];
      if (c.x + c.w < -20) {
        const lastX = Math.max(...arr.map(v => v.x + v.w));
        c.x = lastX + rand(60, 120);
        c.y = rand(20, 220);
        c.w = rand(40, 80);
        c.h = rand(16, 28);
        c.speed = rand(CLOUD_SPEED_MIN, CLOUD_SPEED_MAX) / 10;
      }
    }
  }

  function renderClouds(ctx) {
    for (const c of cloudsRef.current) {
      ctx.save();
      ctx.globalAlpha = c.alpha;
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.ellipse(c.x + c.w * 0.3, c.y, c.w * 0.3, c.h * 0.8, 0, 0, Math.PI * 2);
      ctx.ellipse(c.x + c.w * 0.55, c.y - c.h * 0.2, c.w * 0.35, c.h, 0, 0, Math.PI * 2);
      ctx.ellipse(c.x + c.w * 0.78, c.y, c.w * 0.28, c.h * 0.7, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  function getDifficulty() {
    // 0.0 -> 1.0 en función de la altura (0 .. 6000 px)
    const norm = clamp(maxAltitudeRef.current / 6000, 0, 1);
    return norm;
  }

  function getDynamicPlatformParams() {
    const diff = getDifficulty();
    const widthMin = Math.max(38, Math.floor(PLATFORM_WIDTH_MIN - 20 * diff));
    const widthMax = Math.max(widthMin + 10, Math.floor(PLATFORM_WIDTH_MAX - 25 * diff));
    const gapY = Math.floor(PLATFORM_GAP_Y + 60 * diff);
    return { widthMin, widthMax, gapY };
  }

  const render = (ctx) => {
    // fondo
    const sky = ctx.createLinearGradient(0, 0, 0, CANVAS_H);
    sky.addColorStop(0, "#9ae1ff");
    sky.addColorStop(1, "#e7f7ff");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

    // nubes
    renderClouds(ctx);

    // plataformas
    for (const pl of platformsRef.current) {
      if (pl.type === "spring") {
        ctx.fillStyle = "#8ad4ff";
        ctx.strokeStyle = "#6aa5cc";
      } else if (pl.type === "moving") {
        ctx.fillStyle = "#ffcd6b";
        ctx.strokeStyle = "#d5a84f";
      } else {
        ctx.fillStyle = "#56c271";
        ctx.strokeStyle = "#3d9e57";
      }
      ctx.lineWidth = 2;
      ctx.fillRect(pl.x, pl.y, pl.w, pl.h);
      ctx.strokeRect(pl.x + 1, pl.y + 1, pl.w - 2, pl.h - 2);
      if (pl.type === "spring") {
        // dibujar muelle simple encima
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(pl.x + pl.w / 2 - 6, pl.y - 6, 12, 6);
      }
    }

    // jugador
    const p = playerRef.current;
    ctx.save();
    ctx.translate(p.x, p.y);
    // cuerpo
    ctx.fillStyle = "#ffcc00";
    ctx.beginPath();
    ctx.roundRect(-p.w / 2, -p.h / 2, p.w, p.h, 8);
    ctx.fill();
    // ojos
    ctx.fillStyle = "#fff";
    ctx.beginPath(); ctx.arc(-6, -6, 4, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(6, -6, 4, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#222";
    ctx.beginPath(); ctx.arc(-5, -6, 2, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(7, -6, 2, 0, Math.PI * 2); ctx.fill();
    // pie
    ctx.fillStyle = "#f5b400";
    ctx.fillRect(-10, p.h / 2 - 6, 20, 6);
    ctx.restore();

    // enemigos
    for (const en of enemiesRef.current) {
      ctx.fillStyle = "#7a5cff";
      ctx.fillRect(en.x, en.y, en.w, en.h);
      ctx.fillStyle = "#fff";
      ctx.fillRect(en.x + 6, en.y + 6, 6, 6);
      ctx.fillRect(en.x + en.w - 12, en.y + 6, 6, 6);
    }

    // balas
    ctx.fillStyle = "#333";
    for (const b of bulletsRef.current) {
      ctx.fillRect(b.x - 2, b.y - 6, 4, 12);
    }

    // HUD
    ctx.fillStyle = "#1a1a1a";
    ctx.font = "bold 22px system-ui, -apple-system, Segoe UI, Roboto";
    ctx.textAlign = "left";
    ctx.fillText(`Puntos: ${scoreRef.current}`, 12, 28);
    ctx.font = "600 16px system-ui, -apple-system, Segoe UI, Roboto";
    ctx.textAlign = "right";
    ctx.fillText(`Intentos: ${attemptsLeftRef.current}  |  Total: ${roundTotalRef.current}`, CANVAS_W - 12, 26);
  };

  const drawStart = (ctx) => {
    ctx.fillStyle = "#9ae1ff";
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
    ctx.fillStyle = "#1a1a1a";
    ctx.textAlign = "center";
    ctx.font = "bold 28px system-ui, -apple-system, Segoe UI, Roboto";
    ctx.fillText("Doodle Jump", CANVAS_W / 2, CANVAS_H / 2 - 16);
    ctx.font = "16px system-ui, -apple-system, Segoe UI, Roboto";
    ctx.fillText("Flechas/A-D para moverse", CANVAS_W / 2, CANVAS_H / 2 + 12);
    ctx.fillText("Espacio para disparar", CANVAS_W / 2, CANVAS_H / 2 + 34);
    ctx.fillText("Enter para comenzar", CANVAS_W / 2, CANVAS_H / 2 + 56);
    ctx.fillText(`Intentos disponibles: ${attemptsLeftRef.current}`, CANVAS_W / 2, CANVAS_H / 2 + 80);
    ctx.fillText(`Total acumulado: ${roundTotalRef.current}`, CANVAS_W / 2, CANVAS_H / 2 + 102);
  };

  // Pantalla de Game Over con total de la ronda
  const drawGameOver = (ctx) => {
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
    ctx.fillStyle = "#fff";
    ctx.textAlign = "center";
    ctx.font = "bold 26px system-ui, -apple-system, Segoe UI, Roboto";
    ctx.fillText("¡Game Over!", CANVAS_W / 2, CANVAS_H / 2 - 20);
    ctx.font = "16px system-ui, -apple-system, Segoe UI, Roboto";
    ctx.fillText(`Puntos intento: ${Math.floor(maxAltitudeRef.current / 20)}`, CANVAS_W / 2, CANVAS_H / 2 + 6);
    ctx.fillText(`Total acumulado: ${roundTotalRef.current}`, CANVAS_W / 2, CANVAS_H / 2 + 28);
    if (attemptsLeftRef.current > 0) {
      ctx.fillText(`Intentos restantes: ${attemptsLeftRef.current}`, CANVAS_W / 2, CANVAS_H / 2 + 50);
      ctx.fillText("Pulsa Enter para el siguiente intento", CANVAS_W / 2, CANVAS_H / 2 + 72);
    } else {
      ctx.fillText("Ronda terminada", CANVAS_W / 2, CANVAS_H / 2 + 50);
      ctx.fillText("No hay más intentos disponibles", CANVAS_W / 2, CANVAS_H / 2 + 72);
    }
  };

  return (
    <div className="flex flex-col items-center gap-2 relative">
      <canvas
        ref={canvasRef}
        className="rounded-lg shadow-md border border-black/[.08] dark:border-white/[.145]"
        style={{ touchAction: "none", width: "100%", height: "auto" }}
        onPointerDown={(e) => { e.preventDefault(); if (runningRef.current && !gameOverRef.current) { shoot(); } else if (!runningRef.current && attemptsLeftRef.current > 0) { start(); } }}
      />
      <div className="text-sm text-center select-none">
        <p>Controles: Flechas/A-D o botones; Espacio para disparar; Enter para empezar</p>
      </div>
      {/* Controles táctiles */}
      <div className="pointer-events-auto select-none" style={{ position: "absolute", bottom: 16, left: 0, right: 0, display: isTouchRef.current ? "flex" : "none", justifyContent: "space-between", gap: 12, padding: 12 }}>
        <button
          onPointerDown={(e) => { e.preventDefault(); keysRef.current.left = true; }}
          onPointerUp={(e) => { e.preventDefault(); keysRef.current.left = false; }}
          className="rounded-full bg-black/45 text-white px-6 py-5"
        >
          ◀︎
        </button>
        <button
          onPointerDown={(e) => { e.preventDefault(); if (runningRef.current && !gameOverRef.current) shoot(); else if (!runningRef.current && attemptsLeftRef.current > 0) start(); }}
          className="rounded-full bg-black/45 text-white px-6 py-5"
        >
          ●
        </button>
        <button
          onPointerDown={(e) => { e.preventDefault(); keysRef.current.right = true; }}
          onPointerUp={(e) => { e.preventDefault(); keysRef.current.right = false; }}
          className="rounded-full bg-black/45 text-white px-6 py-5"
        >
          ▶︎
        </button>
      </div>
    </div>
  );
}

function rand(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }



