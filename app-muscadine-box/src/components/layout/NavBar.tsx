'use client';

import React, { useCallback } from 'react';
import { PromoteLearn } from "../features/learn";
import { NavLink } from "./NavLink";
import { navigationItems, NavItem } from "@/config/navigation";
import { ConnectButton } from "../features/wallet";
import { useNavBar } from "@/contexts/NavBarContext";
import { useTab } from "@/contexts/TabContext";

export function NavBar() {
    const { isCollapsed, toggleCollapse } = useNavBar();
    const { activeTab, setActiveTab } = useTab();

    const isActive = useCallback((item: NavItem): boolean => {
        // All items are now internal tabs
        return item.id === activeTab;
    }, [activeTab]);

    const handleNavClick = useCallback((item: NavItem) => {
        setActiveTab(item.id as 'dashboard' | 'learn');
    }, [setActiveTab]);

    // Remove the useEffect that updates CSS variables - this is now handled in AppLayout

    return (
        <div 
            id="navbar" 
            className={`flex flex-col fixed top-0 left-0 h-screen bg-[var(--background-muted)] py-4 transition-all duration-300 border-r border-[var(--border)] ${
                isCollapsed ? 'w-[var(--navbar-collapsed-width)] p-3' : 'w-[var(--navbar-width)] p-4'
            }`}
        >
            {/* Header with ConnectButton */}
            <div className="flex items-center justify-between">
                <div className="flex-1" onClick={(e) => e.stopPropagation()}>
                    <ConnectButton isCollapsed={isCollapsed} />
                </div>
            </div>

            {/* Vertical Toggle Bar - Positioned on right border, centered vertically */}
            <div className="absolute right-0 top-1/2 transform -translate-y-1/2">
                <button
                    onClick={toggleCollapse}
                    className="w-2 h-20 bg-[var(--border)] hover:bg-[var(--border-strong)] rounded-full transition-colors flex items-center justify-center group translate-x-1/2"
                >
                    <div className="w-2 h-2 bg-[var(--foreground-secondary)] rounded-full opacity-0 group-hover:opacity-100 transition-opacity" />
                </button>
            </div>

            <div className="flex flex-col justify-between h-full gap-2">
                <nav className="flex flex-col items-center justify-center gap-2 mt-6 w-full" role="navigation" aria-label="Main navigation">
                    {navigationItems.map((item) => (
                        <div key={item.id} onClick={(e) => e.stopPropagation()} className="w-full">
                            <NavLink 
                                item={item}
                                isActive={isActive(item)}
                                isCollapsed={isCollapsed}
                                onClick={() => handleNavClick(item)}
                            />
                        </div>
                    ))}
                </nav>

                {/* PromoteLearn section - hide when collapsed */}
                {isCollapsed ? <div></div>: (
                    <div className="flex flex-col items-center justify-center gap-2 mt-6">
                        <PromoteLearn />
                    </div>
                )}
            </div>
        </div>
    );
}