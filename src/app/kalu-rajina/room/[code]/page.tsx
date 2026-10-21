import { AuthScreen } from "@/components/AuthScreen";
import { KrRoom } from "@/components/kalu-rajina/KrRoom";
import { krRoomPath } from "@/lib/routes";
import { economyConfig } from "@/server/economy-config";
import { getCurrentSession } from "@/server/session";
import { getWallet } from "@/server/wallet";

export const dynamic = "force-dynamic";

export default async function KaluRajinaRoomPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const session = await getCurrentSession();
  if (!session) return <AuthScreen callbackUrl={krRoomPath(encodeURIComponent(code))} />;
  const wallet = await getWallet(session.user.id);

  const entry = economyConfig.matchEntry;
  const firstShare = (entry * economyConfig.kingPrizePercent) / BigInt(100);

  return (
    <KrRoom
      codeParam={code}
      playerId={session.user.id}
      initialCoinBalance={wallet.availableBalance.toString()}
      payout={{
        entry: entry.toString(),
        first: (entry + firstShare).toString(),
        second: (entry + entry - firstShare).toString(),
      }}
    />
  );
}
