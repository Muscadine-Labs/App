'use client';

import React, { useState } from 'react';
import Image from "next/image";
import Link from "next/link";
import PromoteLearn from "./PromoteLearn";

export function NavBar() {
    const [isCollapsed, setIsCollapsed] = useState(false);

    const toggleCollapse = () => {
        setIsCollapsed(!isCollapsed);
    };

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
            }`}onClick={isCollapsed ? (e) => {
                e.preventDefault();
                toggleCollapse();
            } : undefined}
        >
            {/* Header with logo and toggle button */}
            <div className="flex items-center justify-between p-2">
                {!isCollapsed && (
                    <Link 
                        href="https://muscadine.io" 
                        className="flex items-center gap-2 hover:bg-[var(--surface-hover)] rounded p-1 transition-colors"
                    >
                        <Image src="/favicon.png" alt="Muscadine" width={16} height={16} className="rounded-full"/>
                        <span className="text-xs whitespace-nowrap">Muscadine</span>
                    </Link>
                )}
                
                <button 
                    onClick={toggleCollapse}
                    className="hover:bg-[var(--surface-hover)] rounded transition-colors"
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
                <div className="flex flex-col items-center justify-center gap-2 mt-6">
                    <button className={`flex items-center gap-2 w-full p-2 hover:bg-[var(--surface-hover)] rounded transition-colors ${
                        isCollapsed ? 'justify-center' : 'justify-start'
                    }`}>
                        <svg 
                            xmlns="http://www.w3.org/2000/svg" 
                            viewBox="0 0 24 24" 
                            className="w-4 h-4 text-foreground"
                            fill="currentColor"
                        >
                            <path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z"/>
                        </svg>
                        {!isCollapsed && <p className="text-xs">Home</p>}
                    </button>
                    
                    <button className={`flex items-center gap-2 w-full p-2 hover:bg-[var(--surface-hover)] rounded transition-colors ${
                        isCollapsed ? 'justify-center' : 'justify-start'
                    }`}>
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
                            <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
                            <rect x="7" y="8" width="10" height="8" rx="1" ry="1"/>
                            <path d="M12 8v8"/>
                            <path d="M8 12h8"/>
                        </svg>
                        {!isCollapsed && <p className="text-xs">Vaults</p>}
                    </button>
                    
                    <button className={`flex items-center gap-2 w-full p-2 hover:bg-[var(--surface-hover)] rounded transition-colors ${
                        isCollapsed ? 'justify-center' : 'justify-start'
                    }`}>
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
                            <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/>
                            <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>
                        </svg>
                        {!isCollapsed && <p className="text-xs">Learn</p>}
                    </button>
                </div>

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