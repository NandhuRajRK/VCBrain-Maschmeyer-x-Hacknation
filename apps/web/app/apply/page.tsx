import { redirect } from "next/navigation";

export default function LegacyApplicationRoute() {
  redirect("/opportunities?new=1");
}
