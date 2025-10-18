import MainDashboardSection from "./MainDashboardSection";
import WalletOverview from "./WalletOverview";
import RightSidebar from "./RightSidebar";
import { useState } from "react";

export default function Dashboard() {
    const [isRightSidebarCollapsed, setIsRightSidebarCollapsed] = useState(false);
    
    return (
        <div className="w-full bg-[var(--background)] h-screen flex">
            {/* Main Dashboard Area - Scrollable */}
            <div className={`flex-1 overflow-y-auto transition-all duration-300 ${isRightSidebarCollapsed ? 'mr-12 pr-4' : 'mr-80 pr-4'}`}>
                <div className="grid grid-cols-1 gap-4 h-full w-full" style={{gridTemplateRows: '1fr 4fr' }}>
                    {/* Top Section */}
                    <div className="rounded-lg pl-4 pt-4">
                        <WalletOverview />
                    </div>
                    
                    {/* Bottom Section */}
                    <div className="rounded-lg pl-4 pb-4">
                        <MainDashboardSection />
                    </div>
                </div>
            </div>
            
            {/* Right Sidebar - Fixed and Collapsible */}
            <RightSidebar 
                isCollapsed={isRightSidebarCollapsed}
                onToggle={() => setIsRightSidebarCollapsed(!isRightSidebarCollapsed)}
            />
        </div>
    );
}