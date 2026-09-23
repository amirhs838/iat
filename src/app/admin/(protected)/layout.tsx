import { redirect } from "next/navigation";
import { getAdminFromCookies } from "@/lib/auth/session";
import { AdminShell } from "@/components/admin/AdminShell";

export const dynamic = "force-dynamic";

export default async function ProtectedAdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const admin = await getAdminFromCookies();
  if (!admin) {
    redirect("/admin/login");
  }
  return <AdminShell username={admin.username}>{children}</AdminShell>;
}
