'use client';

import { ConnectButton } from '@rainbow-me/rainbowkit';

interface ConnectButtonProps {
    centerContent?: boolean;
}

export default function ConnectButtonComponent({}: ConnectButtonProps) {
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
                const ready = mounted && authenticationStatus !== 'loading';
                const connected =
                    ready &&
                    account &&
                    chain &&
                    (!authenticationStatus ||
                        authenticationStatus === 'authenticated');

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
                                onClick={openConnectModal}
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