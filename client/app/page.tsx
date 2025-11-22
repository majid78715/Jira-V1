import { redirect } from "next/navigation";

export default function Home() {
  // TODO: Replace with real auth guard once available
  redirect("/dashboard");
}
