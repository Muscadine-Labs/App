import { NavItem } from '@/config/navigation';
import { Button } from '../ui/Button';

interface NavLinkProps {
    item: NavItem;
    isActive: boolean;
    onClick?: () => void;
}

export function NavLink({ item, isActive, onClick }: NavLinkProps) {
    // All navigation items are now internal tabs
    return (
        <Button
            onClick={onClick}
            variant="ghost"
            size="sm"
            icon={item.icon}
            className={`${
                isActive
                    ? 'bg-[var(--surface-elevated)] text-[var(--foreground)]' 
                    : ''
            }`}
        >
            <span className="text-sm">{item.label}</span>
        </Button>
    );
}

