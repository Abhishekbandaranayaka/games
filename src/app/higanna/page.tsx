import { AuthScreen } from "@/components/AuthScreen";
import { HomeScreen } from "@/components/HomeScreen";
import { HIGANNA_PATH } from "@/lib/routes";
import { economyConfig } from "@/server/economy-config";
import { getCurrentSession } from "@/server/session";
import { getWallet } from "@/server/wallet";

export const dynamic = "force-dynamic";

export default async function HigannaHome() {
  const session = await getCurrentSession();
  if (!session) return <AuthScreen callbackUrl={HIGANNA_PATH} />;
  const wallet = await getWallet(session.user.id);

  return (
    <HomeScreen
      player={{
        name: session.user.name,
        email: session.user.email,
        coinBalance: wallet.availableBalance.toString(),
      }}
      matchEntryCoins={economyConfig.matchEntry.toString()}
    />
  );
}
