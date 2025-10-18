'use client';

import { useState, useRef } from 'react';
import {
    useAppKitAccount,
    useAppKit,
    useDisconnect,
    useWalletInfo,
} from '@reown/appkit/react';
import Image from 'next/image';
import { useOnClickOutside } from '@/app/hooks/onClickOutside';


export default function ConnectButton() {
    const { address, isConnected } = useAppKitAccount();
    const { open } = useAppKit();
    const { disconnect } = useDisconnect();
    const { walletInfo } = useWalletInfo();

    // 1. State to manage dropdown visibility
    const [isDropdownOpen, setIsDropdownOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    // 2. Hook to close dropdown when clicking outside
    useOnClickOutside(dropdownRef, () => setIsDropdownOpen(false));

    // If connected, show the address and the dropdown menu
    if (isConnected && address) {
        const truncatedAddress = `${address.slice(0, 6)}...${address.slice(-4)}`;

        const handleCopy = () => {
            navigator.clipboard.writeText(address);
            setIsDropdownOpen(false); // Close menu after copying
        };

        return (
            <div className="relative" ref={dropdownRef}>
                {/* Main button to toggle the dropdown */}
                <button
                    onClick={() => setIsDropdownOpen(prev => !prev)}
                    className="px-2 py-2 bg-[var(--surface)] hover:bg-[var(--surface-hover)] text-foreground text-sm cursor-pointer rounded-full flex items-center gap-2"
                >
                    {walletInfo?.icon && (
                        <Image src={walletInfo.icon} alt={walletInfo.name} width={24} height={24} className="rounded-full" />
                    )}
                    {truncatedAddress}
                </button>

                
                {isDropdownOpen && (
                    <div className="absolute top-full right-0 mt-2 w-64 bg-[var(--surface)] transition-colors duration-200 rounded-xl shadow-lg p-4 flex flex-col gap-4">
                        <div className="flex items-center justify-between">
                            <span className="font-semibold">{truncatedAddress}</span>
                            <div className="flex items-center gap-2">
                                {/* --- Copy Icon --- */}
                                <button 
                                    onClick={handleCopy} 
                                    className="p-2 text-foreground-secondary hover:bg-[var(--surface-hover)] transition-colors duration-200 rounded-full" 
                                    aria-label="Copy address" 
                                    title="Copy address"
                                >
                                    <svg 
                                        xmlns="http://www.w3.org/2000/svg" 
                                        viewBox="0 0 24 24" 
                                        className="h-4 w-4" 
                                        fill="none" 
                                        stroke="currentColor" 
                                        strokeWidth="2" 
                                        strokeLinecap="round" 
                                        strokeLinejoin="round"
                                    >
                                        <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                                        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                                    </svg>
                                </button>

                                {/* --- Disconnect Icon --- */}
                                <button 
                                    onClick={() => disconnect()} 
                                    className="p-2 text-foreground-secondary hover:bg-[var(--surface-hover)] transition-colors duration-200 rounded-full" 
                                    aria-label="Disconnect" 
                                    title="Disconnect"
                                >
                                    <svg 
                                        xmlns="http://www.w3.org/2000/svg" 
                                        viewBox="0 0 24 24" 
                                        className="h-4 w-4" 
                                        fill="none"     
                                        stroke="currentColor" 
                                        strokeWidth="2" 
                                        strokeLinecap="round" 
                                        strokeLinejoin="round"
                                    >
                                        <path d="M18.36 6.64a9 9 0 1 1-12.73 0"></path>
                                        <line x1="12" y1="2" x2="12" y2="12"></line>
                                    </svg>
                                </button>
                            </div>
                        </div>

                        {/* You can add the Theme Toggler back in here if you need it */}
                        
                    </div>
                )}
            </div>
        );
    }

    // If not connected, show the connect button as before
    return (
        <button
            onClick={() => open()}
            className="px-6 py-3 transition-all font-bold hover:shadow-lg duration-300 rounded-3xl text-xs bg-gradient-to-br from-blue-600 to-purple-700 text-white cursor-pointer"
        >
            Connect Wallet
        </button>
    );
}