'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const ROLES = [
  { href: '/teacher', label: 'Teacher' },
  { href: '/parent', label: 'Parent' },
  { href: '/coordinator', label: 'Coordinator' },
  { href: '/sponsor', label: 'Sponsor' },
  { href: '/treasurer', label: 'Treasurer' },
  { href: '/privacy', label: 'Privacy' },
];

export function Logo({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden>
      <circle cx="16" cy="16" r="16" fill="#e4572e" />
      <circle cx="10.5" cy="12" r="3" fill="#fff" /><circle cx="21.5" cy="12" r="3" fill="#fff" /><circle cx="16" cy="10" r="3" fill="#fff" />
      <path d="M6 24c1.2-4 3.2-6 4.5-6s2.5 1 3 2c.6-2 1.6-3.5 2.5-3.5s1.9 1.5 2.5 3.5c.5-1 1.7-2 3-2s3.3 2 4.5 6z" fill="#fff" />
    </svg>
  );
}

export function Nav() {
  const path = usePathname();
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-cream/90 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-2.5">
        <Link href="/" className="flex shrink-0 items-center gap-2 font-black text-lg tracking-tight"><Logo /> <span className="hidden sm:inline">Everyone Goes</span></Link>
        <nav className="-mx-1 flex min-w-0 flex-1 gap-1 overflow-x-auto px-1 [scrollbar-width:none]">
          {ROLES.map((r) => {
            const on = path === r.href || path.startsWith(r.href + '/') || (r.href === '/parent' && path.startsWith('/help'));
            return <Link key={r.href} href={r.href} className={`shrink-0 rounded-full px-3 py-1.5 text-sm font-extrabold whitespace-nowrap ${on ? 'bg-ink text-white' : 'text-muted hover:bg-white'}`}>{r.label}</Link>;
          })}
        </nav>
      </div>
    </header>
  );
}
