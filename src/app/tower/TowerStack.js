"use client";

import { useEffect, useRef, useState } from 'react';
import { fetchTransactionById } from "../../lib/firebase";

const W = 360;
const H = 640;
const INITIAL_BLOCK_WIDTH = 120;
const INITIAL_BLOCK_HEIGHT = 40;
const BLOCK_SPEED = 220; // píxeles por segundo
const PERFECT_BONUS = 50; // puntos extra por colocación perfecta

export default function TowerStack({ attempts = 5, transactionId = "" }) {
  const canvasRef = useRef(null);
  const animRef = useRef(null);
  const lastRef = useRef(0);
  const runningRef = useRef(false);
  const gameOverRef = useRef(false);
  const attemptsLeftRef = useRef(attempts);
  const blocksRef = useRef([]);
  const movingBlockRef = useRef(null);
  const directionRef = useRef(1); // 1: derecha, -1: izquierda
  const perfectsRef = useRef(0); // contador de colocaciones perfectas
  const cameraYRef = useRef(0); // para desplazar la pila hacia arriba (simular cámara)

  const [running, setRunning] = useState(false);
  const [gameOver, setGameOver] = useState(false);
  const [score, setScore] = useState(0);
  const [attemptsLeft, setAttemptsLeft] = useState(attempts);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    canvas.style.width = "100%";
    canvas.style.height = "auto";
    ctx.scale(dpr, dpr);

    const onKeyDown = (e) => {
      if (e.code === "Space" || e.code === "Enter") {
        if (!runningRef.current && attemptsLeftRef.current > 0) {
          start();
        } else if (runningRef.current && !gameOverRef.current) {
          placeBlock();
        }
      }
    };

    const onPointerDown = () => {
      if (!runningRef.current && attemptsLeftRef.current > 0) {
        start();
      } else if (runningRef.current && !gameOverRef.current) {
        placeBlock();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    canvas.addEventListener("pointerdown", onPointerDown);

    drawStart(ctx);

    return () => {
      window.removeEventListener("keydown", onKeyDown);
      canvas.removeEventListener("pointerdown", onPointerDown);
      cancelAnimationFrame(animRef.current);
    };
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
        console.log("[TowerStack] TX", transactionId, tx || "NOT_FOUND");
      } catch (_) {}
    })();
    return () => { active = false; };
  }, [transactionId]);

  const start = () => {
    if (attemptsLeftRef.current <= 0) return;
    
    setRunning(true);
    runningRef.current = true;
    setGameOver(false);
    gameOverRef.current = false;
    setScore(0);
    
    // Reiniciar estado del juego
    blocksRef.current = [{
      x: (W - INITIAL_BLOCK_WIDTH) / 2,
      y: H - INITIAL_BLOCK_HEIGHT,
      width: INITIAL_BLOCK_WIDTH,
      height: INITIAL_BLOCK_HEIGHT,
      color: "#0b0f2a" // bloque base oscuro
    }];
    
    // Crear primer bloque móvil
    movingBlockRef.current = {
      x: 0,
      y: H - INITIAL_BLOCK_HEIGHT * 2,
      width: INITIAL_BLOCK_WIDTH,
      height: INITIAL_BLOCK_HEIGHT,
      color: "#c58cff" // bloque móvil morado
    };
    
    directionRef.current = 1;
    perfectsRef.current = 0;
    lastRef.current = 0;
    cameraYRef.current = 0;
    
    animRef.current = requestAnimationFrame(loop);
  };

  const loop = (ts) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    
    if (!lastRef.current) lastRef.current = ts;
    const dt = Math.min(50, ts - lastRef.current) / 1000;
    lastRef.current = ts;
    
    update(dt);
    render(ctx);
    
    if (!gameOverRef.current) {
      animRef.current = requestAnimationFrame(loop);
    } else {
      setRunning(false);
    }
  };

  const update = (dt) => {
    if (!movingBlockRef.current) return;
    
    const block = movingBlockRef.current;
    
    // Mover bloque actual
    block.x += BLOCK_SPEED * directionRef.current * dt;
    
    // Cambiar dirección en los bordes
    if (block.x + block.width > W) {
      block.x = W - block.width;
      directionRef.current = -1;
    } else if (block.x < 0) {
      block.x = 0;
      directionRef.current = 1;
    }
  };

  const placeBlock = () => {
    if (!movingBlockRef.current || blocksRef.current.length === 0) return;
    
    const moving = movingBlockRef.current;
    const prev = blocksRef.current[blocksRef.current.length - 1];
    
    // Calcular superposición correcta
    const left = Math.max(moving.x, prev.x);
    const right = Math.min(moving.x + moving.width, prev.x + prev.width);
    const overlap = right - left;
    
    if (overlap <= 0) {
      // Bloque fuera de base - fin del juego
      setGameOver(true);
      gameOverRef.current = true;
      attemptsLeftRef.current = Math.max(0, attemptsLeftRef.current - 1);
      setAttemptsLeft(attemptsLeftRef.current);
      
      if (attemptsLeftRef.current === 0) {
        console.log({ 
          game: "Tower Stack",
          transactionId,
          totalPoints: score
        });
      }
      return;
    }
    
    // Calcular nuevo ancho basado en superposición
    const newWidth = Math.max(2, overlap);
    const isPerfect = Math.abs(overlap - prev.width) < 1;
    
    if (isPerfect) {
      perfectsRef.current++;
      setScore(s => s + PERFECT_BONUS);
    }
    
    // Añadir puntos basados en precisión
    const accuracy = overlap / prev.width;
    setScore(s => s + Math.floor(accuracy * 100));
    
    // Crear nuevo bloque fijo
    const newBlock = {
      x: left,
      y: moving.y,
      width: newWidth,
      height: INITIAL_BLOCK_HEIGHT,
      color: blocksRef.current.length % 2 === 0 ? "#0b0f2a" : "#c58cff"
    };
    
    blocksRef.current.push(newBlock);
    
    // Crear siguiente bloque móvil
    movingBlockRef.current = {
      x: 0,
      y: newBlock.y - INITIAL_BLOCK_HEIGHT,
      width: newWidth,
      height: INITIAL_BLOCK_HEIGHT,
      color: newBlock.color === "#c58cff" ? "#0b0f2a" : "#c58cff"
    };
    
    // Ajustar cámara para mantener visible la zona de construcción
    const threshold = H * 0.45;
    if (movingBlockRef.current.y + cameraYRef.current < threshold) {
      cameraYRef.current = threshold - movingBlockRef.current.y;
    }
  };

  const render = (ctx) => {
    // Fondo
    ctx.fillStyle = "#f7f3f2";
    ctx.fillRect(0, 0, W, H);
    
    ctx.save();
    ctx.translate(0, cameraYRef.current);
    
    // Dibujar sombras primero (para bloques fijos y el móvil)
    for (const block of blocksRef.current) drawIsoShadow(ctx, block);
    if (movingBlockRef.current) drawIsoShadow(ctx, movingBlockRef.current);
    
    // Bloques fijos isométricos
    for (const block of blocksRef.current) {
      drawIsoBlock(ctx, block);
    }
    
    // Bloque móvil isométrico
    if (movingBlockRef.current) {
      drawIsoBlock(ctx, movingBlockRef.current);
    }
    
    ctx.restore();
    
    // HUD
    ctx.fillStyle = "#14162a";
    ctx.font = "bold 56px system-ui, -apple-system, Segoe UI, Roboto";
    ctx.textAlign = "center";
    ctx.fillText(`${score}`, W/2, 80);
    ctx.font = "14px system-ui, -apple-system, Segoe UI, Roboto";
    ctx.textAlign = "right";
    ctx.fillText(`Intentos: ${attemptsLeft}`, W - 8, 18);
    
    if (!running) {
      ctx.fillStyle = "rgba(0,0,0,0.5)";
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = "#fff";
      ctx.textAlign = "center";
      ctx.font = "bold 24px system-ui, -apple-system, Segoe UI, Roboto";
      ctx.fillText("Tower Stack", W/2, H/2 - 20);
      ctx.font = "16px system-ui, -apple-system, Segoe UI, Roboto";
      if (gameOver) {
        if (attemptsLeft > 0) {
          ctx.fillText("¡Bloque perdido!", W/2, H/2 + 10);
          ctx.fillText("Toca para intentar de nuevo", W/2, H/2 + 40);
        } else {
          ctx.fillText("Ronda terminada", W/2, H/2 + 10);
          ctx.fillText("No hay más intentos", W/2, H/2 + 40);
        }
      } else {
        ctx.fillText("Toca para comenzar", W/2, H/2 + 10);
        ctx.fillText("Espacio o toque para colocar bloques", W/2, H/2 + 40);
      }
    }
  };

  const drawStart = (ctx) => {
    ctx.fillStyle = "#f7f3f2";
    ctx.fillRect(0, 0, W, H);
    
    ctx.fillStyle = "#14162a";
    ctx.textAlign = "center";
    ctx.font = "bold 24px system-ui, -apple-system, Segoe UI, Roboto";
    ctx.fillText("Tower Stack", W/2, H/2 - 20);
    ctx.font = "16px system-ui, -apple-system, Segoe UI, Roboto";
    ctx.fillText("Toca para comenzar", W/2, H/2 + 10);
    ctx.fillText("Espacio o toque para colocar bloques", W/2, H/2 + 40);
  };

  // === Utilidades de render isométrico ===
  function drawIsoShadow(ctx, block) {
    const cx = block.x + block.width / 2;
    const cy = block.y + block.height / 2;
    const size = block.width;
    const thickness = 12;
    const offX = 18, offY = 12; // desplazamiento de sombra
    ctx.save();
    ctx.translate(offX, offY);
    ctx.globalAlpha = 0.25;
    drawIsoTopPath(ctx, cx, cy, size);
    ctx.fillStyle = "#000";
    ctx.fill();
    // sombra del grosor
    drawIsoSidePath(ctx, cx, cy, size, thickness);
    ctx.fill();
    ctx.restore();
  }

  function drawIsoBlock(ctx, block) {
    const cx = block.x + block.width / 2;
    const cy = block.y + block.height / 2;
    const size = block.width;
    const thickness = 12;
    // Cara superior con degradado
    const grad = ctx.createLinearGradient(cx - size, cy - size * 0.5, cx + size, cy + size * 0.5);
    const base = block.color || "#c58cff";
    const c1 = lighten(base, 0.3);
    const c2 = darken(base, 0.22);
    grad.addColorStop(0, c1);
    grad.addColorStop(1, c2);
    drawIsoTopPath(ctx, cx, cy, size);
    ctx.fillStyle = grad; ctx.fill();
    // Borde superior sutil
    ctx.strokeStyle = darken(base, 0.35);
    ctx.lineWidth = 1; ctx.stroke();
    // Lado (extrusión)
    drawIsoSidePath(ctx, cx, cy, size, thickness);
    const sideGrad = ctx.createLinearGradient(cx, cy, cx + 20, cy + 24);
    sideGrad.addColorStop(0, darken(base, 0.15));
    sideGrad.addColorStop(1, darken(base, 0.35));
    ctx.fillStyle = sideGrad; ctx.fill();
    // Brillo especular
    ctx.globalAlpha = 0.25;
    drawIsoTopPath(ctx, cx - size * 0.12, cy - size * 0.08, size * 0.35);
    const shine = ctx.createRadialGradient(cx - size * 0.12, cy - size * 0.10, 2, cx - size * 0.12, cy - size * 0.10, size * 0.25);
    shine.addColorStop(0, "#ffffff");
    shine.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = shine; ctx.fill();
    ctx.globalAlpha = 1;
  }

  function drawIsoTopPath(ctx, cx, cy, size) {
    const h = size * 0.5; // semiancho horizontal
    const v = size * 0.25; // semi-alto del rombo
    ctx.beginPath();
    ctx.moveTo(cx, cy - v);
    ctx.lineTo(cx + h, cy);
    ctx.lineTo(cx, cy + v);
    ctx.lineTo(cx - h, cy);
    ctx.closePath();
  }

  function drawIsoSidePath(ctx, cx, cy, size, thickness) {
    const h = size * 0.5;
    const v = size * 0.25;
    const ox = 0, oy = thickness;
    ctx.beginPath();
    // lado derecho inferior
    ctx.moveTo(cx + h, cy);
    ctx.lineTo(cx, cy + v);
    ctx.lineTo(cx + ox, cy + v + oy);
    ctx.lineTo(cx + h + ox, cy + oy);
    ctx.closePath();
    // lado izquierdo (sutil, no siempre visible)
    ctx.beginPath();
    ctx.moveTo(cx - h, cy);
    ctx.lineTo(cx, cy + v);
    ctx.lineTo(cx + ox, cy + v + oy);
    ctx.lineTo(cx - h + ox, cy + oy);
    ctx.closePath();
  }

  function hexToRgb(hex) {
    const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    if (!m) return { r: 200, g: 200, b: 200 };
    return { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) };
  }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function rgbToHex(r, g, b) {
    const h = (x) => x.toString(16).padStart(2, "0");
    return `#${h(r)}${h(g)}${h(b)}`;
  }
  function lighten(hex, amt) {
    const { r, g, b } = hexToRgb(hex);
    const rr = clamp(Math.round(r + (255 - r) * amt), 0, 255);
    const gg = clamp(Math.round(g + (255 - g) * amt), 0, 255);
    const bb = clamp(Math.round(b + (255 - b) * amt), 0, 255);
    return rgbToHex(rr, gg, bb);
  }
  function darken(hex, amt) {
    const { r, g, b } = hexToRgb(hex);
    const rr = clamp(Math.round(r * (1 - amt)), 0, 255);
    const gg = clamp(Math.round(g * (1 - amt)), 0, 255);
    const bb = clamp(Math.round(b * (1 - amt)), 0, 255);
    return rgbToHex(rr, gg, bb);
  }

  return (
    <div className="flex flex-col items-center gap-2">
      <canvas 
        ref={canvasRef}
        className="rounded-lg shadow-md border border-black/[.08] dark:border-white/[.145]"
        style={{ width: "100%", height: "auto", touchAction: "none" }}
      />
      <p className="text-sm text-center select-none">
        Espacio o toque para colocar bloques
      </p>
    </div>
  );
}
