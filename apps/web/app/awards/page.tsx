import { redirect } from "next/navigation";

/* Kept so links written before the navigation was simplified still land
   somewhere useful. */
export default function Page() {
  redirect("/projects");
}
