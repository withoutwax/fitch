"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "./AuthProvider";

const links = [
  { href: "/problems", label: "Problems" },
  { href: "/rules", label: "Rules" },
];

export function NavBar() {
  const { user, loading } = useAuth();
  const path = usePathname();

  return (
    <header className="sticky top-0 z-20 border-b border-line bg-surface/90 backdrop-blur">
      <nav className="mx-auto flex h-14 max-w-6xl items-center gap-6 px-4">
        <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
          <span className="grid h-7 w-7 place-items-center rounded-md bg-accent font-logic text-sm text-accent-fg">⊢</span>
          Fitch
        </Link>
        <div className="flex items-center gap-1 text-sm">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={`rounded-md px-3 py-1.5 transition-colors ${
                path.startsWith(l.href) ? "bg-surface-2 text-text" : "text-muted hover:text-text"
              }`}
            >
              {l.label}
            </Link>
          ))}
        </div>
        <div className="ml-auto text-sm">
          {loading ? null : user ? (
            <Link href="/profile" className="flex items-center gap-2 rounded-full py-1 pr-1 pl-3 hover:bg-surface-2">
              <span className="hidden text-muted sm:inline">{user.displayName || user.email}</span>
              <Avatar name={user.displayName || user.email || "?"} />
            </Link>
          ) : (
            <Link href={`/login?next=${encodeURIComponent(path)}`} className="rounded-md bg-accent px-3 py-1.5 font-medium text-accent-fg hover:opacity-90">
              Sign in
            </Link>
          )}
        </div>
      </nav>
    </header>
  );
}

export function Avatar({ name, size = 28 }: { name: string; size?: number }) {
  return (
    <span
      className="grid shrink-0 place-items-center rounded-full bg-accent-soft font-medium text-accent uppercase"
      style={{ width: size, height: size, fontSize: size * 0.42 }}
    >
      {name.trim()[0] ?? "?"}
    </span>
  );
}
