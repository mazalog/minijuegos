"use client";

import { useEffect, useRef, useState } from "react";

const W = 360;
const H = 640;
const ROAD_W = 220;
const LANE_W = ROAD_W / 3;
const LEFT_X = (W - ROAD_W) / 2;

const MAX_SPEED = 440;
const ACCEL = 380;
const BRAKE = 420;
const FUEL_MAX = 100;
const FUEL_CONSUMPTION_BASE = 4; // % por minuto base
const FUEL_PICKUP_AMOUNT = 30;
const OFFROAD_PENALTY_ZONE = 10; // px dentro del asfalto considerados borde

export default function RoadFighter({ attempts = 5, transactionId = "" }) {
  const canvasRef = useRef(null);
  const animRef = useRef(null);
  const lastRef = useRef(0);
  const runningRef = useRef(false);
  const gameOverRef = useRef(false);
  const keysRef = useRef({ left: false, right: false, up: false, down: false });
  const assetsRef = useRef({ car: null, obstacle: null });
  const audioCtxRef = useRef(null);
  const engineOscRef = useRef(null);
  const engineGainRef = useRef(null);

  const [running, setRunning] = useState(false);
  const [gameOver, setGameOver] = useState(false);
  const [score, setScore] = useState(0);
  const [attemptsLeft, setAttemptsLeft] = useState(attempts);

  const playerRef = useRef({ x: LEFT_X + LANE_W * 1.5, y: H - 80, w: 24, h: 40, vx: 0, speed: 0, fuel: FUEL_MAX, drift: 0 });
  const carsRef = useRef([]);
  const pickupsRef = useRef([]); // (desactivado) bidones de combustible
  const hazardsRef = useRef([]); // manchas de aceite
  const linesYRef = useRef(0);
  const attemptsLeftRef = useRef(attempts);
  const totalAttemptsRef = useRef(attempts);

  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    canvas.width = W * dpr; canvas.height = H * dpr;
    canvas.style.width = "100%"; canvas.style.height = "auto";
    ctx.scale(dpr, dpr);

    // Carga de imágenes
    const carImg = new Image(); carImg.src = "/road_car.svg";
    const obsImg = new Image(); obsImg.src = "/road_obstacle.svg";
    assetsRef.current = { car: carImg, obstacle: obsImg };

    const onKeyDown = (e) => {
      if (e.code === "ArrowLeft" || e.code === "KeyA") keysRef.current.left = true;
      if (e.code === "ArrowRight" || e.code === "KeyD") keysRef.current.right = true;
      if (e.code === "ArrowUp" || e.code === "KeyW") keysRef.current.up = true;
      if (e.code === "ArrowDown" || e.code === "KeyS") keysRef.current.down = true;
      if (e.code === "Enter" && !runningRef.current && attemptsLeftRef.current > 0) start();
    };
    const onKeyUp = (e) => {
      if (e.code === "ArrowLeft" || e.code === "KeyA") keysRef.current.left = false;
      if (e.code === "ArrowRight" || e.code === "KeyD") keysRef.current.right = false;
      if (e.code === "ArrowUp" || e.code === "KeyW") keysRef.current.up = false;
      if (e.code === "ArrowDown" || e.code === "KeyS") keysRef.current.down = false;
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    const releaseKeys = () => { keysRef.current.left = false; keysRef.current.right = false; keysRef.current.up = false; keysRef.current.down = false; };
    window.addEventListener("pointerup", releaseKeys);
    window.addEventListener("pointercancel", releaseKeys);

    drawStart(ctx);

    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("pointerup", releaseKeys);
      window.removeEventListener("pointercancel", releaseKeys);
      cancelAnimationFrame(animRef.current);
      // parar audio
      if (engineOscRef.current) {
        try { engineOscRef.current.stop(); } catch (_) {}
        engineOscRef.current.disconnect();
        engineGainRef.current?.disconnect();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const start = () => {
    if (attemptsLeftRef.current <= 0) return;
    setRunning(true); runningRef.current = true;
    setGameOver(false); gameOverRef.current = false;
    setScore(0);
    playerRef.current = { x: LEFT_X + LANE_W * 1.5, y: H - 80, w: 24, h: 40, vx: 0, speed: 180, fuel: FUEL_MAX, drift: 0 };
    carsRef.current = [];
    pickupsRef.current = [];
    hazardsRef.current = [];
    linesYRef.current = 0;
    lastRef.current = 0;
    ensureAudio();
    startEngine();
    animRef.current = requestAnimationFrame(loop);
  };

  const ensureAudio = () => {
    if (!audioCtxRef.current) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (Ctx) audioCtxRef.current = new Ctx();
    }
    if (audioCtxRef.current?.state === "suspended") audioCtxRef.current.resume().catch(() => {});
  };

  const startEngine = () => {
    const ctx = audioCtxRef.current; if (!ctx) return;
    stopEngine();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(120, ctx.currentTime);
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.08, ctx.currentTime + 0.2);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    engineOscRef.current = osc; engineGainRef.current = gain;
  };

  const stopEngine = () => {
    if (!engineOscRef.current) return;
    try {
      const ctx = audioCtxRef.current; const gain = engineGainRef.current;
      if (gain && ctx) gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.1);
      engineOscRef.current.stop(ctx ? ctx.currentTime + 0.2 : undefined);
    } catch (_) {}
    engineOscRef.current = null; engineGainRef.current = null;
  };

  const playCrash = () => {
    const ctx = audioCtxRef.current; if (!ctx) return;
    const o = ctx.createOscillator(); const g = ctx.createGain();
    o.type = "square"; o.frequency.setValueAtTime(200, ctx.currentTime);
    o.frequency.exponentialRampToValueAtTime(60, ctx.currentTime + 0.15);
    g.gain.setValueAtTime(0.2, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.2);
    o.connect(g).connect(ctx.destination); o.start(); o.stop(ctx.currentTime + 0.22);
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
    else setRunning(false);
  };

  const update = (dt) => {
    const p = playerRef.current;
    // Velocidad
    if (keysRef.current.up) p.speed = Math.min(MAX_SPEED, p.speed + ACCEL * dt);
    else if (keysRef.current.down) p.speed = Math.max(0, p.speed - BRAKE * dt);
    else p.speed = Math.max(60, p.speed - ACCEL * 0.4 * dt);

    // Movimiento lateral
    p.vx = 0;
    if (keysRef.current.left) p.vx -= 160;
    if (keysRef.current.right) p.vx += 160;
    // efecto de derrape
    p.drift *= Math.pow(0.4, dt);
    p.x += (p.vx + p.drift) * dt;
    // permitir un poco de offroad con penalización
    const roadLeft = LEFT_X + 6;
    const roadRight = LEFT_X + ROAD_W - 6 - p.w;
    if (p.x < roadLeft - 8) p.x = roadLeft - 8; // límite duro
    if (p.x > roadRight + 8) p.x = roadRight + 8;

    // Líneas de carretera
    linesYRef.current = (linesYRef.current + p.speed * dt) % 40;

    // Spawnear coches enemigos con probabilidad dependiente de velocidad
    if (Math.random() < 0.02 + p.speed / 10000) {
      const enemyW = 22;
      // Posiciones posibles: centros de carril y líneas separadoras
      const positions = [
        LEFT_X + (LANE_W - enemyW) / 2,                    // centro carril 1
        LEFT_X + LANE_W - enemyW / 2,                      // sobre línea 1
        LEFT_X + LANE_W + (LANE_W - enemyW) / 2,           // centro carril 2
        LEFT_X + 2 * LANE_W - enemyW / 2,                  // sobre línea 2
        LEFT_X + 2 * LANE_W + (LANE_W - enemyW) / 2        // centro carril 3
      ];
      const x = positions[Math.floor(Math.random() * positions.length)];
      const speed = p.speed * (0.7 + Math.random() * 0.5);
      carsRef.current.push({ x, y: -60, w: enemyW, h: 36, speed });
    }

    // Spawnear pickups (combustible) y hazards (aceite)
    // Combustible ilimitado: no generamos bidones
    if (Math.random() < 0.004) {
      const lane = Math.floor(Math.random() * 3);
      const x = LEFT_X + lane * LANE_W + (LANE_W - 22) / 2;
      hazardsRef.current.push({ x, y: -18, w: 22, h: 12, type: "oil" });
    }

    // Mover coches y detectar colisiones
    for (let i = carsRef.current.length - 1; i >= 0; i--) {
      const c = carsRef.current[i];
      c.y += (p.speed - c.speed) * dt + 140 * dt; // mundo baja + propio movimiento
      if (c.y > H + 60) carsRef.current.splice(i, 1);
      if (rectsOverlap(p.x, p.y, p.w, p.h, c.x, c.y, c.w, c.h)) {
        setGameOver(true); gameOverRef.current = true;
        stopEngine(); playCrash();
        attemptsLeftRef.current = Math.max(0, attemptsLeftRef.current - 1);
        setAttemptsLeft(attemptsLeftRef.current);
        if (attemptsLeftRef.current === 0) {
          try { console.log({ game: "Road Fighter", transactionId, totalPoints: score }); } catch (_) {}
        }
      }
    }

    // Mover pickups/hazards y colisiones
    // Sin pickups de combustible
    for (let i = hazardsRef.current.length - 1; i >= 0; i--) {
      const h = hazardsRef.current[i];
      h.y += 140 * dt + p.speed * 0.6 * dt;
      if (h.y > H + 30) hazardsRef.current.splice(i, 1);
      else if (rectsOverlap(p.x, p.y, p.w, p.h, h.x, h.y, h.w, h.h)) {
        // derrape aleatorio al tocar aceite
        p.drift = (Math.random() < 0.5 ? -1 : 1) * (120 + Math.random() * 80);
      }
    }

    // Penalización por offroad en bordes
    const distLeft = p.x - roadLeft;
    const distRight = roadRight - p.x;
    if (distLeft < OFFROAD_PENALTY_ZONE || distRight < OFFROAD_PENALTY_ZONE) {
      p.speed = Math.max(40, p.speed - 180 * dt);
    }

    // Consumo de combustible: base + proporcional a velocidad
    // Combustible ilimitado si se desea: comenta el bloque anterior y fija el combustible al máximo
    p.fuel = FUEL_MAX;
    if (false && p.fuel <= 0 && !gameOverRef.current) {
      setGameOver(true); gameOverRef.current = true;
      attemptsLeftRef.current = Math.max(0, attemptsLeftRef.current - 1);
      setAttemptsLeft(attemptsLeftRef.current);
      if (attemptsLeftRef.current === 0) {
        try { console.log({ game: "Road Fighter", transactionId, totalPoints: score }); } catch (_) {}
      }
    }

    // Puntuación por distancia
    setScore((s) => s + Math.floor(p.speed * dt / 8));

    // Actualizar pitch del motor según velocidad
    if (engineOscRef.current && audioCtxRef.current) {
      const freq = 80 + p.speed * 0.9; // mapear velocidad a tono
      engineOscRef.current.frequency.setValueAtTime(freq, audioCtxRef.current.currentTime);
    }
  };

  const render = (ctx) => {
    // Fondo
    ctx.fillStyle = "#5fc2e0"; ctx.fillRect(0, 0, W, H);
    // Pasto
    ctx.fillStyle = "#4fb64d"; ctx.fillRect(0, 0, LEFT_X, H); ctx.fillRect(LEFT_X + ROAD_W, 0, W - (LEFT_X + ROAD_W), H);
    // Carretera
    ctx.fillStyle = "#666"; ctx.fillRect(LEFT_X, 0, ROAD_W, H);
    // Líneas
    ctx.fillStyle = "#fff";
    for (let y = -40; y < H; y += 40) {
      ctx.fillRect(LEFT_X + LANE_W - 2, y + linesYRef.current, 4, 20);
      ctx.fillRect(LEFT_X + LANE_W * 2 - 2, y + linesYRef.current, 4, 20);
    }

    // Enemigos
    const obs = assetsRef.current.obstacle;
    if (obs && obs.complete) {
      for (const c of carsRef.current) ctx.drawImage(obs, c.x - 5, c.y - 2, c.w + 10, c.h + 4);
    } else {
      ctx.fillStyle = "#ff7b00";
      for (const c of carsRef.current) ctx.fillRect(c.x, c.y, c.w, c.h);
    }

    // Hazards (aceite)
    ctx.fillStyle = "#3b2f2f";
    for (const h of hazardsRef.current) ctx.fillRect(h.x, h.y, h.w, h.h);

    // (sin render de combustible)

    // Jugador
    const p = playerRef.current;
    const car = assetsRef.current.car;
    if (car && car.complete) ctx.drawImage(car, p.x - 6, p.y - 6, p.w + 12, p.h + 12);
    else { ctx.fillStyle = "#0d6efd"; ctx.fillRect(p.x, p.y, p.w, p.h); }

    // Botones táctiles simples
    ctx.textAlign = "center"; ctx.fillStyle = "#111";
    if (!running) {
      ctx.font = "14px system-ui, -apple-system, Segoe UI, Roboto";
      ctx.fillText("Toca para iniciar", W / 2, H - 16);
    }

    // HUD (sin barra de combustible)
    ctx.fillStyle = "#111"; ctx.font = "bold 18px system-ui, -apple-system, Segoe UI, Roboto";
    ctx.fillText(`Puntos: ${score}`, 10, 24);
    ctx.textAlign = "right"; ctx.fillText(`Intentos: ${attemptsLeft}`, W - 10, 24);

    if (!running) {
      ctx.textAlign = "center"; ctx.fillStyle = "#111";
      ctx.font = "bold 24px system-ui, -apple-system, Segoe UI, Roboto";
      ctx.fillText("Road Fighter", W / 2, H / 2 - 12);
      ctx.font = "16px system-ui, -apple-system, Segoe UI, Roboto";
      ctx.fillText("Enter o toque para comenzar", W / 2, H / 2 + 12);
    }
    if (gameOver) {
      ctx.fillStyle = "rgba(0,0,0,0.35)"; ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = "#fff"; ctx.textAlign = "center";
      ctx.font = "bold 22px system-ui, -apple-system, Segoe UI, Roboto";
      ctx.fillText("¡Choque!", W / 2, H / 2 - 8);
      ctx.font = "16px system-ui, -apple-system, Segoe UI, Roboto";
      if (attemptsLeftRef.current > 0) ctx.fillText("Pulsa Enter para el siguiente intento", W / 2, H / 2 + 16);
      else { ctx.fillText("Ronda terminada", W / 2, H / 2 + 16); ctx.fillText("No hay más intentos", W / 2, H / 2 + 38); }
    }
  };

  const drawStart = (ctx) => {
    ctx.fillStyle = "#5fc2e0"; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = "#4fb64d"; ctx.fillRect(0, 0, LEFT_X, H); ctx.fillRect(LEFT_X + ROAD_W, 0, W - (LEFT_X + ROAD_W), H);
    ctx.fillStyle = "#666"; ctx.fillRect(LEFT_X, 0, ROAD_W, H);
    ctx.fillStyle = "#fff";
    for (let y = 0; y < H; y += 40) {
      ctx.fillRect(LEFT_X + LANE_W - 2, y, 4, 20);
      ctx.fillRect(LEFT_X + LANE_W * 2 - 2, y, 4, 20);
    }
    ctx.fillStyle = "#111"; ctx.textAlign = "center";
    ctx.font = "bold 26px system-ui, -apple-system, Segoe UI, Roboto";
    ctx.fillText("Road Fighter", W / 2, H / 2 - 12);
    ctx.font = "16px system-ui, -apple-system, Segoe UI, Roboto";
    ctx.fillText("Enter o toque para comenzar", W / 2, H / 2 + 12);
  };

  return (
    <div className="flex flex-col items-center gap-2 relative">
      <canvas ref={canvasRef} className="rounded-lg shadow-md border border-black/[.08] dark:border-white/[.145]" style={{ width: "100%", height: "auto", touchAction: "none" }}
        onPointerDown={() => { if (!runningRef.current && attemptsLeftRef.current > 0) start(); }}
      />
      <div className="text-sm text-center select-none">
        <p>Controles: ←/→ mover, ↑ acelerar, ↓ frenar. Enter para iniciar</p>
      </div>
    </div>
  );
}

function rectsOverlap(ax, ay, aw, ah, bx, by, bw, bh) {
  return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
}


