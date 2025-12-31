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
    icon: React.ReactNode | null;
}

export const navigationItems: NavItem[] = [
    {
        id: 'vaults',
        label: 'Vaults',
        icon: null
    },
    {
        id: 'transactions',
        label: 'Transact',
        icon: null
    }
];

