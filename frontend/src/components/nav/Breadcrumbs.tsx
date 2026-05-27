import Link from 'next/link';
import { ChevronRight, Home } from 'lucide-react';

interface BreadcrumbItem {
  label: string;
  href?: string;
}

interface BreadcrumbsProps {
  items: BreadcrumbItem[];
  className?: string;
}

export function Breadcrumbs({ items, className }: BreadcrumbsProps) {
  return (
    <nav
      aria-label="Breadcrumb"
      className={`flex items-center gap-1.5 text-xs text-fg-subtle ${className ?? ''}`}
    >
      <Link
        href="/"
        className="inline-flex items-center hover:text-fg transition-colors"
        aria-label="Home"
      >
        <Home className="h-3.5 w-3.5" strokeWidth={2} />
      </Link>
      {items.map((item, i) => (
        <span key={i} className="inline-flex items-center gap-1.5">
          <ChevronRight className="h-3 w-3 text-fg-subtle/70" strokeWidth={2} />
          {item.href && i < items.length - 1 ? (
            <Link href={item.href} className="hover:text-fg transition-colors">
              {item.label}
            </Link>
          ) : (
            <span className="text-fg">{item.label}</span>
          )}
        </span>
      ))}
    </nav>
  );
}
