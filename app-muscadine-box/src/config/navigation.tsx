/**
 * Navigation Configuration
 * 
 * This file contains the main navigation items for the application.
 * All navigation items are internal tabs that switch content within the single page.
 * 
 * NavItem Properties:
 * - id: Unique identifier for the navigation item (must match TabType)
 * - label: Display text for the navigation item
 * - icon: React component or JSX for the icon
 * 
 * Example:
 * {
 *   id: 'analytics',
 *   label: 'Analytics',
 *   icon: <AnalyticsIcon />
 * }
 */

import React from 'react';

export interface NavItem {
    id: string;
    label: string;
    icon: React.ReactNode;
}

export const navigationItems: NavItem[] = [
    {
        id: 'dashboard',
        label: 'Dashboard',
        icon: (
            <svg 
                xmlns="http://www.w3.org/2000/svg" 
                viewBox="0 0 24 24" 
                className="w-4 h-4"
                fill="currentColor"
            >
                <path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z"/>
            </svg>
        )
    },
    {
        id: 'learn',
        label: 'Learn',
        icon: (
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
        )
    }
];

