'use client';

import React, { useCallback } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { VaultsDropdown } from "./VaultsDropdown";
import { navigationItems, NavItem } from "@/config/navigation";
import { ConnectButton } from "../features/wallet";
import { useTab } from "@/contexts/TabContext";
import { Icon } from "../ui/Icon";

interface NavBarProps {
    isRightSidebarCollapsed?: boolean;
    onToggleSidebar?: () => void;
}

export function NavBar({ isRightSidebarCollapsed, onToggleSidebar }: NavBarProps) {
    const { activeTab, setActiveTab } = useTab();
    const pathname = usePathname();

    const isActive = useCallback((item: NavItem): boolean => {
        // Vaults dropdown is active if we're on a vault page
        return item.id === 'vaults' && (pathname?.startsWith('/vaults/') || false);
    }, [pathname]);


    return (
        <div 
            id="navbar" 
            className="flex flex-row fixed top-0 left-0 w-full bg-[var(--background-muted)] py-4 transition-all duration-300 border-b border-[var(--border)] h-[var(--navbar-height)] px-4 z-50"
        >
            {/* Header with ConnectButton */}
            <div className="flex items-center justify-between w-full">
                <div className="flex items-center gap-4">
                    {/* Logo/Brand with Link */}
                    <Link 
                        href="/" 
                        onClick={() => setActiveTab('dashboard')}
                        className="flex items-center gap-3 "
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
                    </Link>
                    
                    {/* Navigation Items */}
                    <nav className="flex items-center gap-2" role="navigation" aria-label="Main navigation">
                        {navigationItems.map((item) => (
                            <div key={item.id} onClick={(e) => e.stopPropagation()}>
                                {item.id === 'vaults' && (
                                    <VaultsDropdown isActive={isActive(item)} />
                                )}
                            </div>
                        ))}
                        {/* External Links */}
                        <a
                            href="https://docs.muscadine.io"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center justify-center px-3 py-2 text-sm gap-1.5 hover:underline text-[var(--foreground)] transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[var(--border)]"
                        >
                            Docs
                        </a>
                        <a
                            href="https://muscadine.io"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center justify-center px-3 py-1.5 text-sm gap-1.5 hover:underline text-[var(--foreground)] transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[var(--border)]"
                        >
                            Muscadine.io
                        </a>
                    </nav>
                </div>

                {/* Right side: Connect Button and Sidebar Toggle */}
                <div className="flex items-center gap-3" onClick={(e) => e.stopPropagation()}>
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
    );
}