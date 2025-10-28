import Link from "next/link";
import { Button, ExternalLinkIcon } from '../../ui';


export default function LearnContent() {
    return (
        <div className="flex flex-col items-start justify-start h-full w-full gap-2">
            <h1 className="text-xl text-left text-[var(--foreground)]">Welcome to Learn</h1>
            <p className="text-sm text-left text-[var(--foreground-secondary)]">We know that crypto can be complicated and overwhelming. Consider checking out some of our resources to better understand how our app works.</p>
            <div className="w-full py-2 gap-2">
                <h2>Where to start?</h2>
                <ul className="w-full py-2">
                    <li className="border-b border-[var(--border-subtle)] last:border-b-0 py-2">
                        <Link href="https://docs.muscadine.io/" target="_blank" className="text-sm text-[var(--foreground-secondary)] transition-colors">What is DeFi</Link>
                    </li>
                    <li className="border-b border-[var(--border-subtle)] last:border-b-0 py-2">
                        <Link href="https://docs.muscadine.io/" target="_blank" className="text-sm text-[var(--foreground-secondary)] transition-colors">What is Morpho</Link>
                    </li>
                    <li className="border-b border-[var(--border-subtle)] last:border-b-0 py-2">
                        <Link href="https://docs.muscadine.io/" target="_blank" className="text-sm text-[var(--foreground-secondary)] transition-colors">Understanding Vaults</Link>
                    </li>
                    <li className="border-b border-[var(--border-subtle)] last:border-b-0 py-2">
                        <Link href="https://docs.muscadine.io/" target="_blank" className="text-sm text-[var(--foreground-secondary)] transition-colors">Risk Explanation</Link>
                    </li>
                </ul>
                <div className="flex justify-start">
                    <Button
                        variant="primary"
                        size="md"
                        icon={<ExternalLinkIcon size="sm" />}
                        iconPosition="right"
                        onClick={() => window.open('https://docs.muscadine.io/', '_blank', 'noopener,noreferrer')}
                    >
                        All Resources
                    </Button>
                </div>
            </div>
            
            
        </div>
    )
}