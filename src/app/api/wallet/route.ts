import { getCurrentSession } from "@/server/session";
import { getWallet } from "@/server/wallet";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getCurrentSession();
  if (!session) {
    return Response.json({ error: "Authentication required." }, { status: 401 });
  }

  const wallet = await getWallet(session.user.id);
  return Response.json(
    {
      balance: wallet.balance.toString(),
      reservedBalance: wallet.reservedBalance.toString(),
      availableBalance: wallet.availableBalance.toString(),
      recentEntries: wallet.recentEntries.map((entry) => ({
        id: entry.id,
        type: entry.type,
        amount: entry.amount.toString(),
        balanceAfter: entry.balanceAfter.toString(),
        referenceId: entry.referenceId,
        description: entry.description,
        createdAt: entry.createdAt.toISOString(),
      })),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
