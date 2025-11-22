import { redirect } from "next/navigation";

export default function LegacyProjectManagersRedirect() {
  redirect("/admin/project-managers");
}
