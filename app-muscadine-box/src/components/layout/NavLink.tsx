import { NavItem } from '@/config/navigation';
import { Button } from '../ui/Button';

interface NavLinkProps {
    item: NavItem;
    isActive: boolean;
    isCollapsed: boolean;
    onClick?: () => void;
}

export function NavLink({ item, isActive, isCollapsed, onClick }: NavLinkProps) {
    // All navigation items are now internal tabs
    return (
        <Button
            onClick={onClick}
            variant="ghost"
            size="md"
            icon={item.icon}
            fullWidth
            className={`${
                isCollapsed ? 'justify-center' : 'justify-start'
            } ${
                isActive
                    ? 'bg-[var(--surface-elevated)] text-[var(--foreground)] font-semibold' 
                    : ''
            }`}
        >
            {!isCollapsed && <span className="text-xs">{item.label}</span>}
        </Button>
    );
}

