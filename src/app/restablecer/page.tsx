import { Logo } from "@/components/brand/Logo";
import { PasswordForm } from "./PasswordForm";

export default function RestablecerPage() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col items-center justify-center gap-6 px-6 py-10">
      <Logo size={64} />
      <div className="text-center">
        <h1 className="font-display text-2xl font-bold">Elige tu contraseña</h1>
        <p className="mt-1 text-sm text-ink-soft">Con ella podrás entrar con tu correo, sin esperar un enlace.</p>
      </div>
      <PasswordForm />
    </main>
  );
}
