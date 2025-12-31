'use client';

import React, { useCallback, useState, useEffect, useRef } from 'react';
import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';
import { VaultsDropdown } from "./VaultsDropdown";
import { navigationItems, NavItem } from "@/config/navigation";
import { ConnectButton } from "../features/wallet";
import { Icon } from "../ui/Icon";
import { Button } from "../ui/Button";
import { useTheme } from "@/contexts/ThemeContext";

interface NavBarProps {
    isRightSidebarCollapsed?: boolean;
    onToggleSidebar?: () => void;
}

export function NavBar({ isRightSidebarCollapsed, onToggleSidebar }: NavBarProps) {
    const pathname = usePathname();
    const router = useRouter();
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);
    const settingsRef = useRef<HTMLDivElement>(null);
    
    // Settings state with defaults
    const [version, setVersion] = useState<'V1' | 'V2'>('V1');
    const [mode, setMode] = useState<'Advanced' | 'Simple'>('Advanced');
    const { theme, setTheme } = useTheme();

    const isActive = useCallback((item: NavItem): boolean => {
        // Vaults dropdown is active if we're on a vault page
        return item.id === 'vaults' && (pathname?.startsWith('/vaults/') || false);
    }, [pathname]);

    // Close menu when clicking outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
                setIsMenuOpen(false);
            }
            if (settingsRef.current && !settingsRef.current.contains(event.target as Node)) {
                setIsSettingsOpen(false);
            }
        };

        if (isMenuOpen || isSettingsOpen) {
            document.addEventListener('mousedown', handleClickOutside);
        }

        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [isMenuOpen, isSettingsOpen]);

    return (
        <>
            <div 
                id="navbar" 
                className="flex flex-row fixed top-0 left-0 w-full bg-[var(--background-muted)] py-4 transition-all duration-300 border-b border-[var(--border)] h-[var(--navbar-height)] px-4 z-50"
            >
                {/* Header with ConnectButton */}
                <div className="flex items-center justify-between w-full">
                    <div className="flex items-center gap-6">
                        {/* Logo/Brand with Dropdown */}
                        <div className="relative flex items-center gap-3" ref={menuRef}>
                            <button
                                onClick={() => setIsMenuOpen(!isMenuOpen)}
                                className="flex items-center gap-3 hover:opacity-80 transition-opacity"
                                aria-label="Toggle menu"
                            >
                                <Image
                                    src="/favicon.png"
                                    alt="Muscadine Logo"
                                    width={32}
                                    height={32}
                                    className="w-8 h-8 rounded-full"
                                />
                                <div className="text-xl text-[var(--foreground)] font-funnel">
                                    Muscadine
                                </div>
                                {/* Dropdown Arrow */}
                                <Icon 
                                    name={isMenuOpen ? "chevron-up" : "chevron-down"}
                                    size="xs" 
                                    color="secondary"
                                    className="transition-transform duration-200"
                                />
                            </button>

                            {/* Dropdown Menu */}
                            {isMenuOpen && (
                                <div className="absolute left-0 top-full mt-2 w-48 bg-[var(--surface)] border border-[var(--border)] rounded-2xl shadow-xl py-4 z-50 animate-[fadeInUp_0.2s_ease-out]">
                                    {/* Company Section */}
                                    <div className="px-4 mb-4">
                                        <h3 className="text-xs font-semibold text-[var(--foreground-secondary)] uppercase tracking-wider mb-2">
                                            Company
                                        </h3>
                                        <a
                                            href="https://muscadine.io"
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="block py-2 text-sm text-[var(--foreground)] hover:text-[var(--primary)] transition-colors"
                                            onClick={() => setIsMenuOpen(false)}
                                        >
                                            Muscadine.io
                                        </a>
                                    </div>

                                    {/* FAQ Section */}
                                    <div className="px-4 mb-4">
                                        <h3 className="text-xs font-semibold text-[var(--foreground-secondary)] uppercase tracking-wider mb-2">
                                            FAQ
                                        </h3>
                                        <a
                                            href="https://doc.muscadine.io"
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="block py-2 text-sm text-[var(--foreground)] hover:text-[var(--primary)] transition-colors"
                                            onClick={() => setIsMenuOpen(false)}
                                        >
                                            Documentation
                                        </a>
                                    </div>

                                    {/* Protocol Section */}
                                    <div className="px-4 mb-4">
                                        <h3 className="text-xs font-semibold text-[var(--foreground-secondary)] uppercase tracking-wider mb-2">
                                            Protocol
                                        </h3>
                                        <a
                                            href="https://curator.muscadine.io"
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="block py-2 text-sm text-[var(--foreground)] hover:text-[var(--primary)] transition-colors"
                                            onClick={() => setIsMenuOpen(false)}
                                        >
                                            Risk Analytics
                                        </a>
                                        <div className="border-t border-[var(--border)]"></div>
                                        <a
                                            href="https://muscadine.io/terms"
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="block py-2 text-sm text-[var(--foreground)] hover:text-[var(--primary)] transition-colors"
                                            onClick={() => setIsMenuOpen(false)}
                                        >
                                            Terms of Use
                                        </a>
                                        <a
                                            href="https://muscadine.io/legal"
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="block py-2 text-sm text-[var(--foreground)] hover:text-[var(--primary)] transition-colors"
                                            onClick={() => setIsMenuOpen(false)}
                                        >
                                            Legal Disclaimer
                                        </a>
                                        <a
                                            href="https://muscadine.io/privacy"
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="block py-2 text-sm text-[var(--foreground)] hover:text-[var(--primary)] transition-colors"
                                            onClick={() => setIsMenuOpen(false)}
                                        >
                                            Privacy Policy
                                        </a>
                                    </div>

                                    {/* Social Icons */}
                                    <div className="px-4 pt-4 border-t border-[var(--border-subtle)] flex items-center gap-3">
                                        <a
                                            href="https://x.com/muscadinelabs"
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="w-8 h-8 rounded-full bg-[var(--surface)] border border-[var(--border-subtle)] flex items-center justify-center hover:bg-[var(--surface-hover)] transition-colors"
                                            onClick={() => setIsMenuOpen(false)}
                                            aria-label="X"
                                        >
                                            <svg className="w-4 h-4 text-[var(--foreground)]" fill="currentColor" viewBox="0 0 24 24">
                                                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
                                            </svg>
                                        </a>
                                        <a
                                            href="https://www.linkedin.com/company/muscadinelabs/"
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="w-8 h-8 rounded-full bg-[var(--surface)] border border-[var(--border-subtle)] flex items-center justify-center hover:bg-[var(--surface-hover)] transition-colors"
                                            onClick={() => setIsMenuOpen(false)}
                                            aria-label="LinkedIn"
                                        >
                                            <svg className="w-4 h-4 text-[var(--foreground)]" fill="currentColor" viewBox="0 0 24 24">
                                                <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
                                            </svg>
                                        </a>
                                        <a
                                            href="https://muscadine.io/contact"
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="w-8 h-8 rounded-full bg-[var(--surface)] border border-[var(--border-subtle)] flex items-center justify-center hover:bg-[var(--surface-hover)] transition-colors"
                                            onClick={() => setIsMenuOpen(false)}
                                            aria-label="Contact"
                                        >
                                            <svg className="w-4 h-4 text-[var(--foreground)]" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                                            </svg>
                                        </a>
                                    </div>
                                </div>
                            )}
                        </div>
                        
                        {/* Navigation Items */}
                        <nav className="flex items-center gap-2" role="navigation" aria-label="Main navigation">
                            {/* Dashboard Link */}
                            <Button
                                variant="ghost"
                                size="sm"
                                className={`min-w-fit hover:bg-transparent hover:text-[var(--primary)] transition-colors ${pathname === '/' ? 'text-[var(--primary)]' : ''}`}
                                onClick={() => router.push('/')}
                            >
                                Dashboard
                            </Button>
                            
                            {navigationItems.map((item) => (
                                <div key={item.id} onClick={(e) => e.stopPropagation()}>
                                    {item.id === 'vaults' && (
                                        <VaultsDropdown isActive={isActive(item)} />
                                    )}
                                    {item.id === 'transactions' && (
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            className={`min-w-fit hover:bg-transparent hover:text-[var(--primary)] transition-colors ${pathname === '/transactions' ? 'text-[var(--primary)]' : ''}`}
                                            onClick={() => router.push('/transactions')}
                                        >
                                            {item.label}
                                        </Button>
                                    )}
                                </div>
                            ))}
                        </nav>
                    </div>

                    {/* Right side: Settings, Connect Button and Sidebar Toggle */}
                    <div className="flex items-center gap-3" onClick={(e) => e.stopPropagation()}>
                        {/* Settings Dropdown */}
                        <div 
                            className="relative flex items-center" 
                            ref={settingsRef}
                            onMouseEnter={() => setIsSettingsOpen(true)}
                            onMouseLeave={() => setIsSettingsOpen(false)}
                        >
                            <button
                                className="flex items-center gap-2 hover:opacity-80 transition-opacity p-2"
                                aria-label="Settings"
                            >
                                <Icon 
                                    name="settings"
                                    size="md" 
                                    color="secondary"
                                    className="transition-transform duration-200"
                                />
                                <Icon 
                                    name={isSettingsOpen ? "chevron-up" : "chevron-down"}
                                    size="xs" 
                                    color="secondary"
                                    className="transition-transform duration-200"
                                />
                            </button>

                            {/* Settings Dropdown Menu */}
                            {isSettingsOpen && (
                                <>
                                    {/* Invisible bridge to prevent gap closing dropdown */}
                                    <div 
                                        className="absolute top-full right-0 w-full h-2 z-[60]"
                                        onMouseEnter={() => setIsSettingsOpen(true)}
                                    />
                                    <div 
                                        className="absolute right-0 top-full mt-2 w-48 bg-[var(--surface)] border border-[var(--border)] rounded-2xl shadow-xl py-4 z-[60] animate-[fadeInUp_0.2s_ease-out]"
                                        onMouseEnter={() => setIsSettingsOpen(true)}
                                        onMouseLeave={() => setIsSettingsOpen(false)}
                                    >
                                    {/* Version Section */}
                                    <div className="px-4 mb-4">
                                        <div className="flex items-center justify-between">
                                            <button
                                                type="button"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setVersion('V2');
                                                    setIsSettingsOpen(false);
                                                }}
                                                className={`flex-1 py-2 px-3 text-sm rounded-lg transition-colors ${
                                                    version === 'V2'
                                                        ? 'bg-[var(--primary)] text-white'
                                                        : 'text-[var(--foreground)] hover:bg-[var(--surface-hover)]'
                                                }`}
                                            >
                                                V2
                                            </button>
                                            <button
                                                type="button"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setVersion('V1');
                                                    setIsSettingsOpen(false);
                                                }}
                                                className={`flex-1 py-2 px-3 text-sm rounded-lg transition-colors ${
                                                    version === 'V1'
                                                        ? 'bg-[var(--primary)] text-white'
                                                        : 'text-[var(--foreground)] hover:bg-[var(--surface-hover)]'
                                                }`}
                                            >
                                                V1
                                            </button>
                                        </div>
                                    </div>

                                    {/* Divider */}
                                    <div className="border-t border-[var(--border)] mb-4"></div>

                                    {/* Mode Section */}
                                    <div className="px-4 mb-4">
                                        <div className="flex items-center justify-between">
                                            <button
                                                type="button"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setMode('Advanced');
                                                    setIsSettingsOpen(false);
                                                }}
                                                className={`flex-1 py-2 px-3 text-sm rounded-lg transition-colors ${
                                                    mode === 'Advanced'
                                                        ? 'bg-[var(--primary)] text-white'
                                                        : 'text-[var(--foreground)] hover:bg-[var(--surface-hover)]'
                                                }`}
                                            >
                                                Advanced
                                            </button>
                                            <button
                                                type="button"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setMode('Simple');
                                                    setIsSettingsOpen(false);
                                                }}
                                                className={`flex-1 py-2 px-3 text-sm rounded-lg transition-colors ${
                                                    mode === 'Simple'
                                                        ? 'bg-[var(--primary)] text-white'
                                                        : 'text-[var(--foreground)] hover:bg-[var(--surface-hover)]'
                                                }`}
                                            >
                                                Simple
                                            </button>
                                        </div>
                                    </div>

                                    {/* Divider */}
                                    <div className="border-t border-[var(--border)] mb-4"></div>

                                    {/* Theme Section */}
                                    <div className="px-4">
                                        <div className="flex items-center justify-between gap-1">
                                            <button
                                                type="button"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setTheme('Dark');
                                                    setIsSettingsOpen(false);
                                                }}
                                                className={`flex-1 py-2 px-2 text-sm rounded-lg transition-colors ${
                                                    theme === 'Dark'
                                                        ? 'bg-[var(--primary)] text-white'
                                                        : 'text-[var(--foreground)] hover:bg-[var(--surface-hover)]'
                                                }`}
                                            >
                                                Dark
                                            </button>
                                            <button
                                                type="button"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setTheme('Light');
                                                    setIsSettingsOpen(false);
                                                }}
                                                className={`flex-1 py-2 px-2 text-sm rounded-lg transition-colors ${
                                                    theme === 'Light'
                                                        ? 'bg-[var(--primary)] text-white'
                                                        : 'text-[var(--foreground)] hover:bg-[var(--surface-hover)]'
                                                }`}
                                            >
                                                Light
                                            </button>
                                            <button
                                                type="button"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setTheme('Auto');
                                                    setIsSettingsOpen(false);
                                                }}
                                                className={`flex-1 py-2 px-2 text-sm rounded-lg transition-colors ${
                                                    theme === 'Auto'
                                                        ? 'bg-[var(--primary)] text-white'
                                                        : 'text-[var(--foreground)] hover:bg-[var(--surface-hover)]'
                                                }`}
                                            >
                                                Auto
                                            </button>
                                        </div>
                                    </div>
                                    </div>
                                </>
                            )}
                        </div>

                        <ConnectButton />
                        {onToggleSidebar && (
                            <button
                                onClick={onToggleSidebar}
                                className="w-12 h-8 hover:bg-[var(--surface-hover)] rounded transition-colors flex items-center justify-center group"
                                aria-label={isRightSidebarCollapsed ? 'Open sidebar' : 'Close sidebar'}
                            >
                                <Icon 
                                    name="sidebar"
                                    size="lg" 
                                    color="secondary"
                                    className="transition-all duration-200"
                                />
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </>
    );
}