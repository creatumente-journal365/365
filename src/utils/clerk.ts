import { createClerkClient } from "@clerk/backend";

/**
 * Server-side Clerk client for use in server functions and API routes.
 * Uses the secret key which must never be exposed to the client.
 */
export const clerkClient = createClerkClient({
  secretKey: process.env.CLERK_SECRET_KEY!,
});
