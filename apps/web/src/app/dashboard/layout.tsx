"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { logout } from "@/lib/useAuth";

const NAV_ITEMS = [
  { href: "/dashboard/contacts", label: "Contacts" },
  { href: "/dashboard/groups", label: "Groups" },
  { href: "/dashboard/connectors", label: "Connectors" },
  { href: "/dashboard/compose", label: "Compose" },
  { href: "/dashboard/campaigns", label: "Campaigns" },
  { href: "/dashboard/workflows", label: "Workflows" },
  { href: "/dashboard/help", label: "Help" },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="flex min-h-screen">
      <aside className="w-56 shrink-0 border-r border-gray-200 bg-white p-4">
        <div className="mb-6 text-sm font-semibold text-gray-900">AN Telegram Platform</div>
        <nav className="space-y-1">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`block rounded px-3 py-2 text-sm ${
                pathname?.startsWith(item.href) ? "bg-indigo-50 font-medium text-indigo-700" : "text-gray-600 hover:bg-gray-50"
              }`}
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <button onClick={logout} className="mt-8 text-sm text-gray-400 hover:text-gray-600">
          Sign out
        </button>
      </aside>
      <main className="flex-1 p-8">{children}</main>
    </div>
  );
}
