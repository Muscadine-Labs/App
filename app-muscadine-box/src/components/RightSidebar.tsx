import LearnContent from "./LearnContent";

interface RightSidebarProps {
    isCollapsed: boolean;
    onToggle: () => void;
}

export default function RightSidebar({ isCollapsed, onToggle }: RightSidebarProps) {
    return (
        <div className={`fixed right-0 top-0 h-screen bg-[var(--background)] border-l border-[var(--border-subtle)] transition-all duration-300 ${
            isCollapsed ? 'w-12' : 'w-80'
        }`}>
            <div className="h-full flex flex-col">
                {/* Collapse Toggle Button */}
                <div className="flex justify-start p-2">
                    <button
                        onClick={onToggle}
                        className="p-2 hover:bg-[var(--surface-hover)] rounded transition-colors"
                    >
                        <svg 
                            xmlns="http://www.w3.org/2000/svg" 
                            viewBox="0 0 24 24" 
                            className="w-4 h-4"
                            fill="none" 
                            stroke="currentColor" 
                            strokeWidth="2" 
                            strokeLinecap="round" 
                            strokeLinejoin="round"
                        >
                            <path d={isCollapsed ? "M15 18l-6-6 6-6" : "M9 18l6-6-6-6"} />
                        </svg>
                    </button>
                </div>
                
                {/* Sidebar Content - Hidden when collapsed */}
                {!isCollapsed && (
                    <div className="flex-1 overflow-y-auto p-4">
                        <LearnContent />
                    </div>
                )}
            </div>
        </div>
    );
}
