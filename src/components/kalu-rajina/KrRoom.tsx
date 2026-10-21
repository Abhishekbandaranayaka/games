"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AppBackground } from "@/components/AppBackground";
import { CardBack, CardFan, PlayingCard, type CardSize } from "@/components/PlayingCard";
import { KrLogo } from "@/components/kalu-rajina/KrLogo";
import { clearGameStarted, markGameStarted } from "@/components/SplashScreen";
import { KALU_RAJINA_NAME } from "@/lib/brand";
import { KALU_RAJINA_CARD_SRC } from "@/lib/cardAssets";
import { KR_MIN_PLAYERS, type KrClientView, type KrPublicPlayer } from "@/lib/kalu-rajina/engine";
import { disconnectKrSocket, getKrSocket } from "@/lib/kalu-rajina/socket";
import { KALU_RAJINA_PATH, krRoomPath } from "@/lib/routes";
import { copyText, getInviteLink } from "@/lib/shareLink";
import { playSfx } from "@/lib/sounds";
import { useNarrow } from "@/lib/useNarrow";

type Payout = { entry: string; first: string; second: string };

const GAME = "kalu-rajina";

function placeLabel(order: number): string {
  if (order === 1) return "1st";
  if (order === 2) return "2nd";
  if (order === 3) return "3rd";
  return `${order}th`;
}

function useCountdown(endsAt: number | null): number | null {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!endsAt) return;
    const id = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(id);
  }, [endsAt]);
  if (!endsAt) return null;
  return Math.max(0, Math.ceil((endsAt - now) / 1000));
}

function TurnTimer({ endsAt }: { endsAt: number | null }) {
  const seconds = useCountdown(endsAt);
  if (seconds == null) return null;
  const urgent = seconds <= 10;
  return (
    <span
      className={[
        "turn-timer inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-semibold",
        urgent
          ? "turn-timer-urgent border-red-300/60 bg-red-950/80 text-red-100"
          : "border-amber-300/50 bg-black/75 text-amber-50",
      ].join(" ")}
    >
      0:{seconds.toString().padStart(2, "0")}
    </span>
  );
}

