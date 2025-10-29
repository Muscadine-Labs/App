'use client';

import React, { useCallback } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { NavLink } from "./NavLink";
import { navigationItems, NavItem } from "@/config/navigation";
import { ConnectButton } from "../features/wallet";
import { useTab } from "@/contexts/TabContext";

export function NavBar() {
    const { activeTab, setActiveTab } = useTab();

    const isActive = useCallback((item: NavItem): boolean => {
        // All items are now internal tabs
        return item.id === activeTab;
    }, [activeTab]);

    const handleNavClick = useCallback((item: NavItem) => {
        setActiveTab(item.id as 'dashboard' | 'learn');
    }, [setActiveTab]);

    return (
        <div 
            id="navbar" 
            className="flex flex-row fixed top-0 left-0 w-full bg-[var(--background-muted)] py-4 transition-all duration-300 border-b border-[var(--border)] h-[var(--navbar-height)] px-4"
        >
            {/* Header with ConnectButton */}
            <div className="flex items-center justify-between w-full">
                <div className="flex items-center gap-4">
                    {/* Logo/Brand with Link */}
                    <Link 
                        href="https://muscadine.io" 
                        target="_blank" 
                        rel="noopener noreferrer"
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
                    <nav className="flex items-center gap-4" role="navigation" aria-label="Main navigation">
                        {navigationItems.map((item) => (
                            <div key={item.id} onClick={(e) => e.stopPropagation()}>
                                <NavLink 
                                    item={item}
                                    isActive={isActive(item)}
                                    onClick={() => handleNavClick(item)}
                                />
                            </div>
                        ))}
                    </nav>
                </div>

                {/* Connect Button */}
                <div className=" justify-end" onClick={(e) => e.stopPropagation()}>
                    <ConnectButton />
                </div>
            </div>
        </div>
    );
}