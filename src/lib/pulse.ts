/** Shapes shared by the pulse/notifications endpoints and the browser (docs/PLAN.md §11f). */

export type NotificationItem = {
  id: string;
  title: string;
  body: string | null;
  reference: string | null;
  href: string;
  actorName: string | null;
  /** ISO timestamp. */
  createdAt: string;
  read: boolean;
};

export type Pulse = { v: number; unread: number; newest: NotificationItem | null };

/** Fired on window after every successful poll, so the bell can react without polling itself. */
export const PULSE_EVENT = "ogserc:pulse";
