import { prismaAdapter } from "@better-auth/prisma-adapter";
import { CoinTransactionType, Prisma } from "@prisma/client";
import { APIError, betterAuth } from "better-auth";
import { withBasePath } from "@/lib/basePath";
import { normalizeUsername, USERNAME_TAKEN_MESSAGE, usernameError } from "@/lib/username";
import { db } from "@/server/db";
import { economyConfig } from "@/server/economy-config";

const configuredAuthUrl = process.env.BETTER_AUTH_URL?.trim();
const authRoutePath = withBasePath("/api/auth");
const usesHttps = configuredAuthUrl?.startsWith("https://") ?? false;

function acceptedUsername(value: unknown): string {
  if (typeof value !== "string") {
    throw new APIError("BAD_REQUEST", { message: "Enter a username." });
  }
  const name = normalizeUsername(value);
  const invalid = usernameError(name);
  if (invalid) throw new APIError("BAD_REQUEST", { message: invalid });
  return name;
}

async function assertUsernameAvailable(name: string, currentUserId?: string) {
  const existing = await db.user.findFirst({
    where: { name },
    select: { id: true },
  });
  if (existing && existing.id !== currentUserId) {
    throw new APIError("BAD_REQUEST", { message: USERNAME_TAKEN_MESSAGE });
  }
}

function isUsernameTakenError(error: unknown): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") {
    return false;
  }
  const target = error.meta?.target;
  const fields = Array.isArray(target) ? target.map(String) : [String(target ?? "")];
  return fields.some((field) => field.toLowerCase().includes("name"));
}

// Prisma nested writes make the user, wallet and signup ledger credit one
// atomic operation. If any part fails, none of them are committed.
const authDatabase = db.$extends({
  query: {
    user: {
      async create({ args, query }) {
        const userId = args.data.id;
        if (typeof userId !== "string") return query(args);
        const data = args.data as Prisma.UserCreateInput;
        try {
          return await query({
            ...args,
            data: {
              ...data,
              wallet: data.wallet ?? {
                create: {
                  balance: economyConfig.signupBonus,
                  ledgerEntries: {
                    create: {
                      type: CoinTransactionType.SIGNUP_BONUS,
                      amount: economyConfig.signupBonus,
                      balanceAfter: economyConfig.signupBonus,
                      idempotencyKey: `signup:${userId}`,
                      referenceId: userId,
                      description: "Welcome bonus",
                    },
                  },
                },
              },
            },
          });
        } catch (error) {
          if (isUsernameTakenError(error)) {
            throw new APIError("BAD_REQUEST", { message: USERNAME_TAKEN_MESSAGE });
          }
          throw error;
        }
      },
    },
  },
});

export const auth = betterAuth({
  appName: "Higanna",
  baseURL: configuredAuthUrl,
  basePath: authRoutePath,
  secret: process.env.BETTER_AUTH_SECRET,
  database: prismaAdapter(authDatabase, {
    provider: "mysql",
    transaction: true,
  }),
  emailAndPassword: {
    enabled: true,
    autoSignIn: true,
    requireEmailVerification: false,
    minPasswordLength: 10,
    maxPasswordLength: 128,
  },
  session: {
    expiresIn: 60 * 60 * 24 * 30,
    updateAge: 60 * 60 * 24,
  },
  rateLimit: {
    enabled: true,
    window: 60,
    max: 100,
    storage: "memory",
  },
  databaseHooks: {
    user: {
      create: {
        before: async (user) => {
          const name = acceptedUsername(user.name);
          await assertUsernameAvailable(name);
          return { data: { ...user, name } };
        },
      },
      update: {
        before: async (user, context) => {
          if (typeof user.name !== "string") return;
          const name = acceptedUsername(user.name);
          await assertUsernameAvailable(name, context?.context.session?.user.id);
          return { data: { ...user, name } };
        },
      },
    },
  },
  advanced: {
    // The current development server uses HTTP. This becomes true
    // automatically when BETTER_AUTH_URL is changed to an HTTPS URL.
    useSecureCookies: usesHttps,
    ipAddress: {
      // Nginx replaces this header with the connecting client address.
      ipAddressHeaders: ["x-real-ip"],
    },
  },
});

export type AuthSession = typeof auth.$Infer.Session;