export function KrRoom({
  codeParam,
  playerId,
  initialCoinBalance,
  payout,
}: {
  codeParam: string;
  playerId: string;
  initialCoinBalance: string;
  payout: Payout;
}) {
  const router = useRouter();
  const narrow = useNarrow();
  const roomCode = codeParam === "new" ? "new" : codeParam.trim().toUpperCase();
  const [view, setView] = useState<KrClientView | null>(null);
  const [joinError, setJoinError] = useState("");
  const [toast, setToast] = useState("");
  const [coinBalance, setCoinBalance] = useState(initialCoinBalance);
  const [drawPending, setDrawPending] = useState(false);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [kickTarget, setKickTarget] = useState<KrPublicPlayer | null>(null);
  const [copied, setCopied] = useState(false);
  const previousView = useRef<KrClientView | null>(null);
  const leaving = useRef(false);

  useEffect(() => {
    const socket = getKrSocket();

    function onState(next: KrClientView & { error?: string }) {
      if (next.error && !next.code) {
        setJoinError(next.error);
        setView(null);
        return;
      }
      setJoinError("");
      setDrawPending(false);
      const prev = previousView.current;
      previousView.current = next;
      setView(next);

      if (next.phase === "playing") markGameStarted(next.code, GAME);
      else clearGameStarted(next.code, GAME);

      if (prev) {
        if (prev.phase !== "playing" && next.phase === "playing") playSfx("deal");
        else if (prev.phase === "playing" && next.phase === "finished") playSfx("gameOver");
        else if (next.lastDraw && next.lastDraw.seq !== prev.lastDraw?.seq) {
          playSfx(next.lastDraw.paired ? "play" : "select");
        }
        if (
          next.phase === "playing" &&
          next.currentTurnId === playerId &&
          prev.currentTurnId !== playerId
        ) {
          playSfx("yourTurn");
        }
      }

      if (roomCode === "new" && next.code) router.replace(krRoomPath(next.code));
    }

    function sync() {
      if (leaving.current) return;
      const code = previousView.current?.code ?? (roomCode !== "new" ? roomCode : null);
      if (code) socket.emit("join", { code });
      else socket.emit("create");
    }

    function onToast(message: string) {
      setDrawPending(false);
      setToast(message);
    }

    function onWallet(payload: { availableBalance?: string }) {
      if (typeof payload?.availableBalance === "string") setCoinBalance(payload.availableBalance);
    }

    function onConnectError(error: Error & { data?: { code?: string } }) {
      if (error.data?.code === "UNAUTHORIZED") {
        disconnectKrSocket();
        router.refresh();
        return;
      }
      setToast(error.message || "Unable to connect to the game server.");
    }

    function onKicked(message: string) {
      leaving.current = true;
      const code = previousView.current?.code;
      if (code) clearGameStarted(code, GAME);
      setToast(message || "The host removed you from the room.");
      router.replace(KALU_RAJINA_PATH);
    }

    socket.on("state", onState);
    socket.on("toast", onToast);
    socket.on("wallet", onWallet);
    socket.on("connect_error", onConnectError);
    socket.on("kicked", onKicked);
    socket.on("connect", sync);
    if (socket.connected) sync();

    return () => {
      socket.off("state", onState);
      socket.off("toast", onToast);
      socket.off("wallet", onWallet);
      socket.off("connect_error", onConnectError);
      socket.off("kicked", onKicked);
      socket.off("connect", sync);
    };
  }, [playerId, roomCode, router]);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(""), 2600);
    return () => window.clearTimeout(t);
  }, [toast]);

  function confirmLeave() {
    leaving.current = true;
    setLeaveOpen(false);
    getKrSocket().emit("leave");
    if (view?.code) clearGameStarted(view.code, GAME);
    router.push(KALU_RAJINA_PATH);
  }

  async function copyInvite() {
    if (!view) return;
    const link = await getInviteLink(krRoomPath(view.code));
    const ok = await copyText(link);
    if (ok) {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    }
  }

  function draw(index: number) {
    if (drawPending) return;
    setDrawPending(true);
    getKrSocket().emit("draw", { index });
  }

  function shuffleHand() {
    playSfx("shuffle");
    getKrSocket().emit("shuffle");
  }

  if (!view) {
    return (
      <div className="app-shell text-amber-50">
        <AppBackground />
        <main className="relative z-10 mx-auto flex min-h-dvh w-full max-w-sm flex-col items-center justify-center px-4 text-center">
          <KrLogo size="hero" />
          {joinError ? (
            <>
              <p className="mt-6 text-sm text-red-200">{joinError}</p>
              <button
                type="button"
                onClick={() => router.push(KALU_RAJINA_PATH)}
                className="mt-4 min-h-12 w-full rounded-full border border-amber-200/25 bg-white/5 text-base font-medium text-amber-100"
              >
                Back
              </button>
            </>
          ) : (
            <p className="mt-6 text-sm text-amber-100/60">Connecting to the table…</p>
          )}
        </main>
      </div>
    );
  }

  return (
    <div className="app-shell text-amber-50">
      <AppBackground />

      <main className="relative z-10 mx-auto flex min-h-dvh w-full max-w-xl flex-col px-3 pt-[max(0.75rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))]">
        <header className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => setLeaveOpen(true)}
            className="min-h-10 shrink-0 rounded-full bg-white/6 px-3.5 text-sm font-medium text-amber-100/80 hover:bg-white/10"
          >
            ← Leave
          </button>
          <KrLogo size="header" />
          <span className="shrink-0 rounded-full border border-amber-300/25 bg-amber-400/10 px-3 py-1.5 text-xs font-bold text-amber-300">
            🪙 {coinBalance}
          </span>
        </header>

        <div className="mt-3 flex items-center justify-between gap-3 rounded-2xl border border-amber-300/15 bg-black/35 px-3 py-2 backdrop-blur-md">
          <p className="text-xs text-amber-100/60">
            Room <span className="font-mono text-sm tracking-[0.24em] text-amber-100">{view.code}</span>
          </p>
          <button
            type="button"
            onClick={copyInvite}
            className="min-h-9 rounded-xl border border-amber-300/25 px-3 text-xs font-semibold text-amber-100/80 hover:bg-white/5"
          >
            {copied ? "Link copied" : "Copy invite"}
          </button>
        </div>

        {view.announcement && view.phase === "lobby" ? (
          <p className="mt-3 text-center text-xs text-amber-100/60">{view.announcement}</p>
        ) : null}

        {view.phase === "lobby" ? (
          <Lobby view={view} onKick={setKickTarget} />
        ) : (
          <Table
            view={view}
            playerId={playerId}
            narrow={narrow}
            drawPending={drawPending}
            onDraw={draw}
            onShuffle={shuffleHand}
            payout={payout}
          />
        )}
      </main>

      {leaveOpen ? (
        <ConfirmDialog
          title="Leave the table?"
          body={
            view.phase === "playing"
              ? "The match keeps going without you and cards are drawn for you automatically. Your entry coins are not refunded."
              : "You can join again with the room code."
          }
          confirmLabel="Leave"
          onConfirm={confirmLeave}
          onCancel={() => setLeaveOpen(false)}
        />
      ) : null}

      {kickTarget ? (
        <ConfirmDialog
          title={`Remove ${kickTarget.name}?`}
          body="They will be taken out of the lobby."
          confirmLabel="Remove"
          onConfirm={() => {
            getKrSocket().emit("kick", { playerId: kickTarget.id });
            setKickTarget(null);
          }}
          onCancel={() => setKickTarget(null)}
        />
      ) : null}

      {toast ? (
        <div className="pointer-events-none fixed inset-x-0 bottom-[max(1rem,env(safe-area-inset-bottom))] z-50 flex justify-center px-4">
          <p className="ui-pop rounded-2xl border border-amber-300/35 bg-[#1a0c10]/95 px-4 py-3 text-center text-sm text-amber-50 shadow-[0_16px_40px_rgba(0,0,0,0.5)]">
            {toast}
          </p>
        </div>
      ) : null}
    </div>
  );
}

