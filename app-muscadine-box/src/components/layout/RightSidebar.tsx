import LearnContent from "../features/learn/LearnContent";

interface RightSidebarProps {
    isCollapsed: boolean;
    onToggle: () => void;
}

export default function RightSidebar({ isCollapsed, onToggle }: RightSidebarProps) {
    return (
        <div 
            className={`relative bg-[var(--background)] border-l border-[var(--border-subtle)] transition-all duration-300 flex-shrink-0 ${
                isCollapsed ? 'w-16' : 'w-80'
            }`}
            style={{
                width: isCollapsed ? '64px' : '320px',
                minWidth: '64px'
            }}
        >
            {/* Arrow Toggle Button - Positioned at bottom left corner */}
            <div className="absolute bottom-4 right-0 transform -translate-x-1/2">
                <button
                    onClick={onToggle}
                    className="w-8 h-8 bg-[var(--surface-elevated)] hover:bg-[var(--surface-hover)] border border-[var(--border)] rounded-full transition-colors flex items-center justify-center group shadow-sm"
                >
                    <svg 
                        className={`w-4 h-4 text-[var(--foreground-secondary)] transition-transform duration-200 ${
                            isCollapsed ? '' : 'rotate-180'
                        }`} 
                        fill="none" 
                        stroke="currentColor" 
                        viewBox="0 0 24 24"
                    >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                    </svg>
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
