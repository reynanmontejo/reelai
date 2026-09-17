'use client';

import { FormEvent, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Icon } from './icons';

const activeFor = (pathname: string, href: string) => href === '/' ? pathname === '/' : pathname.startsWith(href);

export function Header() {
  const pathname = usePathname();
  const router = useRouter();
  const [query, setQuery] = useState('');
  const search = (event: FormEvent) => { event.preventDefault(); const value = query.trim(); router.push(value ? `/explore?q=${encodeURIComponent(value)}` : '/explore'); };
  const links = [{ href: '/', label: 'Home' }, { href: '/explore', label: 'Genres' }, { href: '/feed', label: 'Trending' }, { href: '/explore?sort=new', label: 'New Releases', match: '/explore' }, { href: '/my-list', label: 'My List' }];
  return <header className="header"><Link href="/" className="logo">REEL<i>AI</i></Link><nav className="nav">{links.map((link) => <Link key={link.label} className={activeFor(pathname, link.match || link.href.split('?')[0]) ? 'active' : ''} href={link.href}>{link.label}</Link>)}</nav><div className="header-tools"><form onSubmit={search}><input aria-label="Search stories" className="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search stories…"/></form><Link href="/profile" aria-label="Profile" className={`avatar ${activeFor(pathname, '/profile') ? 'active' : ''}`}>RA</Link></div></header>;
}

export function BottomNav() {
  const pathname = usePathname();
  const links = [{ href: '/', label: 'Home', icon: 'home' }, { href: '/explore', label: 'Explore', icon: 'explore' }, { href: '/my-list', label: 'My List', icon: 'save' }, { href: '/profile', label: 'Profile', icon: 'user' }];
  return <nav className="bottom-nav">{links.map((link) => <Link key={link.href} className={activeFor(pathname, link.href) ? 'active' : ''} href={link.href}><Icon name={link.icon}/>{link.label}</Link>)}</nav>;
}

export function Footer() { return <footer className="footer">© 2026 ReelAI · Watch AI stories, one reel at a time.</footer>; }
