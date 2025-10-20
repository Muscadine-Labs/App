'use client';

import React, { useCallback } from 'react';
import { usePathname } from "next/navigation";
import PromoteLearn from "./PromoteLearn";
import { NavLink } from "./NavLink";
import { navigationItems, NavItem } from "@/config/navigation";
import ConnectButton from "./ConnectButton";
import { useNavBar } from "@/contexts/NavBarContext";

export function NavBar() {
    const { isCollapsed, toggleCollapse } = useNavBar();
    const pathname = usePathname();

    const isActive = useCallback((item: NavItem): boolean => {
        if (item.matchPattern === 'exact') {
            return pathname === item.href;
        }
        // Default to startsWith for nested routes
        return pathname.startsWith(item.href);
    }, [pathname]);

    // Update CSS variables when navbar state changes
    React.useEffect(() => {
        const root = document.documentElement;
        if (isCollapsed) {
            root.style.setProperty('--main-margin-left', 'var(--navbar-collapsed-width)');
            root.style.setProperty('--main-width', 'calc(100vw - var(--navbar-collapsed-width))');
        } else {
            root.style.setProperty('--main-margin-left', 'var(--navbar-width)');
            root.style.setProperty('--main-width', 'calc(100vw - var(--navbar-width))');
        }
    }, [isCollapsed]);

    return (
        <div 
            id="navbar" 
            className={`flex flex-col fixed top-0 left-0 h-screen bg-[var(--background)] py-4 transition-all duration-300 ${
                isCollapsed ? 'w-[var(--navbar-collapsed-width)] pl-2' : 'w-[var(--navbar-width)] pl-4 justify-start'
            }`}
        >
            {/* Header with ConnectButton and toggle button */}
            <div className="flex items-center justify-between">
                <div className="flex-1">
                    <ConnectButton isCollapsed={isCollapsed} />
                </div>
                
                <button 
                    onClick={toggleCollapse}
                    className="hover:bg-[var(--surface-hover)] rounded transition-colors -mr-2 p-1"
                >
                    <svg 
                        xmlns="http://www.w3.org/2000/svg" 
                        viewBox="0 0 24 24" 
                        className="w-4 h-4"
                        fill="none" 
                        stroke="currentColor" 
                        strokeWidth="2" 
                        strokeLinecap="round" 
                        strokeLinejoin="round"
                    >
                        <path d={isCollapsed ? "M9 18l6-6-6-6" : "M15 18l-6-6 6-6"}/>
                    </svg>
                </button>
            </div>

            <div className="flex flex-col justify-between h-full gap-2">
                <nav className="flex flex-col items-center justify-center gap-2 mt-6" role="navigation" aria-label="Main navigation">
                    {navigationItems.map((item) => (
                        <NavLink 
                            key={item.id}
                            item={item}
                            isActive={isActive(item)}
                            isCollapsed={isCollapsed}
                        />
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