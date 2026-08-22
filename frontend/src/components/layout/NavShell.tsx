import { NavLink, Outlet } from "react-router-dom";
import { UserButton } from "@clerk/clerk-react";
import { Activity, MessageSquare, MapPinned, FileStack, UserRound } from "lucide-react";
import type { LucideIcon } from "lucide-react";

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
}

const NAV_ITEMS: NavItem[] = [
  { to: "/dashboard", label: "Home", icon: Activity },
  { to: "/chat", label: "Chat", icon: MessageSquare },
  { to: "/find-care", label: "Find Care", icon: MapPinned },
  { to: "/my-data", label: "My Data", icon: FileStack },
  { to: "/profile", label: "Profile", icon: UserRound },
];

export function NavShell() {
  return (
    <div className="min-h-dvh bg-bg-mist text-ink">
      <div className="mx-auto flex min-h-dvh max-w-[1400px]">
        <aside className="sticky top-0 hidden h-dvh w-[76px] shrink-0 flex-col items-center gap-1 border-r border-hairline py-6 lg:flex xl:w-[220px] xl:items-stretch xl:px-4">
          <div className="mb-8 flex w-full items-center gap-2 px-2 xl:px-2">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-ink text-bg-mist">
              <ThreadMark />
            </span>
            <span className="hidden font-display text-lg tracking-tight xl:inline">
              MedSys
            </span>
          </div>
          <nav className="flex w-full flex-1 flex-col gap-1">
            {NAV_ITEMS.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end
                className={({ isActive }) =>
                  [
                    "group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors duration-150",
                    isActive
                      ? "bg-ink text-bg-mist"
                      : "text-stone hover:bg-surface-card hover:text-ink",
                  ].join(" ")
                }
              >
                <item.icon className="h-[18px] w-[18px] shrink-0" strokeWidth={1.75} />
                <span className="hidden xl:inline">{item.label}</span>
              </NavLink>
            ))}
          </nav>

          <div className="mt-auto flex w-full items-center gap-2 border-t border-hairline px-2 pt-4 xl:px-2">
            <UserButton afterSignOutUrl="/" />
            <span className="hidden font-mono text-[11px] text-stone xl:inline">
              Account
            </span>
          </div>
        </aside>

        <main className="flex-1 pb-24 lg:pb-0">
          <Outlet />
        </main>
      </div>

      <nav
        aria-label="Primary"
        className="fixed inset-x-0 bottom-0 z-40 flex items-stretch justify-around border-t border-hairline bg-surface-card/95 backdrop-blur lg:hidden"
      >
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end
            className={({ isActive }) =>
              [
                "flex flex-1 flex-col items-center gap-1 py-2.5 text-[11px] transition-colors duration-150",
                isActive ? "text-teal-deep" : "text-stone",
              ].join(" ")
            }
          >
            <item.icon className="h-[19px] w-[19px]" strokeWidth={1.75} />
            {item.label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}

function ThreadMark() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M2 12C5 12 5 4 8 4C11 4 11 12 14 12"
        stroke="url(#navThreadGrad)"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <defs>
        <linearGradient id="navThreadGrad" x1="0" y1="0" x2="16" y2="0">
          <stop offset="0%" stopColor="#5B5FEF" />
          <stop offset="100%" stopColor="#2F6E68" />
        </linearGradient>
      </defs>
    </svg>
  );
}
