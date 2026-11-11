import Link from "next/link";
import { Icon, type IconName } from "@/components/icons";

type Tab = "circle" | "money" | "shugaba" | "me";

/** Member app navigation: one tap between the circle, my money, Shugaba and me. */
export function TabBar({ circleId, active }: { circleId: string; active: Tab }) {
  const tabs: { key: Tab; label: string; href: string; icon: IconName }[] = [
    { key: "circle", label: "Circle", href: `/c/${circleId}`, icon: "feed" },
    { key: "money", label: "Money", href: `/c/${circleId}/money`, icon: "ledger" },
    { key: "shugaba", label: "Shugaba", href: `/c/${circleId}/chat`, icon: "send" },
    { key: "me", label: "Me", href: "/settings", icon: "user" },
  ];
  return (
    <nav aria-label="Main" className="sticky bottom-0 z-30 border-t border-line bg-white/95 backdrop-blur">
      <ul className="mx-auto grid max-w-[560px] grid-cols-4">
        {tabs.map((t) => {
          const on = t.key === active;
          return (
            <li key={t.key}>
              <Link href={t.href} aria-current={on ? "page" : undefined} className={`flex h-16 flex-col items-center justify-center gap-1 text-[12px] font-bold no-underline ${on ? "text-text" : "text-[#A1A1AA]"}`}>
                <Icon name={t.icon} size={22} stroke={on ? 2.4 : 2} />
                {t.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
