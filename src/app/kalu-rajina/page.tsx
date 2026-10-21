import { AuthScreen } from "@/components/AuthScreen";
import { KrHome } from "@/components/kalu-rajina/KrHome";
import { KALU_RAJINA_PATH } from "@/lib/routes";
import { economyConfig } from "@/server/economy-config";
import { getCurrentSession } from "@/server/session";
import { getWallet } from "@/server/wallet";

export const dynamic = "force-dynamic";

export default async function KaluRajinaHome() {
  const session = await getCurrentSession();
  if (!session) return <AuthScreen callbackUrl={KALU_RAJINA_PATH} />;
  const wallet = await getWallet(session.user.id);

  return (
    <KrHome
      player={{ name: session.user.name, coinBalance: wallet.availableBalance.toString() }}
      matchEntryCoins={economyConfig.matchEntry.toString()}
    />
  );
}
