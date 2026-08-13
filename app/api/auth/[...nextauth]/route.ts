// app/api/auth/[...nextauth]/route.ts
//
// This tiny file connects NextAuth to the web.
// The "[...nextauth]" folder name is a catch-all: it handles every login web
// address, like /api/auth/signin, /api/auth/callback/google, and /api/auth/signout.
//
// We built the real logic in auth.ts. It gives us a `handlers` object that
// holds the GET and POST functions. We unpack them here for the web.
import { handlers } from "@/auth";
export const { GET, POST } = handlers;
