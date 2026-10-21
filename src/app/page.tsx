import { AuthScreen } from "@/components/AuthScreen";
import { HubDashboard } from "@/components/HubDashboard";
import { economyConfig } from "@/server/economy-config";
import { getCurrentSession } from "@/server/session";
import { getWallet } from "@/server/wallet";

export const dynamic = "force-dynamic";

export default async function Hub() {
  const session = await getCurrentSession();
  if (!session) return <AuthScreen />;
  const wallet = await getWallet(session.user.id);

  return (
    <HubDashboard
      player={{
        name: session.user.name,
        email: session.user.email,
        coinBalance: wallet.availableBalance.toString(),
      }}
      matchEntryCoins={economyConfig.matchEntry.toString()}
    />
  );
}
