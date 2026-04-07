"use client";

import confetti from "canvas-confetti";
import { useEffect, useRef, useState } from "react";

const TRIANGLE_PATH = "M0 10 L5 0 L10 10z";

const GREYSCALE_PALETTE = [
  "#ffffff",
  "#e5e5e5",
  "#cccccc",
  "#a3a3a3",
  "#737373",
  "#525252",
  "#404040",
];

export function PurchaseButton() {
  const [purchased, setPurchased] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const followUpBurstTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (followUpBurstTimeoutRef.current !== null) {
        window.clearTimeout(followUpBurstTimeoutRef.current);
      }
    };
  }, []);

  const handleClick = () => {
    if (purchased) {
      return;
    }

    setPurchased(true);

    const triangle = confetti.shapeFromPath({ path: TRIANGLE_PATH });

    const rect = buttonRef.current?.getBoundingClientRect();
    const x = rect ? (rect.left + rect.width / 2) / window.innerWidth : 0.5;
    const y = rect ? (rect.top + rect.height / 2) / window.innerHeight : 0.7;

    confetti({
      particleCount: 80,
      spread: 70,
      startVelocity: 35,
      origin: { x, y },
      colors: GREYSCALE_PALETTE,
      shapes: [triangle, triangle, "circle"],
      scalar: 1.1,
      gravity: 1.2,
      ticks: 180,
      disableForReducedMotion: true,
    });

    if (followUpBurstTimeoutRef.current !== null) {
      window.clearTimeout(followUpBurstTimeoutRef.current);
    }

    followUpBurstTimeoutRef.current = window.setTimeout(() => {
      confetti({
        particleCount: 50,
        spread: 120,
        startVelocity: 20,
        origin: { x, y: y - 0.05 },
        colors: GREYSCALE_PALETTE,
        shapes: [triangle, "circle", triangle],
        scalar: 0.8,
        gravity: 0.9,
        ticks: 160,
        disableForReducedMotion: true,
      });
      followUpBurstTimeoutRef.current = null;
    }, 150);
  };

  return (
    <button
      className="w-full cursor-pointer rounded-full bg-foreground px-6 py-3 font-medium font-mono text-background text-sm tracking-wide transition-opacity hover:opacity-85 active:opacity-70 disabled:cursor-default disabled:opacity-60"
      disabled={purchased}
      onClick={handleClick}
      ref={buttonRef}
      type="button"
    >
      {purchased ? "Secured ✓" : "Secure Your Pair"}
    </button>
  );
}
