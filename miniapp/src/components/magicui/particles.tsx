"use client";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

interface Particle {
  x: number; y: number; vx: number; vy: number;
  size: number; opacity: number; life: number; maxLife: number;
}

export function Particles({
  className,
  quantity = 30,
  color = "rgba(128, 90, 255, 1)",
}: {
  className?: string;
  quantity?: number;
  color?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    if (hasError) return;
    try {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      let w = canvas.offsetWidth || 300;
      let h = canvas.offsetHeight || 200;

      const resize = () => {
        w = canvas.offsetWidth || 300;
        h = canvas.offsetHeight || 200;
        canvas.width = w * 2;
        canvas.height = h * 2;
        ctx.setTransform(2, 0, 0, 2, 0, 0);
      };
      resize();

      const particles: Particle[] = Array.from({ length: quantity }, () => ({
        x: Math.random() * w,
        y: Math.random() * h,
        vx: (Math.random() - 0.5) * 0.3,
        vy: (Math.random() - 0.5) * 0.3,
        size: Math.random() * 2 + 1,
        opacity: Math.random() * 0.5 + 0.2,
        life: Math.random() * 100,
        maxLife: 100 + Math.random() * 100,
      }));

      let animId: number;
      const animate = () => {
        ctx.clearRect(0, 0, w, h);
        for (const p of particles) {
          p.x += p.vx;
          p.y += p.vy;
          p.life++;
          if (p.life > p.maxLife) {
            p.x = Math.random() * w;
            p.y = Math.random() * h;
            p.life = 0;
          }
          const alpha = p.opacity * Math.sin((p.life / p.maxLife) * Math.PI);
          ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
          ctx.fillStyle = color;
          ctx.fill();
        }
        animId = requestAnimationFrame(animate);
      };
      animate();

      window.addEventListener("resize", resize);
      return () => {
        cancelAnimationFrame(animId);
        window.removeEventListener("resize", resize);
      };
    } catch {
      setHasError(true);
    }
  }, [quantity, color, hasError]);

  if (hasError) return null;

  return (
    <canvas
      ref={canvasRef}
      className={cn("pointer-events-none absolute inset-0", className)}
      style={{ width: "100%", height: "100%" }}
    />
  );
}
