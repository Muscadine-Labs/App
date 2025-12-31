import { Button, ExternalLinkIcon } from '../../ui';

export default function LearnContent() {
    return (
        <div className="flex flex-col items-start justify-start h-full w-full gap-4">
            <h1 className="text-xl text-left text-[var(--foreground)]">Learning Resources</h1>
            <p className="text-sm text-left text-[var(--foreground-secondary)]">Learn about DeFi, Morpho Protocol, and how to use Muscadine vaults.</p>
            <div className="w-full py-2 gap-4">
                <div className="flex justify-start">
                    <Button
                        variant="primary"
                        size="md"
                        icon={<ExternalLinkIcon size="sm" />}
                        iconPosition="right"
                        onClick={() => window.open('https://docs.muscadine.io/', '_blank', 'noopener,noreferrer')}
                    >
                        View All Resources
                    </Button>
                </div>
            </div>
        </div>
    )
}