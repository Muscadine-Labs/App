'use client';

import { useState, useRef, useCallback } from 'react';
import {
    useAppKitAccount,
    useAppKit,
    useDisconnect
} from '@reown/appkit/react';
import { useOnClickOutside } from '@/app/hooks/onClickOutside';
import { useNotifications } from '@/contexts/NotificationContext';


interface ConnectButtonProps {
    isCollapsed?: boolean;
    centerContent?: boolean;
}

export default function ConnectButton({ isCollapsed = false, centerContent = false }: ConnectButtonProps) {
    const { address, isConnected } = useAppKitAccount();
    const { open } = useAppKit();
    const { disconnect } = useDisconnect();
    const { addNotification } = useNotifications();

    // 1. State to manage dropdown visibility
    const [isDropdownOpen, setIsDropdownOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    // 2. Hook to close dropdown when clicking outside
    useOnClickOutside(dropdownRef, () => setIsDropdownOpen(false));

    const handleCopy = useCallback(async () => {
        if (!address) return;
        
        try {
            await navigator.clipboard.writeText(address);
            addNotification({
                type: 'success',
                title: 'Address Copied',
                message: 'Wallet address copied to clipboard',
                duration: 3000
            });
            setIsDropdownOpen(false); // Close menu after copying
        } catch {
            addNotification({
                type: 'error',
                title: 'Copy Failed',
                message: 'Failed to copy address to clipboard',
                duration: 4000
            });
        }
    }, [address, addNotification]);

    // If connected, show the address and the dropdown menu
    if (isConnected && address) {
        const truncatedAddress = `${address.slice(0, 6)}...${address.slice(-4)}`;

        return (
            <div className="relative" ref={dropdownRef}>
                {/* Main button to toggle the dropdown */}
                <div className="flex justify-center w-full">
                <button
                    onClick={() => setIsDropdownOpen(prev => !prev)}
                    className={`flex items-center gap-2 p-2 rounded transition-color ${
                        isCollapsed ? 'justify-center' : ' justify-start w-full'
                    } hover:bg-[var(--surface-hover)]`}
                >
                    
                    {/* Wallet icon - always show */}
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
                        <path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1"/>
                        <path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4"/>
                    </svg>
                    {!isCollapsed && <span className="text-xs">{truncatedAddress}</span>}
                </button>
                </div>
                
                {isDropdownOpen && (
                    <div className="absolute top-full left-0 mt-2 w-72 bg-[var(--surface)] border border-[var(--border-subtle)] rounded-xl shadow-lg overflow-hidden">
                        {/* Header Section */}
                        <div className="p-4 border-b border-[var(--border-subtle)]">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <div className="w-8 h-8 bg-[var(--surface-elevated)] rounded-full flex items-center justify-center">
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
                                            <path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1"/>
                                            <path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4"/>
                                        </svg>
                                    </div>
                                    <div>
                                        <p className="text-sm font-medium text-[var(--foreground)]">Wallet Connected</p>
                                        <p className="text-xs text-[var(--foreground-secondary)] font-mono">{truncatedAddress}</p>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Menu Items */}
                        <div className="p-2">
                            {/* Copy Address */}
                            <button 
                                onClick={handleCopy} 
                                className="w-full flex items-center gap-3 px-3 py-2 text-sm text-[var(--foreground)] hover:bg-[var(--surface-hover)] rounded-lg transition-colors"
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
                                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                                </svg>
                                Copy Address
                            </button>

                            {/* Disconnect */}
                            <button 
                                onClick={() => disconnect()} 
                                className="w-full flex items-center gap-3 px-3 py-2 text-sm text-red-500 hover:bg-red-50 hover:text-red-600 rounded-lg transition-colors"
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
                                    <path d="M18.36 6.64a9 9 0 1 1-12.73 0"></path>
                                    <line x1="12" y1="2" x2="12" y2="12"></line>
                                </svg>
                                Disconnect
                            </button>
                        </div>
                    </div>
                )}
            </div>
        );
    }

    // If not connected, show the connect button
    return (
        <button
            onClick={() => open()}
            className={`flex items-center gap-2 w-full p-2 rounded transition-colors ${
                centerContent ? 'justify-center' : (isCollapsed ? 'justify-center' : 'justify-start')
            } hover:bg-[var(--surface-hover)]`}
        >
            {/* Wallet icon */}
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
                <path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1"/>
                <path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4"/>
            </svg>
            {!isCollapsed && <span className="text-xs">Connect Wallet</span>}
        </button>
    );
}