// auth.ts
//
// This is the "front door" of the app. It sets up login with Google.
// After a user logs in, Google gives us an "access token" — a temporary pass
// that lets us read that user's calendar. We keep that pass safe here and hand
// it to our calendar code when needed.
//
// Word list:
// - "provider"      = the login method (here, Google).
// - "scope"         = the exact permissions we ask Google for.
// - "access token"  = a short-lived pass to call Google on the user's behalf.
// - "refresh token" = a long-lived key we use to get a NEW access token when
//                     the old one expires (access tokens last about 1 hour).
// - "callback"      = a function NextAuth runs at a certain moment so we can
//                     add our own steps (like saving tokens).

import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { prisma } from "./lib/prisma";

// This tells TypeScript that our login "session" carries a few extra fields
// (the Google pass, and our database user id). Without this, the editor would
// complain when we read `session.accessToken`.
declare module "next-auth" {
  interface Session {
    accessToken?: string;
    userId?: string;
    error?: string;
  }
}

// The "token" is the small packet NextAuth keeps between requests. We store our
// extra fields on it. This alias just names those fields for the editor.
// (The `& Record<...>` keeps it compatible with NextAuth's own token type.)
type AppToken = {
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: number; // seconds since 1970 when the access token dies.
  userId?: string;
  error?: string;
} & Record<string, unknown>;

// A small helper: when the access token is old, use the refresh token to get a
// fresh one from Google. Do not worry about every line — the idea is:
// "trade the long-lived key for a new short-lived pass."
async function refreshGoogleToken(token: {
  refreshToken?: string;
}): Promise<Partial<AppToken>> {
  try {
    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID!,
        client_secret: process.env.GOOGLE_CLIENT_SECRET!,
        grant_type: "refresh_token",
        refresh_token: token.refreshToken ?? "",
      }),
    });

    const data = await response.json();
    if (!response.ok) throw data;

    return {
      accessToken: data.access_token,
      // Google may or may not send a new refresh token; keep the old one if not.
      refreshToken: data.refresh_token ?? token.refreshToken,
      expiresAt: Math.floor(Date.now() / 1000) + Number(data.expires_in),
    };
  } catch {
    // If refresh fails, mark an error so the app can ask the user to log in again.
    return { error: "RefreshFailed" };
  }
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  // trustHost lets the app run on localhost and on Vercel without extra config.
  trustHost: true,

  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      authorization: {
        params: {
          // The permissions we ask for. `calendar.readonly` lets us READ the
          // user's calendar but never change it.
          scope:
            "openid email profile https://www.googleapis.com/auth/calendar.readonly",
          // `offline` + `consent` make Google send us a refresh token, so our
          // access does not fully die after one hour.
          access_type: "offline",
          prompt: "consent",
        },
      },
    }),
  ],

  // "jwt" means we store the login in a signed cookie, not a database session.
  // Simpler to run, and perfect for an MVP.
  session: { strategy: "jwt" },

  callbacks: {
    // The jwt callback runs whenever a token is made or read.
    // On first login, `account` is filled in — that is when Google hands us the
    // tokens. We save them, and we also save the user into our database.
    async jwt({ token, account, profile }) {
      // Name our extra fields on the token for the editor.
      const t = token as AppToken;

      // FIRST LOGIN: account is present.
      if (account) {
        t.accessToken = account.access_token;
        t.refreshToken = account.refresh_token;
        t.expiresAt = account.expires_at;

        // Save (or update) this person in our database so meetings can link
        // to them later. `upsert` = update if they exist, else create.
        const email = profile?.email;
        if (email) {
          const user = await prisma.user.upsert({
            where: { email },
            update: {
              name: profile?.name,
              image: (profile as { picture?: string })?.picture,
              googleAccessToken: account.access_token,
              googleRefreshToken: account.refresh_token,
              googleTokenExpiry: account.expires_at
                ? new Date(account.expires_at * 1000)
                : null,
            },
            create: {
              email,
              name: profile?.name,
              image: (profile as { picture?: string })?.picture,
              googleAccessToken: account.access_token,
              googleRefreshToken: account.refresh_token,
              googleTokenExpiry: account.expires_at
                ? new Date(account.expires_at * 1000)
                : null,
            },
          });
          t.userId = user.id;
        }
        return t;
      }

      // LATER CALLS: if the pass is still fresh, keep using it.
      const now = Math.floor(Date.now() / 1000);
      if (t.expiresAt && now < t.expiresAt - 60) {
        return t;
      }

      // Otherwise the pass is old — get a fresh one.
      const refreshed = await refreshGoogleToken(t);
      return { ...t, ...refreshed };
    },

    // The session callback decides what the browser side is allowed to see.
    // We expose the access token and our user id (but never the refresh token).
    async session({ session, token }) {
      const t = token as AppToken;
      return {
        ...session,
        accessToken: t.accessToken,
        userId: t.userId,
        error: t.error,
      };
    },
  },
});
