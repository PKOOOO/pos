import { redirect } from "next/navigation";

// There is no marketing page for this app — everyone who opens it is shop staff.
// Signed-out visitors are sent to /sign-in from the proxy.
export default function RootPage() {
  redirect("/dashboard");
}
