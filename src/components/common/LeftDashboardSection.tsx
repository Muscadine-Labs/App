import VaultList from "../features/vault/VaultList";

export default function LeftDashboardSection() {
    return (
        <div className="flex flex-col rounded-lg bg-[var(--surface)] justify-start items-center h-full w-full p-4">
            <VaultList />
        </div>
    )
}