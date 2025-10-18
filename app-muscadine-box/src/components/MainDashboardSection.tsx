import VaultList from "./VaultList";

export default function MainDashboardSection() {
    return (
        <div className="flex flex-col rounded-lg bg-[var(--surface)] justify-start items-center h-full w-full p-4">
            <VaultList />
           
        </div>
    )
}