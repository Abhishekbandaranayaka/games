"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { AppBackground } from "@/components/AppBackground";
import { HubLogo } from "@/components/HubLogo";
import { authClient } from "@/lib/auth-client";
import { HUB_NAME } from "@/lib/brand";
import { HUB_GAMES } from "@/lib/games";
import { USERNAME_MAX_LENGTH, usernameError } from "@/lib/username";

type AuthMode = "sign-in" | "sign-up";

function safeDestination(value: string): string {
  return value.startsWith("/") && !value.startsWith("//") ? value : "/";
}

export function AuthScreen({ callbackUrl = "/" }: { callbackUrl?: string }) {
  const router = useRouter();
  const [mode, setMode] = useState<AuthMode>("sign-in");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const destination = safeDestination(callbackUrl);
  const destinationGame = HUB_GAMES.find(
    (game) => destination === game.href || destination.startsWith(`${game.href}/`),
  );

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;

    const normalizedEmail = email.trim().toLowerCase();
    if (mode === "sign-up") {
      const invalidUsername = usernameError(username);
      if (invalidUsername) {
        setError(invalidUsername);
        return;
      }
    }
    if (!normalizedEmail || !normalizedEmail.includes("@")) {
      setError("Enter a valid email address.");
      return;
    }
    if (password.length < 10) {
      setError("Password must contain at least 10 characters.");
      return;
    }

    setBusy(true);
    setError("");
    try {
      const result =
        mode === "sign-up"
          ? await authClient.signUp.email({
              email: normalizedEmail,
              password,
              name: username.trim(),
            })
          : await authClient.signIn.email({
              email: normalizedEmail,
              password,
              rememberMe: true,
            });

      if (result.error) {
        setError(
          mode === "sign-in"
            ? "Email or password is incorrect."
            : result.error.message || "Unable to create the account.",
        );
        return;
      }

      router.replace(safeDestination(callbackUrl));
      router.refresh();
    } catch {
      setError("Unable to contact the server. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  function changeMode(nextMode: AuthMode) {
    setMode(nextMode);
    setError("");
  }

  return (
    <div className="app-shell text-amber-50">
      <AppBackground />
      <main className="relative z-10 mx-auto flex min-h-dvh w-full max-w-[420px] flex-col justify-center px-4 py-[max(1.5rem,env(safe-area-inset-top))]">
        <div className="text-center">
          <h1 className="flex justify-center">
            <HubLogo size="hero" />
          </h1>
          <p className="mt-4 text-xs text-amber-100/55">
            {destinationGame
              ? `Sign in to continue to ${destinationGame.localName}`
              : `One ${HUB_NAME} account for every game`}
          </p>
        </div>

        <div className="mt-8 rounded-[24px] border border-amber-300/20 bg-black/45 p-5 shadow-[0_24px_70px_rgba(0,0,0,0.5)] backdrop-blur-xl">
          <div className="grid grid-cols-2 rounded-2xl bg-white/5 p-1" role="tablist" aria-label="Account action">
            <button
              type="button"
              role="tab"
              aria-selected={mode === "sign-in"}
              onClick={() => changeMode("sign-in")}
              className={`min-h-10 rounded-xl text-sm font-semibold transition ${
                mode === "sign-in" ? "bg-amber-400 text-zinc-950" : "text-amber-100/65"
              }`}
            >
              Sign in
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === "sign-up"}
              onClick={() => changeMode("sign-up")}
              className={`min-h-10 rounded-xl text-sm font-semibold transition ${
                mode === "sign-up" ? "bg-amber-400 text-zinc-950" : "text-amber-100/65"
              }`}
            >
              Sign up
            </button>
          </div>

          <form onSubmit={submit} className="mt-5">
            {mode === "sign-up" ? (
              <>
                <label htmlFor="auth-username" className="block text-[11px] font-medium uppercase tracking-[0.2em] text-amber-400/80">
                  Username
                </label>
                <input
                  id="auth-username"
                  type="text"
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                  autoComplete="username"
                  minLength={3}
                  maxLength={USERNAME_MAX_LENGTH}
                  required
                  disabled={busy}
                  placeholder="Choose a username"
                  className="mt-2 min-h-12 w-full rounded-2xl border border-amber-500/20 bg-[#1b0e10] px-4 text-base text-amber-50 outline-none ring-amber-400/40 placeholder:text-amber-100/30 focus:ring-2 disabled:opacity-60"
                />
              </>
            ) : null}

            <label htmlFor="auth-email" className={`block text-[11px] font-medium uppercase tracking-[0.2em] text-amber-400/80 ${mode === "sign-up" ? "mt-4" : ""}`}>
              Email
            </label>
            <input
              id="auth-email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="email"
              inputMode="email"
              required
              disabled={busy}
              placeholder="you@example.com"
              className="mt-2 min-h-12 w-full rounded-2xl border border-amber-500/20 bg-[#1b0e10] px-4 text-base text-amber-50 outline-none ring-amber-400/40 placeholder:text-amber-100/30 focus:ring-2 disabled:opacity-60"
            />

            <label htmlFor="auth-password" className="mt-4 block text-[11px] font-medium uppercase tracking-[0.2em] text-amber-400/80">
              Password
            </label>
            <div className="relative mt-2">
              <input
                id="auth-password"
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete={mode === "sign-up" ? "new-password" : "current-password"}
                minLength={10}
                maxLength={128}
                required
                disabled={busy}
                placeholder="At least 10 characters"
                className="min-h-12 w-full rounded-2xl border border-amber-500/20 bg-[#1b0e10] px-4 pr-20 text-base text-amber-50 outline-none ring-amber-400/40 placeholder:text-amber-100/30 focus:ring-2 disabled:opacity-60"
              />
              <button
                type="button"
                onClick={() => setShowPassword((current) => !current)}
                className="absolute inset-y-0 right-2 my-auto min-h-9 rounded-xl px-3 text-xs font-semibold text-amber-200/75 hover:bg-white/5"
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? "Hide" : "Show"}
              </button>
            </div>

            {error ? (
              <p role="alert" className="mt-3 rounded-xl border border-red-400/20 bg-red-950/35 px-3 py-2 text-sm text-red-200">
                {error}
              </p>
            ) : null}

            <button
              type="submit"
              disabled={busy}
              className="mt-5 min-h-12 w-full rounded-2xl bg-linear-to-b from-amber-300 to-amber-500 text-base font-semibold text-zinc-950 shadow-[0_10px_30px_rgba(212,175,55,0.25)] disabled:cursor-wait disabled:opacity-60"
            >
              {busy ? "Please wait..." : mode === "sign-up" ? "Create account" : "Sign in"}
            </button>
          </form>

          <p className="mt-4 text-center text-xs leading-relaxed text-amber-100/45">
            {mode === "sign-up"
              ? "3 to 20 letters, numbers, or underscores. This name is shown to other players."
              : "Your coins and account work in every game."}
          </p>
        </div>
      </main>
    </div>
  );
}
