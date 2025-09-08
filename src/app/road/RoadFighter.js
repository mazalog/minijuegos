"use client";

import { useEffect, useRef, useState } from "react";
import { fetchTransactionById } from "../../lib/firebase";

const W = 360;
const H = 640;
const ROAD_W = 220;
const LANE_W = ROAD_W / 3;
const LEFT_X = (W - ROAD_W) / 2;
const LANE_COUNT = 3;
const FREE_LANES = 1; // mantener al menos 1 carril libre
const MIN_WAVE_GAP = 60; // oleadas más frecuentes
const MIN_LANE_SPACING = 100; // separación vertical entre coches
const SAFE_CORRIDOR = true; // mantener un corredor libre persistente

const TARGET_SPEED = 520; // velocidad constante de juego (sin acelerar/frenar)
const FUEL_MAX = 100;
const FUEL_CONSUMPTION_BASE = 4; // % por minuto base
const FUEL_PICKUP_AMOUNT = 30;
const CRUISE_SPEED = 420; // velocidad objetivo cuando no se presiona nada

export default function RoadFighter({ attempts = 5, transactionId = "" }) {
  const canvasRef = useRef(null);
  const animRef = useRef(null);
  const lastRef = useRef(0);
  const runningRef = useRef(false);
  const gameOverRef = useRef(false);
  const keysRef = useRef({ left: false, right: false });
  const assetsRef = useRef({ car: null, obstacle: null });
  const audioCtxRef = useRef(null);
  const engineOscRef = useRef(null);
  const engineGainRef = useRef(null);
  const controlModeRef = useRef("swipe"); // "swipe" | "tilt"
  const pointerActiveRef = useRef(false);
  const pointerStartXRef = useRef(0);
  const tiltEnabledRef = useRef(false);
  const tiltZeroRef = useRef(0);
  const currentLaneRef = useRef(1); // 0: izquierda, 1: centro, 2: derecha
  const targetLaneRef = useRef(1);
  const spawnCooldownRef = useRef(0);
  // eliminamos el uso de laneLastYRef; calcularemos en caliente
  const lastFreeLaneRef = useRef(1); // carril libre sugerido para mantener un corredor
  const lastBlockedLaneRef = useRef(2);
  const recentBlocksRef = useRef([]);

  // Helpers de carriles dentro del componente para acceder a los refs
  const laneX = (laneIndex, carW) => {
    const centers = [LEFT_X + LANE_W * 0.5, LEFT_X + LANE_W * 1.5, LEFT_X + LANE_W * 2.5];
    return centers[laneIndex] - carW / 2;
  };

  const requestLaneChange = (dir) => {
    const lane = currentLaneRef.current;
    let next = lane + dir;
    if (next < 0) next = 0;
    if (next > 2) next = 2;
    targetLaneRef.current = next;
  };

  const [running, setRunning] = useState(false);
  const [gameOver, setGameOver] = useState(false);
  const [score, setScore] = useState(0);
  const [attemptsLeft, setAttemptsLeft] = useState(attempts);

  const playerRef = useRef({ x: LEFT_X + LANE_W * 1.5, y: H - 80, w: 24, h: 40, vx: 0, speed: 0, fuel: FUEL_MAX, drift: 0 });
  const carsRef = useRef([]);
  const pickupsRef = useRef([]); // (desactivado) bidones de combustible
  const hazardsRef = useRef([]); // (eliminado) manchas de aceite
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
      if (e.code === "Enter" && !runningRef.current && attemptsLeftRef.current > 0) start();
      // En modo swipe, las teclas izquierda/derecha disparan cambio de carril discreto
      if (controlModeRef.current === "swipe") {
        if (e.code === "ArrowLeft" || e.code === "KeyA") requestLaneChange(-1);
        if (e.code === "ArrowRight" || e.code === "KeyD") requestLaneChange(1);
      }
    };
    const onKeyUp = (e) => {
      if (e.code === "ArrowLeft" || e.code === "KeyA") keysRef.current.left = false;
      if (e.code === "ArrowRight" || e.code === "KeyD") keysRef.current.right = false;
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    const releaseKeys = () => { keysRef.current.left = false; keysRef.current.right = false; };
    window.addEventListener("pointerup", releaseKeys);
    window.addEventListener("pointercancel", releaseKeys);

    // Gestos por arrastre (swipe/drag) en canvas
    const onPointerDownCanvas = (e) => {
      if (!runningRef.current && attemptsLeftRef.current > 0) start();
      pointerActiveRef.current = true;
      pointerStartXRef.current = e.clientX || (e.touches && e.touches[0]?.clientX) || 0;
    };
    const onPointerMoveCanvas = (e) => {
      if (!pointerActiveRef.current || controlModeRef.current !== "swipe") return;
      // no hay acción continua; se decidirá en pointerup
    };
    const onPointerUpCanvas = (e) => {
      if (!pointerActiveRef.current) return;
      pointerActiveRef.current = false;
      const x = e.clientX || (e.changedTouches && e.changedTouches[0]?.clientX) || 0;
      const dx = x - pointerStartXRef.current;
      const threshold = 18;
      if (controlModeRef.current === "swipe") {
        if (dx > threshold) requestLaneChange(1);
        else if (dx < -threshold) requestLaneChange(-1);
      }
      keysRef.current.left = false; keysRef.current.right = false;
    };
    canvas.addEventListener("pointerdown", onPointerDownCanvas, { passive: true });
    canvas.addEventListener("pointermove", onPointerMoveCanvas, { passive: true });
    canvas.addEventListener("pointerup", onPointerUpCanvas, { passive: true });
    canvas.addEventListener("pointercancel", onPointerUpCanvas, { passive: true });

    // Orientación del dispositivo (tilt)
    const onDeviceOrientation = (ev) => {
      if (!tiltEnabledRef.current || controlModeRef.current !== "tilt") return;
      const gamma = (ev.gamma ?? 0) - tiltZeroRef.current; // izquierda(-)/derecha(+)
      const dead = 4;
      if (gamma > dead) { keysRef.current.right = true; keysRef.current.left = false; }
      else if (gamma < -dead) { keysRef.current.left = true; keysRef.current.right = false; }
      else { keysRef.current.left = false; keysRef.current.right = false; }
    };
    window.addEventListener("deviceorientation", onDeviceOrientation);

    drawStart(ctx);

    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("pointerup", releaseKeys);
      window.removeEventListener("pointercancel", releaseKeys);
      canvas.removeEventListener("pointerdown", onPointerDownCanvas);
      canvas.removeEventListener("pointermove", onPointerMoveCanvas);
      canvas.removeEventListener("pointerup", onPointerUpCanvas);
      canvas.removeEventListener("pointercancel", onPointerUpCanvas);
      window.removeEventListener("deviceorientation", onDeviceOrientation);
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

  // Consultar Firestore por transactionId recibido
  useEffect(() => {
    let active = true;
    (async () => {
      if (!transactionId) return;
      try {
        const tx = await fetchTransactionById(transactionId);
        if (!active) return;
        // eslint-disable-next-line no-console
        console.log("[RoadFighter] TX", transactionId, tx || "NOT_FOUND");
      } catch (_) {}
    })();
    return () => { active = false; };
  }, [transactionId]);

  const start = () => {
    if (attemptsLeftRef.current <= 0) return;
    setRunning(true); runningRef.current = true;
    setGameOver(false); gameOverRef.current = false;
    setScore(0);
    playerRef.current = { x: laneX(1, 24), y: H - 80, w: 24, h: 40, vx: 0, speed: 260, fuel: FUEL_MAX, drift: 0 };
    currentLaneRef.current = 1; targetLaneRef.current = 1;
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
    // Velocidad constante (sin acelerar/frenar manual)
    p.speed = TARGET_SPEED;

    // Movimiento lateral
    if (controlModeRef.current === "swipe") {
      // animar hacia el carril objetivo
      const dest = laneX(targetLaneRef.current, p.w);
      const dir = Math.sign(dest - p.x);
      const speedX = 420; // px/s
      if (Math.abs(dest - p.x) <= speedX * dt) {
        p.x = dest;
        currentLaneRef.current = targetLaneRef.current;
      } else {
        p.x += dir * speedX * dt;
      }
      // drift disminuye igual
      p.drift *= Math.pow(0.4, dt);
    } else {
      p.vx = 0;
      if (keysRef.current.left) p.vx -= 160;
      if (keysRef.current.right) p.vx += 160;
      // efecto de derrape
      p.drift *= Math.pow(0.4, dt);
      p.x += (p.vx + p.drift) * dt;
    }
    // permitir un poco de offroad con penalización
    const roadLeft = LEFT_X + 6;
    const roadRight = LEFT_X + ROAD_W - 6 - p.w;
    if (p.x < roadLeft - 8) p.x = roadLeft - 8; // límite duro
    if (p.x > roadRight + 8) p.x = roadRight + 8;

    // Líneas de carretera
    linesYRef.current = (linesYRef.current + p.speed * dt) % 40;

    // Oleadas de coches: garantizar al menos un carril libre
    spawnCooldownRef.current -= dt;
    if (spawnCooldownRef.current <= 0) {
      spawnWave(p.speed);
    }

    // Spawnear pickups (combustible) y hazards (aceite)
    // Combustible ilimitado: no generamos bidones
    // sin manchas de aceite

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
    // sin procesamiento de hazards

    // Penalización por offroad en bordes
    const distLeft = p.x - roadLeft;
    const distRight = roadRight - p.x;
    // mantener penalización suave en bordes sin llevar a cero la velocidad
    if (distLeft < 10 || distRight < 10) {
      p.speed = Math.max(200, p.speed - 120 * dt);
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

    // sin render de manchas

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

  function spawnWave(playerSpeed) {
    const enemyW = 22, enemyH = 36;
    const LANE_CHANGE_TIME = 0.35;
    const ySpawn = -60;

    // Ventana dinámica basada en velocidad
    const WINDOW = Math.max(
      MIN_LANE_SPACING,
      enemyH + Math.floor(playerSpeed * LANE_CHANGE_TIME)
    );

    // Analizar coches recientes
    const recent = carsRef.current.filter(c => Math.abs(c.y - ySpawn) <= WINDOW);
    const blockedLanes = new Set(
      recent.map(c => Math.floor((c.x - LEFT_X) / LANE_W))
    );
    
    // Determinar carriles disponibles
    const allLanes = [0, 1, 2];
    const freeLanes = allLanes.filter(l => !blockedLanes.has(l));
    
    // Mantener al menos un carril libre
    if (freeLanes.length < FREE_LANES) {
      spawnCooldownRef.current = 0.15;
      return;
    }

    // Elegir carril para nuevo coche
    let blockLane;
    if (SAFE_CORRIDOR && lastFreeLaneRef.current !== undefined) {
      // Intentar mantener el corredor libre anterior
      const options = allLanes.filter(l => 
        l !== lastFreeLaneRef.current && !blockedLanes.has(l)
      );
      blockLane = options[Math.floor(Math.random() * options.length)];
      if (blockLane === undefined) {
        // Si no hay opción que mantenga el corredor, elegir cualquiera que deje un libre
        blockLane = allLanes.find(l => 
          l !== lastFreeLaneRef.current && 
          freeLanes.filter(f => f !== l).length >= FREE_LANES
        );
      }
    }
    
    // Si no se pudo mantener corredor, elegir cualquier carril válido
    if (blockLane === undefined) {
      const options = allLanes.filter(l => 
        !blockedLanes.has(l) && 
        freeLanes.filter(f => f !== l).length >= FREE_LANES
      );
      if (options.length === 0) {
        spawnCooldownRef.current = 0.15;
        return;
      }
      blockLane = options[Math.floor(Math.random() * options.length)];
    }

    // Verificar espacio vertical
    const canPlace = (lane) => {
      for (const c of carsRef.current) {
        const laneIdx = Math.floor((c.x - LEFT_X + 1) / LANE_W);
        if (laneIdx === lane && Math.abs(c.y - ySpawn) < MIN_LANE_SPACING) {
          return false;
        }
      }
      return true;
    };

    // Colocar nuevo coche
    if (canPlace(blockLane)) {
      const speed = playerSpeed * (0.65 + Math.random() * 0.5);
      const x = LEFT_X + blockLane * LANE_W + (LANE_W - enemyW) / 2;
      carsRef.current.push({ x, y: ySpawn, w: enemyW, h: enemyH, speed });
      
      // Actualizar corredor libre
      if (SAFE_CORRIDOR) {
        const newFree = freeLanes.find(l => l !== blockLane) || freeLanes[0];
        lastFreeLaneRef.current = newFree;
      }
    }

    // Tiempo hasta próxima oleada
    spawnCooldownRef.current = MIN_WAVE_GAP / Math.max(380, playerSpeed);
  }

  return (
    <div className="flex flex-col items-center gap-2 relative">
      <canvas ref={canvasRef} className="rounded-lg shadow-md border border-black/[.08] dark:border-white/[.145]" style={{ width: "100%", height: "auto", touchAction: "none" }} />
      <div className="text-sm text-center select-none flex gap-3 items-center">
        <p>Controles: ←/→ mover, ↑ acelerar, ↓ frenar. Enter para iniciar</p>
        <button
          className="rounded border px-2 py-1"
          onClick={() => { controlModeRef.current = controlModeRef.current === "swipe" ? "tilt" : "swipe"; if (controlModeRef.current === "tilt") requestTiltPermission(); }}
        >
          Modo: {controlModeRef.current === "swipe" ? "Carriles (gestos)" : "Inclinación"}
        </button>
      </div>
    </div>
  );
}

function rectsOverlap(ax, ay, aw, ah, bx, by, bw, bh) {
  return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
}

// Solicitar permiso para DeviceOrientation en iOS
function requestTiltPermission() {
  const anyDo = window.DeviceOrientationEvent;
  const needPerm = typeof anyDo?.requestPermission === "function";
  if (needPerm) {
    anyDo.requestPermission().then((res) => {
      if (res === "granted") {
        // habilitar tilt
      }
    }).catch(() => {});
  }
}

// (el helper laneX y requestLaneChange se definen dentro del componente arriba)


