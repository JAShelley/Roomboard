import { redirect } from "next/navigation";

export default function DemoPage() {
  redirect("/roomboard/index.html?mode=demo");
}
