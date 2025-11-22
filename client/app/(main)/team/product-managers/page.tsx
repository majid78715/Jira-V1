import { redirect } from "next/navigation";

export default function LegacyProductManagersRedirect() {
  redirect("/admin/product-managers");
}
