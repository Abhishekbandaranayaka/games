"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AppBackground } from "@/components/AppBackground";
import { HubLogo } from "@/components/HubLogo";
import { authClient } from "@/lib/auth-client";
import { HUB_NAME } from "@/lib/brand";
import { HUB_GAMES } from "@/lib/games";
import { disconnectSocket } from "@/lib/socket";

export function HubDashboard({
  player,
  higannaEntryCoins,
}: {
  player: { name: string; email: string; coinBalance: string };
  higannaEntryCoins: string;
}) {
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);

  async function signOut() {
    if (signingOut) return;
    setSigningOut(true);
    try {
      await authClient.signOut();
      disconnectSocket();
      router.refresh();
    } finally {
      setSigningOut(false);
    }
  }

  return (
    <div className="app-shell text-amber-50">
      <AppBackground />

      <main className="relative z-10 mx-auto flex min-h-dvh w-full max-w-[560px] flex-col px-4 pt-[max(1.25rem,env(safe-area-inset-top))] pb-[max(2rem,env(safe-area-inset-bottom))]">
        <header className="flex items-center justify-between gap-3 pt-2">
          <HubLogo size="header" />
          <button
            type="button"
            onClick={signOut}
            disabled={signingOut}
            className="min-h-9 shrink-0 rounded-xl border border-amber-300/20 px-3 text-xs font-semibold text-amber-100/70 hover:bg-white/5 disabled:opacity-50"
          >
            {signingOut ? "Signing out..." : "Sign out"}
          </button>
        </header>

        <section className="mt-6 rounded-[24px] border border-amber-300/20 bg-black/40 p-5 shadow-[0_24px_70px_rgba(0,0,0,0.45)] backdrop-blur-xl">
          <p className="text-[10px] font-medium uppercase tracking-[0.32em] text-amber-400/75">Welcome back</p>
          <p className="mt-1 truncate text-xl font-semibold text-amber-100">{player.name}</p>
          <p className="truncate text-xs text-amber-100/45">{player.email}</p>

          <div className="mt-4 flex items-center justify-between gap-3 rounded-2xl border border-amber-300/15 bg-amber-400/5 px-4 py-3">
            <div>
              <p className="text-[10px] uppercase tracking-[0.24em] text-amber-400/70">{HUB_NAME} coins</p>
              <p className="mt-0.5 text-[11px] text-amber-100/45">One wallet for every game</p>
            </div>
            <p className="text-2xl font-bold text-amber-300">🪙 {player.coinBalance}</p>
          </div>
        </section>

        <h2 className="mt-8 text-[11px] font-medium uppercase tracking-[0.3em] text-amber-400/75">Games</h2>

        <div className="mt-3 grid gap-4">
          {HUB_GAMES.map((game) => (
            <Link
              key={game.id}
              href={game.href}
              className="group flex items-center gap-4 rounded-[22px] border border-amber-300/20 bg-[linear-gradient(140deg,rgba(255,255,255,0.07),rgba(255,255,255,0.02))] p-4 shadow-[0_18px_50px_rgba(0,0,0,0.4)] backdrop-blur-xl transition hover:border-amber-300/45 hover:bg-white/8"
            >
              <img
                src={game.logoSrc}
                alt=""
                width={96}
                height={96}
                className="size-24 shrink-0 object-contain drop-shadow-[0_8px_18px_rgba(0,0,0,0.45)]"
                draggable={false}
              />
              <div className="min-w-0 flex-1">
                <p className="text-lg font-semibold text-amber-100">
                  {game.localName}
                  <span className="ml-2 text-xs font-medium uppercase tracking-[0.2em] text-amber-100/45">
                    {game.name}
                  </span>
                </p>
                <p className="mt-1 text-xs leading-relaxed text-amber-100/60">{game.tagline}</p>
                <p className="mt-2 text-[11px] text-amber-100/45">
                  {game.players}
                  {game.id === "higanna" ? ` · ${higannaEntryCoins} coins per match` : null}
                </p>
              </div>
              <span className="shrink-0 rounded-2xl bg-linear-to-b from-amber-300 to-amber-500 px-4 py-2.5 text-sm font-semibold text-zinc-950 shadow-[0_10px_30px_rgba(212,175,55,0.25)] transition group-hover:brightness-105">
                Play
              </span>
            </Link>
          ))}

          <div className="rounded-[22px] border border-dashed border-amber-300/20 px-4 py-6 text-center">
            <p className="text-sm font-semibold text-amber-100/70">More games coming soon</p>
            <p className="mt-1 text-xs text-amber-100/40">Your account and coins will work in every new game.</p>
          </div>
        </div>
      </main>
    </div>
  );
}
