import { Suspense } from "react";
import { Logo } from "@/components/brand/Logo";
import { LoginForm } from "./LoginForm";

export default function LoginPage() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col items-center justify-center gap-6 px-6 py-10">
      <Logo size={80} />
      <div className="text-center">
        <h1 className="font-display text-2xl font-bold tracking-[0.25em]">居場所</h1>
        <p className="mt-1 text-sm text-ink-soft">Entra o crea tu cuenta para empezar</p>
      </div>
      <Suspense>
        <LoginForm />
      </Suspense>
    </main>
  );
}
