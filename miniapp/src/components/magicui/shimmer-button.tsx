"use client";
import { cn } from "@/lib/utils";
import { motion, type HTMLMotionProps } from "framer-motion";
import React from "react";

interface ShimmerButtonProps extends HTMLMotionProps<"button"> {
  shimmerColor?: string;
  shimmerSize?: string;
  borderRadius?: string;
  shimmerDuration?: string;
  background?: string;
  className?: string;
  children?: React.ReactNode;
}

export function ShimmerButton({
  shimmerColor = "rgba(255,255,255,0.3)",
  shimmerSize = "0.1em",
  borderRadius = "0.75rem",
  shimmerDuration = "2s",
  background = "linear-gradient(135deg, oklch(0.49 0.27 270), oklch(0.55 0.22 230))",
  className,
  children,
  ...props
}: ShimmerButtonProps) {
  return (
    <motion.button
      whileTap={{ scale: 0.97 }}
      whileHover={{ scale: 1.02 }}
      className={cn(
        "group relative z-0 flex cursor-pointer items-center justify-center gap-2 overflow-hidden whitespace-nowrap px-6 py-3.5 text-white font-semibold",
        "shadow-[0_4px_20px_oklch(0.49_0.27_270_/_0.3)]",
        "transition-all duration-300 ease-in-out",
        "hover:shadow-[0_8px_30px_oklch(0.49_0.27_270_/_0.4)]",
        "disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:shadow-none",
        className
      )}
      style={{ borderRadius, background }}
      {...props}
    >
      {/* Shimmer layer */}
      <div
        className="absolute inset-0 overflow-hidden"
        style={{ borderRadius }}
      >
        <div
          className="absolute inset-[-100%] animate-[shimmer-slide_2s_ease-in-out_infinite]"
          style={{
            background: `linear-gradient(90deg, transparent, ${shimmerColor}, transparent)`,
            animationDuration: shimmerDuration,
          }}
        />
      </div>
      <span className="relative z-10 flex items-center gap-2">{children}</span>
    </motion.button>
  );
}
