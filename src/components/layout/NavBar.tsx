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
import { useVaultVersion } from "@/contexts/VaultVersionContext";

interface NavBarProps {
    isRightSidebarCollapsed?: boolean;
    onToggleSidebar?: () => void;
}

export function NavBar({ isRightSidebarCollapsed, onToggleSidebar }: NavBarProps) {
    const pathname = usePathname();
    const router = useRouter();
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);
    const settingsRef = useRef<HTMLDivElement>(null);
    const mobileNavRef = useRef<HTMLDivElement>(null);
    const hamburgerButtonRef = useRef<HTMLButtonElement>(null);
    
    // Settings state with defaults
    const { version, setVersion } = useVaultVersion();
    const { theme, setTheme } = useTheme();

    const isActive = useCallback((item: NavItem): boolean => {
        // Vaults dropdown is active if we're on a vault page (v1 or v2)
        return item.id === 'vaults' && (pathname?.startsWith('/vault/v1/') || pathname?.startsWith('/vault/v2/') || false);
    }, [pathname]);

    // Close menu when clicking outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            const target = event.target as Node;
            
            // Check hamburger button first - don't close if clicking it or any child
            if (hamburgerButtonRef.current && hamburgerButtonRef.current.contains(target)) {
                return;
            }
            
            if (menuRef.current && !menuRef.current.contains(target)) {
                setIsMenuOpen(false);
            }
            if (settingsRef.current && !settingsRef.current.contains(target)) {
                setIsSettingsOpen(false);
            }
            // Only handle mobile nav if it's actually open
            if (isMobileNavOpen) {
                if (mobileNavRef.current && !mobileNavRef.current.contains(target)) {
                    setIsMobileNavOpen(false);
                }
            }
        };

        if (isMenuOpen || isSettingsOpen || isMobileNavOpen) {
            // Use click event - button's stopPropagation should prevent this from firing when button is clicked
            document.addEventListener('click', handleClickOutside);

            return () => {
                document.removeEventListener('click', handleClickOutside);
            };
        }
    }, [isMenuOpen, isSettingsOpen, isMobileNavOpen]);

    return (
        <div className="fixed top-0 left-0 w-full z-50">
            <div 
                id="navbar" 
                className="relative flex flex-row w-full bg-[var(--background-muted)] py-2 sm:py-4 transition-all duration-300 border-b border-[var(--border)] h-[var(--navbar-height)] px-2 sm:px-4"
            >
                {/* Header with ConnectButton */}
                <div className="flex items-center justify-between w-full">
                    <div className="flex items-center gap-2 sm:gap-4 md:gap-6">
                        {/* Logo/Brand with Dropdown */}
                        <div className="relative flex items-center gap-1 sm:gap-3" ref={menuRef}>
                            <button
                                onClick={() => setIsMenuOpen(!isMenuOpen)}
                                className="flex items-center gap-1 sm:gap-3 hover:opacity-80 transition-opacity cursor-pointer"
                                aria-label="Toggle menu"
                            >
                                <Image
                                    src="/favicon.png"
                                    alt="Muscadine Logo"
                                    width={32}
                                    height={32}
                                    className="w-6 h-6 sm:w-8 sm:h-8 rounded-full"
                                />
                                <div className="hidden sm:block text-lg sm:text-xl text-[var(--foreground)] font-funnel">
                                    Muscadine
                                </div>
                                {/* Dropdown Arrow */}
                                <Icon 
                                    name={isMenuOpen ? "chevron-up" : "chevron-down"}
                                    size="xs" 
                                    color="secondary"
                                    className="hidden sm:block transition-transform duration-200"
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
                                            className="block py-2 text-sm text-[var(--foreground)] hover:text-[var(--primary)] transition-colors cursor-pointer"
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
                                            href="https://docs.muscadine.io"
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="block py-2 text-sm text-[var(--foreground)] hover:text-[var(--primary)] transition-colors cursor-pointer"
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
                                            className="block py-2 text-sm text-[var(--foreground)] hover:text-[var(--primary)] transition-colors cursor-pointer"
                                            onClick={() => setIsMenuOpen(false)}
                                        >
                                            Risk Analytics
                                        </a>
                                        <div className="border-t border-[var(--border)]"></div>
                                        <a
                                            href="https://muscadine.io/terms"
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="block py-2 text-sm text-[var(--foreground)] hover:text-[var(--primary)] transition-colors cursor-pointer"
                                            onClick={() => setIsMenuOpen(false)}
                                        >
                                            Terms of Use
                                        </a>
                                        <a
                                            href="https://muscadine.io/legal"
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="block py-2 text-sm text-[var(--foreground)] hover:text-[var(--primary)] transition-colors cursor-pointer"
                                            onClick={() => setIsMenuOpen(false)}
                                        >
                                            Legal Disclaimer
                                        </a>
                                        <a
                                            href="https://muscadine.io/privacy"
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="block py-2 text-sm text-[var(--foreground)] hover:text-[var(--primary)] transition-colors cursor-pointer"
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
                                            className="w-8 h-8 rounded-full bg-[var(--surface)] border border-[var(--border-subtle)] flex items-center justify-center hover:bg-[var(--surface-hover)] transition-colors cursor-pointer"
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
                                            className="w-8 h-8 rounded-full bg-[var(--surface)] border border-[var(--border-subtle)] flex items-center justify-center hover:bg-[var(--surface-hover)] transition-colors cursor-pointer"
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
                                            className="w-8 h-8 rounded-full bg-[var(--surface)] border border-[var(--border-subtle)] flex items-center justify-center hover:bg-[var(--surface-hover)] transition-colors cursor-pointer"
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
                        
                        {/* Navigation Items - Hidden on mobile, shown in hamburger menu */}
                        <nav className="hidden md:flex items-center gap-2" role="navigation" aria-label="Main navigation">
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
                                            className={`min-w-fit hover:bg-transparent hover:text-[var(--primary)] transition-colors ${pathname === '/transact' ? 'text-[var(--primary)]' : ''}`}
                                            onClick={() => router.push('/transact')}
                                        >
                                            {item.label}
                                        </Button>
                                    )}
                                </div>
                            ))}
                        </nav>
                    </div>

                    {/* Right side: Connect Button, Settings and Sidebar Toggle */}
                    <div className="flex items-center gap-1 sm:gap-2 md:gap-3" onClick={(e) => e.stopPropagation()}>
                        <ConnectButton />

                        {/* Settings Dropdown - Icon only on mobile */}
                        <div 
                            className="relative flex items-center" 
                            ref={settingsRef}
                            onMouseEnter={() => setIsSettingsOpen(true)}
                            onMouseLeave={() => setIsSettingsOpen(false)}
                        >
                            <button
                                onClick={() => {
                                    // If already open (from hover), keep it open; otherwise toggle
                                    if (!isSettingsOpen) {
                                        setIsSettingsOpen(true);
                                    }
                                }}
                                className="flex items-center gap-1 sm:gap-2 hover:opacity-80 transition-opacity p-1 sm:p-2 cursor-pointer"
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
                                    className="hidden sm:block transition-transform duration-200"
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
                                    {/* Mode Section */}
                                    <div className="px-4 mb-4">
                                        <div className="flex items-center justify-between gap-2">
                                            <button
                                                type="button"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setVersion('v1');
                                                    setIsSettingsOpen(false);
                                                }}
                                                className={`flex-1 py-2 px-3 text-sm rounded-lg transition-colors cursor-pointer ${
                                                    version === 'v1'
                                                        ? 'bg-[var(--primary)] text-white'
                                                        : 'text-[var(--foreground)] hover:bg-[var(--surface-hover)]'
                                                }`}
                                            >
                                                V1
                                            </button>
                                            <button
                                                type="button"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setVersion('v2');
                                                    setIsSettingsOpen(false);
                                                }}
                                                className={`flex-1 py-2 px-3 text-sm rounded-lg transition-colors cursor-pointer ${
                                                    version === 'v2'
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
                                                    setVersion('all');
                                                    setIsSettingsOpen(false);
                                                }}
                                                className={`flex-1 py-2 px-3 text-sm rounded-lg transition-colors cursor-pointer ${
                                                    version === 'all'
                                                        ? 'bg-[var(--primary)] text-white'
                                                        : 'text-[var(--foreground)] hover:bg-[var(--surface-hover)]'
                                                }`}
                                            >
                                                All
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
                                                className={`flex-1 py-2 px-2 text-sm rounded-lg transition-colors cursor-pointer ${
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
                                                className={`flex-1 py-2 px-2 text-sm rounded-lg transition-colors cursor-pointer ${
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
                                                className={`flex-1 py-2 px-2 text-sm rounded-lg transition-colors cursor-pointer ${
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
                        {onToggleSidebar && (
                            <button
                                onClick={onToggleSidebar}
                                className="hidden md:flex w-12 h-8 hover:bg-[var(--surface-hover)] rounded transition-colors items-center justify-center group cursor-pointer"
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
                        
                        {/* Mobile Hamburger Menu Button */}
                        <button
                            ref={hamburgerButtonRef}
                            type="button"
                            onMouseDown={(e) => {
                                e.stopPropagation();
                            }}
                            onClick={(e) => {
                                e.stopPropagation();
                                e.preventDefault();
                                setIsMobileNavOpen(!isMobileNavOpen);
                            }}
                            style={{ 
                                pointerEvents: 'auto',
                                cursor: 'pointer',
                                position: 'relative',
                                zIndex: 9999 
                            }}
                            className="md:hidden flex items-center justify-center w-8 h-8 hover:bg-[var(--surface-hover)] rounded transition-colors"
                            aria-label="Toggle mobile menu"
                            aria-expanded={isMobileNavOpen}
                        >
                            <svg
                                className="w-6 h-6 text-[var(--foreground)]"
                                fill="none"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth="2"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                            >
                                {isMobileNavOpen ? (
                                    <path d="M6 18L18 6M6 6l12 12" />
                                ) : (
                                    <path d="M4 6h16M4 12h16M4 18h16" />
                                )}
                            </svg>
                        </button>
                    </div>
                </div>

                {/* Mobile Navigation Menu */}
                {isMobileNavOpen && (
                    <div 
                        ref={mobileNavRef}
                        className="absolute top-full left-0 w-full bg-[var(--surface-elevated)] border-b border-[var(--border)] md:hidden z-30 shadow-lg"
                        onClick={(e) => {
                            e.stopPropagation();
                        }}
                    >
                        <div className="flex flex-col py-2">
                            <button
                                onClick={() => {
                                    router.push('/');
                                    setIsMobileNavOpen(false);
                                }}
                                className={`px-4 py-3 text-left hover:bg-[var(--surface-hover)] transition-colors cursor-pointer ${pathname === '/' ? 'text-[var(--primary)] bg-[var(--primary-subtle)]' : 'text-[var(--foreground)]'}`}
                            >
                                Dashboard
                            </button>
                            {navigationItems.map((item) => (
                                <div key={item.id}>
                                    {item.id === 'vaults' && (
                                        <div className="px-4 py-3">
                                            <VaultsDropdown 
                                                isActive={isActive(item)} 
                                                onVaultSelect={() => {
                                                    setIsMobileNavOpen(false);
                                                }}
                                            />
                                        </div>
                                    )}
                                    {item.id === 'transactions' && (
                                        <button
                                            onClick={() => {
                                                router.push('/transact');
                                                setIsMobileNavOpen(false);
                                            }}
                                            className={`w-full px-4 py-3 text-left hover:bg-[var(--surface-hover)] transition-colors cursor-pointer ${pathname === '/transact' ? 'text-[var(--primary)] bg-[var(--primary-subtle)]' : 'text-[var(--foreground)]'}`}
                                        >
                                            {item.label}
                                        </button>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}