'use client';

import { useState } from 'react'; // 1. Import useState
import { VAULTS } from "@/lib/vaults";
import VaultNav from "./VaultNav";

export default function Dashboard() {
    const vaults = Object.values(VAULTS);

    // 2. Create state to hold the selected address
    // Initialize it with the address of the first vault
    const [activeVaultAddress, setActiveVaultAddress] = useState(vaults[0].address);
    
    // The 'onVaultSelect' function is now the state setter
    const onVaultSelect = (address: string) => {
        setActiveVaultAddress(address);
    };

    return (
        <div className="flex flex-col items-center justify-center h-[calc(100vh-var(--nav-bar-height))]">
            <div className="flex items-center justify-center w-full h-full m-10 px-10 gap-5">
                <div className="flex flex-col items-center justify-center w-3/4 h-full gap-5">
                    <div className="flex items-center bg-[var(--surface)] justify-center rounded-3xl w-full h-1/5">
                        <h1 className="text-2xl font-bold">Account Stats and Info</h1>
                    </div>
                    <div className="flex items-start bg-[var(--surface)] justify-center rounded-3xl w-full h-full">
                        {/* 3. Pass the state and the setter function as props */}
                        <VaultNav 
                            vaults={vaults} 
                            activeVaultAddress={activeVaultAddress} 
                            onVaultSelect={onVaultSelect} 
                        />
                        {/* You would also render the VaultDisplay for the active vault here */}
                    </div>
                </div>
                <div className="p-10 flex flex-col items-center bg-[var(--surface)] justify-start rounded-3xl w-1/4 h-full">
                       
                </div>
            </div>
        </div>
    );
}