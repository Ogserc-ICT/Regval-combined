"use server";

/**
 * The bell's actions. Each one acts only on the signed-in person's own
 * notifications and preference; nothing here can touch anyone else's.
 */
import { getCurrentActor } from "@/server/auth/session";
import { db } from "@/server/db/client";
import { markRead, setSoundPreference } from "@/server/services/notifications";

const UUID = /^[0-9a-f-]{36}$/i;

export async function markNotificationsReadAction(ids: string[] | "all"): Promise<void> {
  const actor = await getCurrentActor();
  if (!actor) return;
  const list = ids === "all" ? "all" : ids.filter((x) => typeof x === "string" && UUID.test(x)).slice(0, 100);
  await markRead(db, actor.id, list);
}

export async function setNotificationSoundAction(on: boolean): Promise<void> {
  const actor = await getCurrentActor();
  if (!actor) return;
  await setSoundPreference(db, actor.id, on === true);
}
