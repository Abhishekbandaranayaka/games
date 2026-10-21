"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { AppBackground } from "@/components/AppBackground";
import { KrLogo } from "@/components/kalu-rajina/KrLogo";
import { KR_MAX_PLAYERS, KR_MIN_PLAYERS } from "@/lib/kalu-rajina/engine";
import { HUB_PATH, krRoomPath } from "@/lib/routes";

export function KrHome({
  player,
  matchEntryCoins,
}: {
  player: { name: string; coinBalance: string };
  matchEntryCoins: string;
}) {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [error, setError] = useState("");

  function createRoom() {
    setError("");
    router.push(krRoomPath("new"));
  }

  function joinRoom() {
    if (code.trim().length < 4) {
      setError("Enter a room code.");
      return;
    }
    setError("");
    router.push(krRoomPath(code.trim().toUpperCase()));
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (code.trim().length >= 4) joinRoom();
    else createRoom();
  }

  return (
    <div className="app-shell text-amber-50">
      <AppBackground />

      <main className="relative z-10 mx-auto flex min-h-dvh w-full max-w-[420px] flex-col px-4 pt-[max(1.5rem,env(safe-area-inset-top))] pb-[max(2rem,env(safe-area-inset-bottom))]">
        <header className="shrink-0 pt-4 text-center">
          <p className="text-[10px] font-medium uppercase tracking-[0.38em] text-amber-400/75">Card game</p>
          <h1 className="mt-3 flex justify-center">
            <KrLogo size="hero" />
          </h1>
          <div className="mt-5 flex items-center justify-between gap-3 rounded-2xl border border-amber-300/15 bg-black/30 px-3 py-2 text-left backdrop-blur-md">
            <p className="min-w-0 truncate text-sm font-semibold text-amber-100">{player.name}</p>
            <div className="flex shrink-0 items-center gap-2">
              <span className="rounded-full border border-amber-300/25 bg-amber-400/10 px-3 py-1.5 text-xs font-bold text-amber-300">
                🪙 {player.coinBalance}
              </span>
              <button
                type="button"
                onClick={() => router.push(HUB_PATH)}
                className="min-h-9 shrink-0 rounded-xl border border-amber-300/20 px-3 text-xs font-semibold text-amber-100/70 hover:bg-white/5"
              >
                ← Games
              </button>
            </div>
          </div>
        </header>

        <form onSubmit={onSubmit} className="mt-6">
          <div className="w-full rounded-[24px] border border-amber-300/20 bg-black/40 p-5 shadow-[0_24px_70px_rgba(0,0,0,0.45)] backdrop-blur-xl">
            <button
              type="button"
              onClick={createRoom}
              className="min-h-12 w-full rounded-2xl bg-linear-to-b from-amber-300 to-amber-500 text-base font-semibold text-zinc-950 shadow-[0_10px_30px_rgba(212,175,55,0.25)]"
            >
              Create room
            </button>
            <p className="mt-2 text-center text-[11px] text-amber-100/45">
              Match entry: {matchEntryCoins} coins, charged when the game starts
            </p>

            <div className="my-4 flex items-center gap-3 text-[11px] uppercase tracking-[0.18em] text-amber-100/35">
              <div className="h-px flex-1 bg-amber-100/15" />
              join
              <div className="h-px flex-1 bg-amber-100/15" />
            </div>

            <label htmlFor="kr-code" className="sr-only">
              Room code
            </label>
            <input
              id="kr-code"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="ROOM CODE"
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck={false}
              enterKeyHint="go"
              className="min-h-12 w-full rounded-2xl border border-amber-500/20 bg-[#1b0e10] px-4 text-center font-mono text-base tracking-[0.28em] text-amber-50 outline-none ring-amber-400/40 placeholder:tracking-normal placeholder:text-amber-100/30 focus:ring-2"
            />
            <button
              type="button"
              onClick={joinRoom}
              className="mt-2 min-h-12 w-full rounded-2xl border border-amber-400/40 bg-amber-300/5 text-base font-semibold text-amber-100"
            >
              Join room
            </button>

            {error ? <p className="mt-3 text-center text-sm text-red-300">{error}</p> : null}
          </div>
        </form>

        <details className="mt-5 rounded-[22px] border border-amber-300/15 bg-black/30 px-5 py-4 text-sm leading-relaxed text-amber-100/75 backdrop-blur-md">
          <summary className="cursor-pointer font-semibold text-amber-200">How to play</summary>
          <ul className="mt-3 list-disc space-y-2 pl-5">
            <li>
              One deck of 52 cards plus a single කළු රැජින (Black Queen). She has no partner, so she can
              never be paired.
            </li>
            <li>All cards are dealt. Every matching pair (two 7s, two Kings…) is discarded automatically.</li>
            <li>
              On your turn, take one hidden card from the next player. If it matches a card you hold, the
              pair is discarded.
            </li>
            <li>Shuffle your hand any time so nobody can track where the කළු රැජින is.</li>
            <li>Run out of cards and you are safe. The last player holding the කළු රැජින loses.</li>
            <li>
              Coins: 1st and 2nd out share the loser&apos;s entry. Everyone else gets their entry back.
            </li>
            <li>
              {KR_MIN_PLAYERS}–{KR_MAX_PLAYERS} players. You have 30 seconds per turn, then a card is drawn for
              you.
            </li>
          </ul>
        </details>
      </main>
    </div>
  );
}