function Lobby({ view, onKick }: { view: KrClientView; onKick: (p: KrPublicPlayer) => void }) {
  const connected = view.players.filter((p) => p.connected);
  const readyCount = connected.filter((p) => p.lobbyReady).length;
  const allReady = connected.length > 0 && readyCount === connected.length;
  const isHost = Boolean(view.you?.isHost);
  const canStart = isHost && connected.length >= KR_MIN_PLAYERS && allReady;
  const youReady = Boolean(view.you?.lobbyReady);

  return (
    <div className="lobby-panel mt-4 rounded-[24px] border border-white/10 p-4 shadow-[0_12px_40px_rgba(0,0,0,0.4)] sm:p-5">
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="text-[10px] font-medium uppercase tracking-[0.28em] text-amber-400/75">Table</p>
          <h2 className="mt-1 font-serif text-2xl text-amber-200">Lobby</h2>
        </div>
        <p className="text-right text-xs text-amber-100/70">
          {readyCount}/{connected.length} ready
          <span className="mt-0.5 block text-amber-100/45">min {KR_MIN_PLAYERS} players</span>
        </p>
      </div>

      <ul className="mt-4 space-y-2">
        {view.players.map((p) => {
          const ready = p.connected && p.lobbyReady;
          return (
            <li
              key={p.id}
              className={[
                "lobby-member flex items-center gap-3 rounded-2xl border px-3 py-2.5",
                ready ? "lobby-member--ready" : "lobby-member--waiting",
              ].join(" ")}
            >
              <div
                className={[
                  "lobby-avatar grid size-10 shrink-0 place-items-center rounded-full text-sm font-semibold",
                  !p.connected ? "lobby-avatar--offline" : ready ? "lobby-avatar--ready" : "lobby-avatar--waiting",
                ].join(" ")}
              >
                {p.name.slice(0, 1).toUpperCase()}
              </div>
              <p className="min-w-0 flex-1 truncate text-sm font-medium text-amber-50">
                {p.name}
                {p.id === view.you?.id ? " · you" : ""}
              </p>
              <span
                className={[
                  "lobby-badge shrink-0 rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide",
                  !p.connected ? "lobby-badge--offline" : ready ? "lobby-badge--ready" : "lobby-badge--waiting",
                ].join(" ")}
              >
                {!p.connected ? "Offline" : p.isHost ? "Host" : ready ? "Ready" : "Waiting"}
              </span>
              {isHost && !p.isHost ? (
                <button
                  type="button"
                  onClick={() => onKick(p)}
                  className="min-h-10 shrink-0 rounded-full border border-red-300/40 bg-red-950/80 px-3 text-xs font-semibold text-red-200"
                >
                  Kick
                </button>
              ) : null}
            </li>
          );
        })}
      </ul>

      {isHost ? (
        <>
          <button
            type="button"
            onClick={() => getKrSocket().emit("start")}
            disabled={!canStart}
            className="mt-4 min-h-12 w-full rounded-full bg-linear-to-b from-emerald-300 to-emerald-500 text-base font-semibold text-emerald-950 shadow-[0_8px_24px_rgba(16,185,129,0.25)] disabled:opacity-40"
          >
            Start game
          </button>
          <p className="mt-2 text-center text-xs text-amber-100/55">
            {connected.length < KR_MIN_PLAYERS
              ? `Need ${KR_MIN_PLAYERS - connected.length} more player${KR_MIN_PLAYERS - connected.length === 1 ? "" : "s"}.`
              : allReady
                ? "Everyone is ready."
                : "Wait until every player taps Ready."}
          </p>
        </>
      ) : (
        <>
          <button
            type="button"
            onClick={() => getKrSocket().emit("lobbyReady", { ready: !youReady })}
            className={
              youReady
                ? "lobby-ready-btn--on mt-4 min-h-12 w-full rounded-full text-base font-semibold"
                : "mt-4 min-h-12 w-full rounded-full bg-linear-to-b from-amber-300 to-amber-500 text-base font-semibold text-zinc-950 shadow-[0_8px_24px_rgba(212,175,55,0.25)]"
            }
          >
            {youReady ? "Ready · tap to undo" : "Ready"}
          </button>
          <p className="mt-2 text-center text-xs text-amber-100/55">
            {youReady ? "Waiting for the host to start." : "Tap Ready when you want to play."}
          </p>
        </>
      )}
    </div>
  );
}

