"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ChartColumnIcon,
  HouseIcon,
  PackageIcon,
  ShoppingCartIcon,
  ArrowDownUpIcon,
  type LucideIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";

type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  ownerOnly?: boolean;
};

// One list drives both the sidebar and the bottom bar, so they can't drift.
// Icons are component references, which don't survive the server → client
// boundary, so this lives in the client module and the layout passes a role flag
// rather than a filtered list of items.
const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: HouseIcon },
  { href: "/products", label: "Products", icon: PackageIcon },
  { href: "/stock", label: "Stock", icon: ArrowDownUpIcon },
  { href: "/sell", label: "Sell", icon: ShoppingCartIcon },
  { href: "/reports", label: "Reports", icon: ChartColumnIcon, ownerOnly: true },
];

// Hiding an item is convenience, never protection: /reports guards itself with
// requireRole(Role.OWNER).
function visibleItems(isOwner: boolean) {
  return NAV_ITEMS.filter((item) => isOwner || !item.ownerOnly);
}

function useIsActive() {
  const pathname = usePathname();

  return (href: string) => pathname === href || pathname.startsWith(`${href}/`);
}

export function SidebarNav({ isOwner }: { isOwner: boolean }) {
  const isActive = useIsActive();

  return (
    <aside className="hidden w-60 shrink-0 flex-col border-r bg-sidebar text-sidebar-foreground md:flex">
      <div className="flex h-16 items-center gap-2 border-b px-4">
        <span className="text-lg font-semibold tracking-tight">
          Salon Stock
        </span>
      </div>

      <nav aria-label="Main" className="flex flex-col gap-1 p-3">
        {visibleItems(isOwner).map(({ href, label, icon: Icon }) => {
          const active = isActive(href);

          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex h-11 items-center gap-3 rounded-lg px-3 text-base font-medium transition-colors",
                active
                  ? "bg-sidebar-primary text-sidebar-primary-foreground"
                  : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
              )}
            >
              <Icon className="size-5" />
              {label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}

export function BottomNav({ isOwner }: { isOwner: boolean }) {
  const isActive = useIsActive();

  return (
    // Fixed rather than sticky so it survives the page scrolling under it, and
    // padded for the home-indicator strip on tall phones.
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-40 flex border-t bg-background pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      {visibleItems(isOwner).map(({ href, label, icon: Icon }) => {
        const active = isActive(href);

        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              // min-h-16 keeps every tab well past the 44px tap target, with the
              // label always visible — staff shouldn't have to decode icons.
              "flex min-h-16 flex-1 flex-col items-center justify-center gap-1 px-1 text-xs font-medium",
              active
                ? "text-primary"
                : "text-muted-foreground active:bg-muted",
            )}
          >
            <span
              className={cn(
                "flex h-8 w-12 items-center justify-center rounded-full transition-colors",
                active && "bg-accent text-accent-foreground",
              )}
            >
              <Icon className="size-5" />
            </span>
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
