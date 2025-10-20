'use client';

import {
    useAppKitAccount,
    useAppKit
} from '@reown/appkit/react';


interface ConnectButtonProps {
    isCollapsed?: boolean;
    centerContent?: boolean;
}

export default function ConnectButton({ isCollapsed = false, centerContent = false }: ConnectButtonProps) {
    const { address, isConnected } = useAppKitAccount();
    const { open } = useAppKit();

    // If connected, show the address button that opens Reown modal
    if (isConnected && address) {
        const truncatedAddress = `${address.slice(0, 6)}...${address.slice(-4)}`;

        return (
            <button
                onClick={() => open()}
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