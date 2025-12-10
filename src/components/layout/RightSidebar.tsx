import LearnContent from '@/components/features/learn/LearnContent';

interface RightSidebarProps {
    isCollapsed: boolean;
}

export default function RightSidebar({ isCollapsed }: RightSidebarProps) {
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
