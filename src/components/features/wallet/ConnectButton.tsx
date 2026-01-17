'use client';

import React, { useRef, useEffect } from 'react';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { useAdvisoryAgreement } from '@/contexts/AdvisoryAgreementContext';

export default function ConnectButtonComponent() {
    const { isAccepted, openModal, shouldOpenWalletConnect, clearWalletConnectFlag } = useAdvisoryAgreement();
    const openConnectModalRef = useRef<(() => void) | null>(null);
    const accountRef = useRef<any>(null);
    const chainRef = useRef<any>(null);
    const authenticationStatusRef = useRef<string | undefined>(undefined);
    const mountedRef = useRef<boolean>(false);

    // Auto-open wallet connect modal after accepting agreement
    useEffect(() => {
        if (shouldOpenWalletConnect && isAccepted && openConnectModalRef.current) {
            const ready = mountedRef.current && authenticationStatusRef.current !== 'loading';
            const connected =
                ready &&
                accountRef.current &&
                chainRef.current &&
                (!authenticationStatusRef.current ||
                    authenticationStatusRef.current === 'authenticated');

            if (!connected && ready) {
                clearWalletConnectFlag();
                openConnectModalRef.current();
            }
        }
    }, [shouldOpenWalletConnect, isAccepted, clearWalletConnectFlag]);

    return (
        <ConnectButton.Custom>
            {({
                account,
                chain,
                openAccountModal,
                openChainModal,
                openConnectModal,
                authenticationStatus,
                mounted,
            }) => {
                // Update refs for use in effect
                openConnectModalRef.current = openConnectModal;
                accountRef.current = account;
                chainRef.current = chain;
                authenticationStatusRef.current = authenticationStatus;
                mountedRef.current = mounted;

                const ready = mounted && authenticationStatus !== 'loading';
                const connected =
                    ready &&
                    account &&
                    chain &&
                    (!authenticationStatus ||
                        authenticationStatus === 'authenticated');

                const handleConnectClick = () => {
                    if (!isAccepted) {
                        // Show advisory agreement modal instead of wallet connect modal
                        openModal();
                    } else {
                        // User has accepted, proceed with wallet connection
                        openConnectModal();
                    }
                };

                return (
                    <div
                        {...(!ready && {
                            'aria-hidden': true,
                            style: {
                                opacity: 0,
                                pointerEvents: 'none',
                                userSelect: 'none',
                            },
                        })}
                    >
                        {!connected ? (
                            <button
                                onClick={handleConnectClick}
                                type="button"
                                className="inline-flex items-center justify-center px-3 py-1.5 text-sm gap-1.5 text-[var(--foreground)] transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[var(--border)] rounded-md hover:bg-[var(--surface-hover)] active:bg-[var(--surface-active)] cursor-pointer"
                            >
                                Connect Wallet
                            </button>
                        ) : chain.unsupported ? (
                            <button
                                onClick={openChainModal}
                                type="button"
                                className="inline-flex items-center justify-center px-3 py-1.5 text-sm gap-1.5 text-[var(--foreground)] transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[var(--border)] rounded-md hover:bg-[var(--surface-hover)] active:bg-[var(--surface-active)] cursor-pointer"
                            >
                                Wrong network
                            </button>
                        ) : (
                            <button
                                onClick={openAccountModal}
                                type="button"
                                className="inline-flex items-center justify-center px-3 py-1.5 text-sm gap-1.5 text-[var(--foreground)] transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[var(--border)] rounded-md hover:bg-[var(--surface-hover)] active:bg-[var(--surface-active)] cursor-pointer"
                            >
                                {account.displayName}
                            </button>
                        )}
                    </div>
                );
            }}
        </ConnectButton.Custom>
    );
}