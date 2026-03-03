"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

const CLICK_WINDOW_MS = 3000;
const REQUIRED_CLICKS = 5;

export default function HiddenAdminEntry() {
  const router = useRouter();
  const clickTimes = useRef<number[]>([]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const isShortcut =
        event.metaKey &&
        event.shiftKey &&
        event.key.toLowerCase() === "a";
      if (isShortcut) {
        event.preventDefault();
        router.push("/admin/login");
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [router]);

  const handleClick = () => {
    const now = Date.now();
    clickTimes.current = clickTimes.current.filter((time) => now - time < CLICK_WINDOW_MS);
    clickTimes.current.push(now);
    if (clickTimes.current.length >= REQUIRED_CLICKS) {
      clickTimes.current = [];
      router.push("/admin/login");
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-label="Admin entry"
      className="absolute right-0 top-1 h-2 w-2 rounded-full bg-slate-900/20 opacity-10 transition hover:opacity-20"
    />
  );
}
