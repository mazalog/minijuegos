"use client";

import { useEffect, useRef, useState } from "react";

const GAME_WIDTH = 360;
const GAME_HEIGHT = 640;
// Física en unidades por segundo
const GRAVITY_PX_S2 = 2200;    // aceleración hacia abajo (aún más rápida)
const FLAP_VELOCITY = -520;    // impulso vertical al aletear (acompaña mayor gravedad)
const PIPE_GAP = 210;          // hueco entre tuberías (más grande)
const PIPE_WIDTH = 60;
const PIPE_INTERVAL_MS = 1300; // base más rápida
const BIRD_X = 84;             // posición fija del pájaro en X
const PIPE_SPEED_BASE = 150;   // mucho más rápido al inicio
const CLOUD_SPEED_FACTOR = 0.30;
const HILL_SPEED_FACTOR = 0.60;

function getRandomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export default function FlappyBird({ attempts = 5, transactionId = "" }) {
  const canvasRef = useRef(null);
  const animationRef = useRef(null);
  const lastSpawnRef = useRef(0);
  const lastTimeRef = useRef(0);
  const timeRef = useRef(0);
  const audioCtxRef = useRef(null);

  const [isRunning, setIsRunning] = useState(false);
  const [isGameOver, setIsGameOver] = useState(false);
  const [score, setScore] = useState(0);
  const [attemptsLeft, setAttemptsLeft] = useState(attempts);
  const [roundTotal, setRoundTotal] = useState(0);

  const birdRef = useRef({ y: GAME_HEIGHT / 2, vy: 0, r: 14 });
  const pipesRef = useRef([]);
  const isRunningRef = useRef(false);
  const isGameOverRef = useRef(false);
  const speedRef = useRef(PIPE_SPEED_BASE);
  const bgRef = useRef({ clouds: [], hills: [] });
  const scoreRef = useRef(0);
  const attemptsLeftRef = useRef(attempts);
  const roundTotalRef = useRef(0);
  const handledGameOverRef = useRef(false);
  const totalAttemptsRef = useRef(attempts);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    let devicePixelRatio = Math.max(window.devicePixelRatio || 1, 1);

    // Size canvas for crisp rendering
    canvas.width = GAME_WIDTH * devicePixelRatio;
    canvas.height = GAME_HEIGHT * devicePixelRatio;
    canvas.style.width = `100%`;
    canvas.style.height = `auto`;
    ctx.scale(devicePixelRatio, devicePixelRatio);

    const handleKey = (e) => {
      if (e.code === "Space" || e.code === "ArrowUp") {
        e.preventDefault();
        if (!isRunningRef.current && attemptsLeftRef.current > 0) start();
        else onFlap();
      } else if (e.code === "Enter") {
        e.preventDefault();
        if (!isRunningRef.current && attemptsLeftRef.current > 0) start();
      }
    };

    const handlePointer = (e) => { e.preventDefault(); onFlap(); };

    window.addEventListener("keydown", handleKey);
    canvas.addEventListener("pointerdown", handlePointer, { passive: false });

    drawStartScreen(ctx);

    return () => {
      window.removeEventListener("keydown", handleKey);
      canvas.removeEventListener("pointerdown", handlePointer);
      cancelAnimationFrame(animationRef.current);
    };
    // We intentionally exclude deps to set up once
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Cargar récord local
  // Sin récord: no guardamos ni mostramos mejores puntuaciones

  const ensureAudioContext = () => {
    if (!audioCtxRef.current) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (Ctx) {
        audioCtxRef.current = new Ctx();
      }
    }
    if (audioCtxRef.current?.state === "suspended") {
      audioCtxRef.current.resume().catch(() => {});
    }
  };

  const playSound = (type) => {
    const ctx = audioCtxRef.current;
    if (!ctx) return;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type === "flap" ? "square" : type === "score" ? "triangle" : "sawtooth";
    let startFreq = 600, endFreq = 900, duration = 0.12;
    if (type === "score") { startFreq = 800; endFreq = 1100; duration = 0.14; }
    if (type === "hit") { startFreq = 220; endFreq = 110; duration = 0.18; }
    o.frequency.setValueAtTime(startFreq, ctx.currentTime);
    o.frequency.exponentialRampToValueAtTime(Math.max(50, endFreq), ctx.currentTime + duration);
    g.gain.setValueAtTime(0.001, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.2, ctx.currentTime + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);
    o.connect(g).connect(ctx.destination);
    o.start();
    o.stop(ctx.currentTime + duration + 0.02);
  };

  const start = () => {
    if (attemptsLeftRef.current <= 0) return;
    ensureAudioContext();
    setIsRunning(true); isRunningRef.current = true;
    setIsGameOver(false); isGameOverRef.current = false;
    setScore(0);
    scoreRef.current = 0;
    birdRef.current = { y: GAME_HEIGHT / 2, vy: 0, r: 14 };
    pipesRef.current = [];
    lastTimeRef.current = 0;
    lastSpawnRef.current = 0;
    timeRef.current = 0;
    speedRef.current = PIPE_SPEED_BASE;
    initBackground();
    handledGameOverRef.current = false;
    animationRef.current = requestAnimationFrame(loop);
  };

  const onFlap = () => {
    ensureAudioContext();
    if (!isRunningRef.current) {
      start();
      return;
    }
    if (isGameOverRef.current) return;
    birdRef.current.vy = FLAP_VELOCITY;
    playSound("flap");
  };

  const loop = (timestamp) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");

    if (!lastTimeRef.current) lastTimeRef.current = timestamp;
    const delta = Math.min(50, timestamp - lastTimeRef.current); // capear picos
    lastTimeRef.current = timestamp;
    lastSpawnRef.current += delta;
    timeRef.current += delta;

    update(delta);
    render(ctx);

    if (!isGameOverRef.current) {
      animationRef.current = requestAnimationFrame(loop);
    } else {
      setIsRunning(false); isRunningRef.current = false;
      drawGameOver(ctx);
    }
  };

  const update = (deltaMs) => {
    const dt = deltaMs / 1000; // segundos
    const bird = birdRef.current;
    const pipes = pipesRef.current;

    updateBackground(dt);

    // Spawn pipes con intervalo dinámico basado en la velocidad
    const currentSpeed = speedRef.current;
    const dynamicInterval = Math.max(800, PIPE_INTERVAL_MS * (PIPE_SPEED_BASE / Math.max(1, currentSpeed)));
    if (lastSpawnRef.current >= dynamicInterval) {
      lastSpawnRef.current = 0;
      // Reducir ligeramente el hueco con la puntuación para evitar que se vuelva fácil
      const effectiveGap = Math.max(150, PIPE_GAP - Math.min(60, Math.floor(scoreRef.current * 1.1)));
      const centerY = getRandomInt(120, GAME_HEIGHT - 120);
      const topHeight = Math.max(40, centerY - effectiveGap / 2);
      const bottomY = centerY + effectiveGap / 2;
      const bottomHeight = Math.max(40, GAME_HEIGHT - bottomY);
      pipes.push({ x: GAME_WIDTH + 20, topHeight, bottomY, bottomHeight, passed: false });
    }

    // Update pipes
    for (let i = pipes.length - 1; i >= 0; i--) {
      const p = pipes[i];
      p.x -= speedRef.current * dt;
      if (p.x + PIPE_WIDTH < 0) pipes.splice(i, 1);
      // Scoring
      if (!p.passed && p.x + PIPE_WIDTH < BIRD_X - bird.r) {
        p.passed = true;
        scoreRef.current += 1;
        setScore(scoreRef.current);
        playSound("score");
        // subida de dificultad progresiva más marcada
        speedRef.current = Math.min(speedRef.current + 4, 260);
      }
    }

    // Physics
    bird.vy += GRAVITY_PX_S2 * dt;
    bird.y += bird.vy * dt;

    // Collisions with ground/ceiling
    if (bird.y - bird.r < 0) {
      bird.y = bird.r;
      bird.vy = 0;
    }
    if (bird.y + bird.r > GAME_HEIGHT) {
      bird.y = GAME_HEIGHT - bird.r;
      setIsGameOver(true); isGameOverRef.current = true;
      playSound("hit");
      onGameOver();
    }

    // Collisions with pipes
    for (const p of pipes) {
      const inX = BIRD_X + bird.r > p.x && BIRD_X - bird.r < p.x + PIPE_WIDTH;
      const hitTop = bird.y - bird.r < p.topHeight;
      const hitBottom = bird.y + bird.r > p.bottomY;
      if (inX && (hitTop || hitBottom)) {
        setIsGameOver(true); isGameOverRef.current = true;
        playSound("hit");
        onGameOver();
        break;
      }
    }
  };

  const onGameOver = () => {
    if (handledGameOverRef.current) return;
    handledGameOverRef.current = true;
    const newAttempts = Math.max(0, attemptsLeftRef.current - 1);
    attemptsLeftRef.current = newAttempts;
    setAttemptsLeft(newAttempts);
    const newTotal = roundTotalRef.current + scoreRef.current;
    roundTotalRef.current = newTotal;
    setRoundTotal(newTotal);
    if (newAttempts === 0) {
      try {
        // eslint-disable-next-line no-console
        console.log({ game: "Flappy Bird", transactionId, totalPoints: newTotal });
      } catch (_) {}
    }
  };

  const render = (ctx) => {
    // Cielo con gradiente
    const sky = ctx.createLinearGradient(0, 0, 0, GAME_HEIGHT);
    sky.addColorStop(0, "#6ec3ff");
    sky.addColorStop(1, "#b8e1ff");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

    // Fondo parallax
    renderBackground(ctx);

    // Suelo con gradiente
    const ground = ctx.createLinearGradient(0, GAME_HEIGHT - 32, 0, GAME_HEIGHT);
    ground.addColorStop(0, "#e6d9a2");
    ground.addColorStop(1, "#d0c18d");
    ctx.fillStyle = ground;
    ctx.fillRect(0, GAME_HEIGHT - 24, GAME_WIDTH, 24);

    // Pipes
    ctx.fillStyle = "#3cb371";
    for (const p of pipesRef.current) {
      // top
      ctx.fillRect(p.x, 0, PIPE_WIDTH, p.topHeight);
      // bottom
      ctx.fillRect(p.x, p.bottomY, PIPE_WIDTH, p.bottomHeight);
      // borde
      ctx.strokeStyle = "#2e8b57";
      ctx.lineWidth = 3;
      ctx.strokeRect(p.x + 1.5, 0 + 1.5, PIPE_WIDTH - 3, p.topHeight - 3);
      ctx.strokeRect(p.x + 1.5, p.bottomY + 1.5, PIPE_WIDTH - 3, p.bottomHeight - 3);
    }

    // Bird (sprite simple con rotación y ala)
    const bird = birdRef.current;
    ctx.save();
    ctx.translate(BIRD_X, bird.y);
    const angle = Math.max(-0.5, Math.min(0.9, bird.vy / 10));
    ctx.rotate(angle);
    // cuerpo
    ctx.fillStyle = "#ffcc00";
    ctx.beginPath();
    ctx.arc(0, 0, bird.r, 0, Math.PI * 2);
    ctx.fill();
    // barriga
    ctx.fillStyle = "#ffe680";
    ctx.beginPath();
    ctx.arc(-3, 4, bird.r * 0.7, 0, Math.PI * 2);
    ctx.fill();
    // ojo
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(5, -4, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#222222";
    ctx.beginPath();
    ctx.arc(6, -4, 2, 0, Math.PI * 2);
    ctx.fill();
    // pico
    ctx.fillStyle = "#ff9900";
    ctx.beginPath();
    ctx.moveTo(bird.r, 0);
    ctx.lineTo(bird.r + 8, -3);
    ctx.lineTo(bird.r + 8, 3);
    ctx.closePath();
    ctx.fill();
    // ala animada
    const flap = Math.sin(timeRef.current * 0.02) * 0.5;
    ctx.save();
    ctx.translate(-4, 2);
    ctx.rotate(-0.6 + flap);
    ctx.fillStyle = "#f5c400";
    ctx.beginPath();
    ctx.ellipse(0, 0, 8, 5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    ctx.restore();

    // Score
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 24px system-ui, -apple-system, Segoe UI, Roboto";
    ctx.textAlign = "left";
    ctx.fillText(`Puntos: ${scoreRef.current}` , 12, 32);
    // No mostrar récord
    // Info de ronda (ligeramente a la derecha del centro)
    ctx.textAlign = "center";
    ctx.font = "600 16px system-ui, -apple-system, Segoe UI, Roboto";
    ctx.fillText(`Intentos: ${attemptsLeftRef.current}  |  Total: ${roundTotalRef.current}`, GAME_WIDTH / 2 + 100, 28);
  };

  // --- Fondo desplazable (nubes y colinas) ---
  const initBackground = () => {
    const clouds = [];
    let x = 0;
    for (let i = 0; i < 6; i++) {
      const w = getRandomInt(48, 86);
      const h = getRandomInt(18, 28);
      const y = getRandomInt(30, 220);
      clouds.push({ x, y, w, h, o: 0.85 });
      x += getRandomInt(60, 110);
    }

    const hills = [];
    let hx = -40;
    for (let i = 0; i < 4; i++) {
      const w = getRandomInt(140, 220);
      const h = getRandomInt(40, 90); 
      hills.push({ x: hx, w, h });
      hx += w + getRandomInt(10, 30);
    }

    bgRef.current = { clouds, hills };
  };

  const updateBackground = (dt) => {
    const speed = speedRef.current;
    const cloudSpeed = speed * CLOUD_SPEED_FACTOR;
    const hillSpeed = speed * HILL_SPEED_FACTOR;
    const { clouds, hills } = bgRef.current;

    for (const c of clouds) c.x -= cloudSpeed * dt;
    for (let i = 0; i < clouds.length; i++) {
      const c = clouds[i];
      if (c.x + c.w < -20) {
        const lastX = Math.max(...clouds.map(cl => cl.x + cl.w));
        c.x = lastX + getRandomInt(60, 120);
        c.y = getRandomInt(30, 220);
        c.w = getRandomInt(48, 86);
        c.h = getRandomInt(18, 28);
      }
    }

    for (const h of hills) h.x -= hillSpeed * dt;
    for (let i = 0; i < hills.length; i++) {
      const h = hills[i];
      if (h.x + h.w < 0) {
        const lastX = Math.max(...hills.map(hi => hi.x + hi.w));
        h.x = lastX + getRandomInt(10, 30);
        h.w = getRandomInt(140, 220);
        h.h = getRandomInt(40, 90);
      }
    }
  };

  const renderBackground = (ctx) => {
    const { clouds, hills } = bgRef.current;

    // nubes
    for (const c of clouds) {
      ctx.save();
      ctx.globalAlpha = c.o;
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.ellipse(c.x + c.w * 0.35, c.y, c.w * 0.35, c.h * 0.8, 0, 0, Math.PI * 2);
      ctx.ellipse(c.x + c.w * 0.6, c.y - c.h * 0.2, c.w * 0.4, c.h, 0, 0, Math.PI * 2);
      ctx.ellipse(c.x + c.w * 0.8, c.y, c.w * 0.3, c.h * 0.7, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // colinas
    for (const h of hills) {
      ctx.fillStyle = "#7ccb6a";
      ctx.strokeStyle = "#5aa74f";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(h.x, GAME_HEIGHT - 24);
      ctx.quadraticCurveTo(h.x + h.w / 2, GAME_HEIGHT - 24 - h.h, h.x + h.w, GAME_HEIGHT - 24);
      ctx.lineTo(h.x + h.w, GAME_HEIGHT - 24);
      ctx.lineTo(h.x, GAME_HEIGHT - 24);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
  };

  const drawStartScreen = (ctx) => {
    ctx.fillStyle = "#87CEEB";
    ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 24px system-ui, -apple-system, Segoe UI, Roboto";
    ctx.textAlign = "center";
    ctx.fillText("Flappy Bird", GAME_WIDTH / 2, GAME_HEIGHT / 2 - 40);
    ctx.font = "16px system-ui, -apple-system, Segoe UI, Roboto";
    ctx.fillText("Click/Toque o Espacio para iniciar", GAME_WIDTH / 2, GAME_HEIGHT / 2);
    ctx.fillText("Durante el juego: Espacio para aletear", GAME_WIDTH / 2, GAME_HEIGHT / 2 + 24);
    // Sin récord
    ctx.fillText(`Intentos disponibles: ${attemptsLeftRef.current}`, GAME_WIDTH / 2, GAME_HEIGHT / 2 + 72);
    ctx.fillText(`Total acumulado: ${roundTotalRef.current}`, GAME_WIDTH / 2, GAME_HEIGHT / 2 + 96);
  };

  const drawGameOver = (ctx) => {
    ctx.fillStyle = "rgba(0,0,0,0.4)";
    ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
    ctx.fillStyle = "#ffffff";
    ctx.textAlign = "center";
    ctx.font = "bold 28px system-ui, -apple-system, Segoe UI, Roboto";
    ctx.fillText("¡Game Over!", GAME_WIDTH / 2, GAME_HEIGHT / 2 - 20);
    ctx.font = "16px system-ui, -apple-system, Segoe UI, Roboto";
    ctx.fillText(`Puntuación intento: ${scoreRef.current}  |  Total: ${roundTotalRef.current}`, GAME_WIDTH / 2, GAME_HEIGHT / 2 + 8);
    if (attemptsLeftRef.current > 0) {
      ctx.fillText(`Intentos restantes: ${attemptsLeftRef.current}`, GAME_WIDTH / 2, GAME_HEIGHT / 2 + 32);
      ctx.fillText("Pulsa Enter para el siguiente intento", GAME_WIDTH / 2, GAME_HEIGHT / 2 + 54);
    } else {
      ctx.fillText("Ronda terminada", GAME_WIDTH / 2, GAME_HEIGHT / 2 + 32);
      ctx.fillText(`Total final obtenido: ${roundTotalRef.current}`, GAME_WIDTH / 2, GAME_HEIGHT / 2 + 54);
      ctx.fillText("No hay más intentos disponibles", GAME_WIDTH / 2, GAME_HEIGHT / 2 + 76);
    }
  };

  return (
    <div className="flex flex-col items-center gap-2">
      <canvas
        ref={canvasRef}
        className="rounded-lg shadow-md border border-black/[.08] dark:border-white/[.145]"
      />
      <div className="text-sm text-center select-none">
        <p>Controles: Espacio/Click/Toque para volar, Enter para reiniciar</p>
      </div>
    </div>
  );
}


