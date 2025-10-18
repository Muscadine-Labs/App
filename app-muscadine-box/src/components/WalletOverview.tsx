'use client';

import { useAppKitAccount, useWalletInfo } from '@reown/appkit/react';
import { useBalance } from 'wagmi';
import Image from 'next/image';
import { usePrices } from '@/app/PriceContext';

export default function WalletOverview() {
    const { address, isConnected } = useAppKitAccount();
    const { walletInfo } = useWalletInfo();
    const { data: balance } = useBalance({
        address: address as `0x${string}`,
        query: { enabled: !!address }
    });
    
    const truncatedAddress = address ? `${address.slice(0, 6)}...${address.slice(-4)}` : '';
    const formattedBalance = balance ? 
    parseFloat(balance.formatted).toString() : '0';
    const { eth: ethPrice } = usePrices();
    const usdValue = ethPrice && balance ? 
        (parseFloat(balance.formatted) * ethPrice).toLocaleString('en-US', {
            style: 'currency',
            currency: 'USD'
        }) : null;
    return (
        <div className="flex flex-col items-start justify-start w-full h-full bg-[var(--surface)] rounded-lg px-8 py-4 gap-6 min-w-md overflow-x-auto">
            <div className="flex items-center gap-2">
                {isConnected && walletInfo?.icon && (
                    <Image 
                        src={walletInfo.icon} 
                        alt={walletInfo.name || 'Wallet'} 
                        width={24} 
                        height={24} 
                        className="rounded-full"
                    />
                )}
                <h1>
                    Wallet {isConnected && truncatedAddress && (
                        <span className="text-sm font-normal text-gray-500 ml-1">
                            ({truncatedAddress})
                        </span>
                    )}
                </h1>
            </div>
            <div className="flex items-start justify-between w-full">
                <div className="flex flex-col items-start">
                    <h1 className="text-md text-left">
                        Balance
                    </h1>
                    <h1 className="text-3xl font-bold">
                        {usdValue || `${formattedBalance} ${balance?.symbol || 'ETH'}`}
                    </h1>
                </div>
                <div className="flex flex-col items-start">
                    <h1 className="text-md text-left">
                        Value in Morpho
                    </h1>
                    <h1 className="text-3xl font-bold">
                        $0.00
                    </h1>
                </div>
                <div className="flex flex-col items-start">
                    <h1 className="text-md text-left">
                       Interest Earned
                    </h1>
                    <h1 className="text-3xl font-bold">
                        $0.00
                    </h1>
                </div>
            </div>
        </div>
    )
}