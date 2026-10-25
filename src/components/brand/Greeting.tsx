"use client";

import { useSyncExternalStore } from "react";

function greetingFor(hour: number) {
  if (hour < 12) return "おはよう · Ohayō";
  if (hour < 19) return "こんにちは · Konnichiwa";
  return "こんばんは · Konbanwa";
}

const subscribe = () => () => {};

/** Saludo japonés según la hora local del dispositivo. */
export function Greeting({ className }: { className?: string }) {
  const text = useSyncExternalStore(
    subscribe,
    () => greetingFor(new Date().getHours()),
    () => "いらっしゃい · Irasshai",
  );
  return <p className={className}>{text}</p>;
}