function Table({
  view,
  playerId,
  narrow,
  drawPending,
  onDraw,
  onShuffle,
  payout,
}: {
  view: KrClientView;
  playerId: string;
  narrow: boolean;
  drawPending: boolean;
  onDraw: (index: number) => void;
  onShuffle: () => void;
  payout: Payout;
}) {
  const byId = new Map(view.players.map((p) => [p.id, p]));
  const drawer = view.currentTurnId ? byId.get(view.currentTurnId) : undefined;
  const target = view.targetId ? byId.get(view.targetId) : undefined;
  const myTurn = view.phase === "playing" && view.currentTurnId === playerId;
  const beingDrawn = view.phase === "playing" && view.targetId === playerId;
  const hand = view.you?.hand ?? [];
  const lastDraw = view.lastDraw;
  const newCardId = lastDraw?.cardId && !lastDraw.paired ? lastDraw.cardId : null;
  const handSize: CardSize = narrow ? "md" : "lg";

  return (
    <div className="mt-3 flex flex-1 flex-col gap-3">
      <ul className="flex flex-wrap justify-center gap-2">
        {view.players.map((p) => {
          const turn = p.id === view.currentTurnId;
          const targeted = p.id === view.targetId;
          return (
            <li
              key={p.id}
              className={[
                "flex min-w-[96px] items-center gap-2 rounded-2xl border px-2.5 py-1.5 text-left",
                turn
                  ? "border-amber-300/70 bg-amber-400/15 shadow-[0_0_18px_rgba(251,191,36,0.25)]"
                  : targeted
                    ? "border-sky-300/50 bg-sky-400/10"
                    : "border-white/10 bg-black/35",
                !p.connected ? "opacity-60" : "",
              ].join(" ")}
            >
              <span className="grid size-8 shrink-0 place-items-center rounded-full bg-white/10 text-xs font-semibold">
                {p.name.slice(0, 1).toUpperCase()}
              </span>
              <span className="min-w-0">
                <span className="block max-w-[7rem] truncate text-xs font-semibold text-amber-50">
                  {p.name}
                  {p.id === playerId ? " (you)" : ""}
                </span>
                <span className="block text-[10px] text-amber-100/55">
                  {p.finishOrder != null
                    ? p.id === view.loserId
                      ? KALU_RAJINA_NAME
                      : `Out · ${placeLabel(p.finishOrder)}`
                    : `${p.cardCount} card${p.cardCount === 1 ? "" : "s"}${p.connected ? "" : " · offline"}`}
                </span>
              </span>
            </li>
          );
        })}
      </ul>

      {view.phase === "finished" ? (
        <Results view={view} payout={payout} />
      ) : (
        <section className="rounded-[22px] border border-amber-300/20 bg-black/45 p-4 text-center shadow-[0_18px_50px_rgba(0,0,0,0.4)] backdrop-blur-xl">
          <div className="flex items-center justify-center gap-2">
            <p className="text-sm font-semibold text-amber-100">
              {myTurn
                ? `Your turn — take a card from ${target?.name ?? "the next player"}`
                : beingDrawn
                  ? `${drawer?.name ?? "Someone"} is taking a card from you`
                  : `${drawer?.name ?? "Someone"} is drawing from ${target?.name ?? "the next player"}`}
            </p>
            <TurnTimer endsAt={view.turnEndsAt} />
          </div>

          {myTurn && target ? (
            <div className="mt-4 flex flex-wrap justify-center gap-y-3 pl-5">
              {Array.from({ length: target.cardCount }, (_, i) => (
                <button
                  key={i}
                  type="button"
                  disabled={drawPending}
                  onClick={() => onDraw(i)}
                  className="kr-draw-card -ml-5 disabled:opacity-60"
                  aria-label={`Take card ${i + 1}`}
                >
                  <CardBack size={narrow ? "sm" : "md"} />
                </button>
              ))}
            </div>
          ) : (
            <p className="mt-2 text-xs text-amber-100/55">
              {beingDrawn
                ? `Shuffle your hand so they can't guess where the ${KALU_RAJINA_NAME} is.`
                : "Watch for pairs — and for who is hiding the Black Queen."}
            </p>
          )}

          {lastDraw ? (
            <p key={lastDraw.seq} className="kr-pair-in mt-3 text-xs text-amber-100/70">
              {lastDraw.drawerId === playerId ? "You" : lastDraw.drawerName}
              {lastDraw.auto ? " (timed out)" : ""} took a card from{" "}
              {lastDraw.fromId === playerId ? "you" : lastDraw.fromName}
              {lastDraw.paired ? " and made a pair!" : "."}
            </p>
          ) : null}
        </section>
      )}

      {view.recentPairs.length > 0 ? (
        <section className="rounded-2xl border border-white/10 bg-black/30 px-3 py-2">
          <p className="text-[10px] uppercase tracking-[0.24em] text-amber-400/70">Recent pairs</p>
          <div className="mt-2 flex gap-3 overflow-x-auto pb-1">
            {view.recentPairs.slice(0, 4).map((pair) => (
              <div key={pair.cards.map((c) => c.id).join("-")} className="kr-pair-in shrink-0 text-center">
                <div className="flex">
                  {pair.cards.map((card, i) => (
                    <PlayingCard key={card.id} card={card} size="sm" className={i > 0 ? "-ml-7" : ""} />
                  ))}
                </div>
                <p className="mt-1 max-w-[6rem] truncate text-[10px] text-amber-100/55">{pair.playerName}</p>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <section className="mt-auto rounded-[22px] border border-amber-300/15 bg-black/35 px-2 pt-3 pb-2 backdrop-blur-md">
        <div className="flex items-center justify-between px-2">
          <p className="text-[10px] uppercase tracking-[0.24em] text-amber-400/70">Your hand · {hand.length}</p>
          {view.phase === "playing" && hand.length > 1 ? (
            <button
              type="button"
              onClick={onShuffle}
              className={[
                "min-h-9 rounded-xl border px-3 text-xs font-semibold",
                beingDrawn
                  ? "border-amber-300/70 bg-amber-400/20 text-amber-100"
                  : "border-amber-300/25 text-amber-100/75 hover:bg-white/5",
              ].join(" ")}
            >
              Shuffle
            </button>
          ) : null}
        </div>
        <CardFan
          cards={hand}
          size={handSize}
          highlightIds={newCardId ? [newCardId] : []}
          emptyLabel={
            view.you?.finishOrder != null && view.phase === "playing"
              ? `You're out — ${placeLabel(view.you.finishOrder)} place. Waiting for the others.`
              : "No cards"
          }
          compact={narrow}
        />
      </section>
    </div>
  );
}

function Results({ view, payout }: { view: KrClientView; payout: Payout }) {
  const ranked = [...view.players].sort((a, b) => (a.finishOrder ?? 99) - (b.finishOrder ?? 99));
  const isHost = Boolean(view.you?.isHost);

  function coinsFor(p: KrPublicPlayer): string {
    if (p.id === view.loserId) return `−${payout.entry}`;
    if (p.finishOrder === 1) return `+${BigInt(payout.first) - BigInt(payout.entry)}`;
    if (p.finishOrder === 2) return `+${BigInt(payout.second) - BigInt(payout.entry)}`;
    return "±0";
  }

  return (
    <section className="ui-pop rounded-[22px] border border-amber-400/30 bg-black/70 p-4 text-center shadow-[0_20px_45px_rgba(0,0,0,0.35)] backdrop-blur">
      <img src={KALU_RAJINA_CARD_SRC} alt={KALU_RAJINA_NAME} className="mx-auto w-20 rounded-lg shadow-lg" />
      <h2 className="mt-3 font-serif text-xl text-amber-200">{view.announcement ?? "Game over"}</h2>
      <ol className="mt-4 space-y-1.5 text-left">
        {ranked.map((p) => (
          <li
            key={p.id}
            className={[
              "flex items-center justify-between gap-3 rounded-xl px-3 py-2 text-sm",
              p.id === view.loserId ? "bg-red-950/50 text-red-100" : "bg-white/5 text-amber-50",
            ].join(" ")}
          >
            <span className="min-w-0 truncate">
              <span className="mr-2 text-amber-400/80">
                {p.id === view.loserId ? "✗" : placeLabel(p.finishOrder ?? 0)}
              </span>
              {p.name}
              {p.id === view.you?.id ? " (you)" : ""}
            </span>
            <span className="shrink-0 font-semibold">🪙 {coinsFor(p)}</span>
          </li>
        ))}
      </ol>
      {isHost ? (
        <div className="mt-5 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => getKrSocket().emit("stop")}
            className="min-h-12 rounded-full border border-amber-200/25 bg-white/5 text-sm font-medium text-amber-100"
          >
            Back to lobby
          </button>
          <button
            type="button"
            onClick={() => getKrSocket().emit("start")}
            className="min-h-12 rounded-full bg-linear-to-b from-emerald-300 to-emerald-500 text-sm font-semibold text-emerald-950"
          >
            Play again
          </button>
        </div>
      ) : (
        <p className="mt-4 text-xs text-amber-100/50">Waiting for the host to start the next round.</p>
      )}
    </section>
  );
}

function ConfirmDialog({
  title,
  body,
  confirmLabel,
  onConfirm,
  onCancel,
}: {
  title: string;
  body: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/55 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:items-center" onClick={onCancel} role="presentation">
      <div
        className="ui-pop w-full max-w-sm rounded-3xl border border-amber-300/25 bg-[#1a0c10] p-5 text-center shadow-[0_24px_70px_rgba(0,0,0,0.55)]"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <h2 className="font-serif text-xl text-amber-100">{title}</h2>
        <p className="mt-2 text-sm text-amber-100/65">{body}</p>
        <div className="mt-5 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="min-h-12 rounded-full border border-amber-200/25 bg-white/5 text-sm font-medium text-amber-100"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="min-h-12 rounded-full bg-linear-to-b from-red-400 to-red-600 text-sm font-semibold text-white"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
