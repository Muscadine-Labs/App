'use client';

import {
    useAppKitAccount,
    useAppKit
} from '@reown/appkit/react';
import { Button, WalletIcon } from '../../ui';


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
            <Button
                onClick={() => open()}
                variant="ghost"
                size="md"
                icon={<WalletIcon size="sm" />}
                fullWidth={!isCollapsed}
                className={isCollapsed ? 'justify-center' : 'justify-start'}
            >
                {!isCollapsed && <span className="text-xs">{truncatedAddress}</span>}
            </Button>
        );
    }

    // If not connected, show the connect button
    return (
        <Button
            onClick={() => open()}
            variant="ghost"
            size="md"
            icon={<WalletIcon size="sm" />}
            fullWidth
            className={centerContent ? 'justify-center' : (isCollapsed ? 'justify-center' : 'justify-start')}
        >
            {!isCollapsed && <span className="text-xs">Connect Wallet</span>}
        </Button>
    );
}