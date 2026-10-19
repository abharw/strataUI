/**
 * Names and email on a namespace. Names are null unless an agent supplied them; never derive one
 * from the email local part.
 */

import "server-only";

import { eq } from "drizzle-orm";

import { getDb, schema } from "@/server/db";

export interface NamespaceIdentity {
  displayName: string | null;
  personName: string | null;
  /** The verified sign-in address. */
  email: string | null;
}

/** The identity on one namespace, or null when the id names nothing. */
export async function readNamespaceIdentity(
  namespaceId: string,
): Promise<NamespaceIdentity | null> {
  const [row] = await getDb()
    .select({
      displayName: schema.namespaces.displayName,
      personName: schema.namespaces.personName,
      email: schema.namespaces.email,
    })
    .from(schema.namespaces)
    .where(eq(schema.namespaces.id, namespaceId))
    .limit(1);
  return row ?? null;
}
