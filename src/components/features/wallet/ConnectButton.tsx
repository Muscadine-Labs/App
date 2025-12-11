'use client';

import { useAccount } from 'wagmi';
import {
    ConnectWallet,
    Wallet,
    WalletDropdown,
    WalletAdvancedAddressDetails,
    WalletAdvancedTokenHoldings,
    WalletAdvancedTransactionActions,
    WalletAdvancedWalletActions,
} from '@coinbase/onchainkit/wallet';
import { Name } from '@coinbase/onchainkit/identity';
import { WalletIcon } from '../../ui';

interface ConnectButtonProps {
    centerContent?: boolean;
}

export default function ConnectButton({}: ConnectButtonProps) {
    const { isConnected, address } = useAccount();

    // Dynamic styles based on connection status
    const buttonStyles = isConnected
        ? `
            text-[var(--foreground)] bg-[var(--background)] rounded py-3 text-xs gap-2
            hover:bg-[var(--surface-hover)] active:bg-[var(--surface-active)]
        `
        : `
            text-[var(--foreground)] bg-[var(--background)] rounded px-2 py-3 text-xs font-normal
            hover:bg-[var(--surface-hover)] active:bg-[var(--surface-active)] 
        `;
    return (
        <Wallet>
            <ConnectWallet className={buttonStyles}>
                {isConnected && address ? (
                    <>
                        <WalletIcon size="sm" />
                        <Name className="text-xs m-0 p-0 !font-normal" />
                    </>
                ) : (
                    <span className="text-xs">Connect Wallet</span>
                )}
            </ConnectWallet>
            <WalletDropdown>
                <WalletAdvancedWalletActions />
                <WalletAdvancedAddressDetails />
                <WalletAdvancedTransactionActions />
                <WalletAdvancedTokenHoldings />
            </WalletDropdown>
        </Wallet>
    );
}