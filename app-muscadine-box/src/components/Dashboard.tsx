import MainDashboardSection from "./MainDashboardSection";
import WalletOverview from "./WalletOverview";

export default function Dashboard() {
    
    return (
        <div className="w-full bg-[var(--background)]">
            <div className="flex justify-center items-center rounded-lg h-screen w-full">
                <div className="grid grid-cols-2 gap-4 h-full w-full " style={{ gridTemplateRows: '1fr 4fr' }}>
                    {/* First row */}
                    <div className="rounded-lg pl-4 pt-4">
                        <WalletOverview />
                    </div>
                    <div className="rounded-lg pr-4 pt-4">
                        
                    </div>
                    
                    {/* Second row - spans both columns */}
                    <div className="col-span-2 rounded-lg pb-4 px-4">
                        <MainDashboardSection />
                    </div>
                </div>
            </div>
        </div>
    );
}