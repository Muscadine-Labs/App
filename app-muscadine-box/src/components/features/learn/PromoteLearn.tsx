import Link from "next/link";
import { BookIcon, ExternalLinkIcon } from '../../ui';

export default function PromoteLearn() {
    return (
        <div className="flex flex-col rounded-lg bg-[var(--surface)] h-full justify-center items-start gap-4 p-4 border border-[var(--primary)]">
            <div className="flex items-center gap-2">
                <BookIcon size="sm" />
                <h1>Learn</h1>
            </div>
            <p className="text-sm text-[var(--foreground-secondary)] max-w-[400px]">We know that crypto can be complicated and overwhelming. Consider checking out some of our resources to better understand how our app works.</p>
            <Link href="https://docs.muscadine.io/" target="_blank" className="bg-[var(--surface-elevated)] text-[var(--foreground)] p-2 rounded-lg flex items-center gap-2 text-sm">
                Resources
                <ExternalLinkIcon size="sm" />
            </Link>
        </div>
    )
}