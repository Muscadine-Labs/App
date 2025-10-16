'use client';

import { useAccount } from 'wagmi';
import useSWR from 'swr';
import { formatUnits } from 'viem';
import { memo } from 'react';
import Image from 'next/image';

const DownArrowIcon = ({ isOpen }: { isOpen: boolean }) => (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={2}
      stroke="currentColor"
      // Apply rotation and transition for a smooth animation
      className={`w-4 h-4 text-[var(--accent)] transform transition-transform duration-200 ${
        isOpen ? 'rotate-180' : 'rotate-0'
      }`}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
    </svg>
  );

export const AssetList = memo(function AssetList() {
  
  return (
    <div className="bg-surface p-4 rounded-lg w-full">
        <div className="flex justify-evenly items-center gap-4">
            <div className="flex flex-col justify-center items-center rounded-lg">
                <p className="text-xs">Total Assets</p>
                <div className="flex items-center gap-1">
                    <p className="text-lg">$0.00</p>
                    <DownArrowIcon isOpen={false} />
                </div>
                
            </div>
            <div className="flex flex-col justify-center items-center  rounded-lg">
                <p className="text-xs">Vault Balance</p>
                <p className="text-lg">$0.00</p>
                
            </div>
            <div className="flex flex-col justify-center items-center  rounded-lg">
                <p className="text-xs">Pending Rewards</p>
                <p className="text-lg">$0.00</p>
            </div>
        </div>
      
    </div>
  );
});