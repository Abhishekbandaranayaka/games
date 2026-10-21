import { AuthScreen } from "@/components/AuthScreen";
import { GameRoom } from "@/components/GameRoom";
import { economyConfig } from "@/server/economy-config";
import { getCurrentSession } from "@/server/session";
import { getWallet } from "@/server/wallet";

export const dynamic = "force-dynamic";

export default async function RoomPage({
  params,
  searchParams,
}: {
  params: Promise<{ code: string }>;
  searchParams: Promise<{ join?: string }>;
}) {
  const { code } = await params;
  const query = await searchParams;
  const inviteJoin = query.join === "1";
  const session = await getCurrentSession();

  if (!session) {
    const callbackUrl = `/room/${encodeURIComponent(code)}${inviteJoin ? "?join=1" : ""}`;
    return <AuthScreen callbackUrl={callbackUrl} />;
  }
  const wallet = await getWallet(session.user.id);

  return (
    <GameRoom
      codeParam={code}
      inviteJoin={inviteJoin}
      initialCoinBalance={wallet.availableBalance.toString()}
      matchEntryCoins={economyConfig.matchEntry.toString()}
      playerId={session.user.id}
      playerName={session.user.name}
    />
  );
}
