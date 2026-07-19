"use client";

import { useEffect, useRef } from "react";

const DENSITY = " .:-=+*#%@";
const CHAR_W = 5.4;
const CHAR_H = 11;
const FONT = '9px ui-monospace, "SF Mono", Menlo, Consolas, monospace';
const FILL = "#a2a2a2";
const SPEED = 0.004;

function wave(col: number, row: number, t: number, fx: number, fy: number) {
  const dx = col - fx;
  const dy = (row - fy) * 1.6;
  const dist = Math.sqrt(dx * dx + dy * dy);
  const angle = Math.atan2(dy, dx);

  let v = 0;
  v += Math.sin(dist * 0.28 - t) * 0.5;
  v += Math.sin(dist * 0.13 + 1.2 - t * 0.7) * 0.3;
  v += Math.sin(dist * 0.07 + 2.8 + t * 0.4) * 0.2;
  v += Math.sin(angle * 6 + dist * 0.15 - t * 0.5) * 0.25;
  v += Math.sin(angle * 3 - dist * 0.08 + t * 0.3) * 0.15;
  v += Math.sin(col * 0.7 + row * 0.3 + t * 0.2) * 0.08;
  v += Math.sin(col * 0.2 - row * 0.9 - t * 0.15) * 0.06;

  return v;
}

function charFor(v: number) {
  const n = Math.max(0, Math.min(1, (v + 1) / 2));
  return DENSITY[Math.floor(n * (DENSITY.length - 1))];
}

export default function AsciiWave() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let running = true;

    function resize() {
      if (!canvas) return;
      const parent = canvas.parentElement;
      if (!parent) return;
      const dpr = window.devicePixelRatio || 1;
      const w = parent.clientWidth;
      const h = parent.clientHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      canvas.style.width = w + "px";
      canvas.style.height = h + "px";
      ctx!.scale(dpr, dpr);
    }

    resize();
    window.addEventListener("resize", resize);

    const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    function draw(timestamp: number) {
      if (!running || !canvas || !ctx) return;

      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      const cols = Math.ceil(w / CHAR_W);
      const rows = Math.ceil(h / CHAR_H);
      const fx = cols * 0.35;
      const fy = rows * 0.18;
      const t = prefersReduced ? 0 : timestamp * SPEED;

      const dpr = window.devicePixelRatio || 1;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      ctx.font = FONT;
      ctx.fillStyle = FILL;
      ctx.textBaseline = "top";

      for (let row = 0; row < rows; row++) {
        let line = "";
        for (let col = 0; col < cols; col++) {
          line += charFor(wave(col, row, t, fx, fy));
        }
        ctx.fillText(line, 0, row * CHAR_H);
      }

      frameRef.current = requestAnimationFrame(draw);
    }

    frameRef.current = requestAnimationFrame(draw);

    return () => {
      running = false;
      cancelAnimationFrame(frameRef.current);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
        zIndex: 0,
        opacity: 0.38,
      }}
    />
  );
}
