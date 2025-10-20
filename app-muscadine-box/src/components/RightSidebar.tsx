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
            {/* Vertical Toggle Bar - Positioned on left border, centered vertically */}
            <div className="absolute left-0 top-1/2 transform -translate-y-1/2">
                <button
                    onClick={onToggle}
                    className="w-2 h-20 bg-[var(--border)] hover:bg-[var(--border-strong)] rounded-full transition-colors flex items-center justify-center group -translate-x-1/2"
                >
                    <div className="w-2 h-2 bg-[var(--foreground-secondary)] rounded-full opacity-0 group-hover:opacity-100 transition-opacity" />
                </button>
            </div>

            <div className="h-full flex flex-col">
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
