'use client';

// Define the shape of the props this component expects
type Vault = {
  name: string;
  address: string;
};

type VaultNavProps = {
  vaults: Vault[];
  activeVaultAddress: string;
  onVaultSelect: (address: string) => void;
};

export default function VaultNav({ vaults, activeVaultAddress, onVaultSelect }: VaultNavProps) {
  return (
    <div className="flex items-center justify-center bg-surface rounded-full border border-border shadow-md mt-5">
      {vaults.map((vault) => (
        <button
          key={vault.address}
          onClick={() => onVaultSelect(vault.address)}
          className={`
            px-16 py-2 text-sm font-semibold rounded-full transition-colors duration-200
            ${activeVaultAddress === vault.address
              ? '!bg-[var(--accent)] text-white' // Style for the active button
              : 'text-foreground-secondary hover:bg-background' // Style for inactive buttons
            }
          `}
        >
          {vault.name.replace('Muscadine ', '').replace(' Vault', '')}
        </button>
      ))}
    </div>
  );
}