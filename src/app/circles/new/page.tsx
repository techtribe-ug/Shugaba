import { redirect } from "next/navigation";
import { BackBar } from "@/components/ui/top-bar";
import { currentMember } from "@/lib/auth/session";
import { CreateForm } from "./form";

export default async function NewCircle() {
  if (!(await currentMember())) redirect("/login?next=/circles/new");
  return (
    <div className="mx-auto flex min-h-dvh max-w-[480px] flex-col">
      <BackBar href="/home" title="New circle" />
      <CreateForm feeBps={{ BASIC: Number(process.env.POOL_FEE_BPS_BASIC) || 100, STANDARD: Number(process.env.POOL_FEE_BPS_STANDARD) || 200, PLUS: Number(process.env.POOL_FEE_BPS_PLUS) || 300 }} />
    </div>
  );
}
