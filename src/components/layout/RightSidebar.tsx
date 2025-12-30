import LearnContent from '@/components/features/learn/LearnContent';

interface RightSidebarProps {
    isCollapsed: boolean;
}

export default function RightSidebar({ isCollapsed }: RightSidebarProps) {
    return (
        <div 
            className={`relative bg-[var(--background)] transition-all duration-300 flex-shrink-0 ${
                isCollapsed ? 'w-0 border-l-0' : 'w-80 border-l border-[var(--border-subtle)]'
            }`}
            style={{
                width: isCollapsed ? '0px' : '320px',
                minWidth: isCollapsed ? '0px' : '320px',
                overflow: isCollapsed ? 'hidden' : 'visible'
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
