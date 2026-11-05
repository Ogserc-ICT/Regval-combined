import "server-only";
import { asc, eq } from "drizzle-orm";
import { db } from "@/server/db/client";
import { units } from "@/server/db/schema";

export async function unitOptions() {
  return db.select({ id: units.id, name: units.name }).from(units).where(eq(units.active, true)).orderBy(asc(units.sort));
}
