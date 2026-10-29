import { redirect } from "next/navigation";
import { BackBar } from "@/components/ui/top-bar";

export const dynamic = "force-dynamic";

async function go(form: FormData) {
  "use server";
  const code = String(form.get("code") ?? "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 32);
  if (code.length < 4) redirect("/join?bad=1");
  redirect(`/join/${code}`);
}

/** "I have a code" (design GStates): type the invite code from a message. */
export default async function JoinWithCode({ searchParams }: { searchParams: Promise<{ bad?: string }> }) {
  const { bad } = await searchParams;
  return (
    <div className="mx-auto flex min-h-dvh max-w-[480px] flex-col">
      <BackBar href="/home" title="Join a circle" />
      <main className="flex flex-1 flex-col px-5 pt-4 pb-6 rise">
        <form action={go} className="flex flex-col gap-3">
          <label htmlFor="code" className="text-[15px] font-bold">Invite code</label>
          <input id="code" name="code" autoFocus autoCapitalize="characters" autoComplete="off" placeholder="FAMILY26" className="num h-14 rounded-[14px] border border-line px-4 text-xl font-bold tracking-wider uppercase" />
          {bad ? <p role="alert" className="text-sm text-failed">That code looks too short.</p> : null}
          <button className="mt-2 inline-flex h-14 items-center justify-center rounded-[14px] bg-text text-base font-bold text-white">Continue</button>
        </form>
      </main>
    </div>
  );
}
