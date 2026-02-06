// Minimal local Prisma client shim for TypeScript builds and local dev when a generated
// Prisma client is not present. This avoids build errors in environments where the
// project's Prisma setup hasn't generated the client yet.

// NOTE: This is a lightweight shim and does NOT implement Prisma functionality.
// If you run code that actually calls prisma methods, generate the real client via
// `npx prisma generate` or replace this file with your project's generated client.

export const prisma: any = {};
