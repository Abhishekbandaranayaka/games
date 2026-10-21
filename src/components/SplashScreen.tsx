"use client";

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { HubLogo } from "@/components/HubLogo";
import { KrLogo } from "@/components/kalu-rajina/KrLogo";
import { SPLASH_LOGO_SRC } from "@/lib/brand";
import { BASE_PATH } from "@/lib/basePath";
import { HIGANNA_PATH, isHigannaPath, isKaluRajinaPath, KALU_RAJINA_PATH } from "@/lib/routes";

type GameId = "higanna" | "kalu-rajina";
type SplashBrand = "hub" | GameId;

const SPLASH_MS = 2000;
const FADE_MS = 400;

const GAME_ROOTS: Record<GameId, string> = {
  higanna: HIGANNA_PATH,
  "kalu-rajina": KALU_RAJINA_PATH,
};

export function gameStartedSessionKey(code: string, game: GameId = "higanna") {
  return `${game}-game-started-${code.toUpperCase()}`;
}

export function markGameStarted(code: string, game: GameId = "higanna") {
  sessionStorage.setItem(gameStartedSessionKey(code, game), "1");
}

export function clearGameStarted(code: string, game: GameId = "higanna") {
  sessionStorage.removeItem(gameStartedSessionKey(code, game));
}

function appPathOf(pathname: string | null): string {
  if (!pathname) return "/";
  return BASE_PATH && pathname.startsWith(`${BASE_PATH}/`)
    ? pathname.slice(BASE_PATH.length)
    : pathname;
}

function splashBrandFor(pathname: string | null): SplashBrand {
  const appPath = appPathOf(pathname);
  if (isHigannaPath(appPath)) return "higanna";
  if (isKaluRajinaPath(appPath)) return "kalu-rajina";
  return "hub";
}

function roomCodeFromPath(pathname: string | null, game: GameId): string | null {
  const roomPrefix = `${GAME_ROOTS[game]}/room/`;
  const appPath = appPathOf(pathname);
  if (!appPath.startsWith(roomPrefix)) return null;
  const code = appPath.slice(roomPrefix.length).split("/")[0]?.trim();
  if (!code || code === "new") return null;
  return code.toUpperCase();
}

/** Skip splash only when refreshing mid-match — lobby refresh still shows splash. */
function shouldSkipSplash(pathname: string | null): boolean {
  if (typeof window === "undefined") return false;
  const brand = splashBrandFor(pathname);
  if (brand === "hub") return false;
  const code = roomCodeFromPath(pathname, brand);
  if (!code) return false;
  return sessionStorage.getItem(gameStartedSessionKey(code, brand)) === "1";
}

/**
 * Splash on first load and on refresh, branded for the hub or the current game.
 * Replays once when entering a game from the hub.
 * App content mounts underneath immediately so the handoff after splash is seamless.
 */
export function AppBoot({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const brand = splashBrandFor(pathname);
  const [splash, setSplash] = useState<{ brand: SplashBrand; run: number }>(() => ({
    brand,
    run: 0,
  }));
  const [phase, setPhase] = useState<"splash" | "leaving" | "done">("splash");
  const [progressOn, setProgressOn] = useState(false);
  const previousBrand = useRef(brand);

  useLayoutEffect(() => {
    if (shouldSkipSplash(pathname)) {
      setPhase("done");
    }
  }, [pathname]);

  useEffect(() => {
    const previous = previousBrand.current;
    previousBrand.current = brand;
    if (previous === brand || brand === "hub" || shouldSkipSplash(pathname)) return;
    setSplash((current) => ({ brand, run: current.run + 1 }));
    setProgressOn(false);
    setPhase("splash");
  }, [brand, pathname]);

  useEffect(() => {
    if (splash.run === 0 && shouldSkipSplash(pathname)) return;

    const start = window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => setProgressOn(true));
    });
    const leaveTimer = window.setTimeout(() => setPhase("leaving"), SPLASH_MS);
    const doneTimer = window.setTimeout(() => setPhase("done"), SPLASH_MS + FADE_MS);
    return () => {
      window.cancelAnimationFrame(start);
      window.clearTimeout(leaveTimer);
      window.clearTimeout(doneTimer);
    };
    // Runs on boot and on each game-entry replay, not on every client navigation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [splash.run]);

  return (
    <>
      <div
        className={[
          "app-boot-stage min-h-full",
          phase !== "done" ? "app-boot-stage--splash" : "",
        ].join(" ")}
      >
        {children}
      </div>

      {phase !== "done" ? (
        <div
          className={["splash-boot", phase === "leaving" ? "splash-boot--fade" : ""].join(" ")}
          aria-hidden={phase !== "splash"}
        >
          <div className="splash-boot__bg" aria-hidden="true">
            <div className="app-bg__base" />
            <div className="app-bg__mesh" />
            <div className="app-bg__sheen" />
            <div className="app-bg__orb app-bg__orb--amber" />
            <div className="app-bg__orb app-bg__orb--emerald" />
            <div className="app-bg__orb app-bg__orb--rose" />
            <div className="app-bg__vignette" />
          </div>
          <div className="splash-boot__inner">
            {splash.brand === "higanna" ? (
              <img
                src={SPLASH_LOGO_SRC}
                alt=""
                width={280}
                height={280}
                className="splash-boot__logo"
                decoding="async"
                fetchPriority="high"
                draggable={false}
              />
            ) : splash.brand === "kalu-rajina" ? (
              <KrLogo size="splash" />
            ) : (
              <HubLogo size="splash" />
            )}
            <div className="splash-boot__progress-wrap">
              <div
                className="splash-boot__progress-track"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={progressOn ? 100 : 0}
                aria-label="Loading"
              >
                <div
                  className="splash-boot__progress-bar"
                  style={{ width: progressOn ? "100%" : "0%" }}
                />
              </div>
              <p className="splash-boot__label">Loading</p>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
