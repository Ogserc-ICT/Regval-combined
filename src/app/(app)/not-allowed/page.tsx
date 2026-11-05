import Link from "next/link";
import { ShieldAlert } from "lucide-react";
import { buttonVariants } from "@/components/ui";
import { PERMISSIONS, ROLE_LABELS, type Permission, type Role } from "@/domain/roles";

export default async function NotAllowedPage({ searchParams }: PageProps<"/not-allowed">) {
  const { need } = await searchParams;
  const perm = typeof need === "string" && need in PERMISSIONS ? (need as Permission) : null;
  const roles = perm ? (PERMISSIONS[perm] as readonly Role[]).map((r) => ROLE_LABELS[r]) : [];
  return (
    <div className="mx-auto max-w-md py-16 text-center">
      <ShieldAlert className="mx-auto h-10 w-10 text-warn" />
      <h1 className="mt-4 text-lg font-semibold">You don&apos;t have access to this page</h1>
      <p className="mt-2 text-sm text-muted">
        {roles.length ? `It needs one of these roles: ${roles.join(", ")}.` : "Your roles don't include this page."} Ask an admin if you
        need it.
      </p>
      <Link href="/dashboard" className={buttonVariants({ variant: "secondary", className: "mt-6" })}>
        Back to the dashboard
      </Link>
    </div>
  );
}
