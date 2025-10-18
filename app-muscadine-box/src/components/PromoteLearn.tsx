import Link from "next/link";

export default function PromoteLearn() {
    return (
        <div className="flex flex-col rounded-lg bg-[var(--surface)] h-full justify-center items-start gap-4 p-4">
            <h1>Learn</h1>
            <p className="text-sm text-[var(--foreground-secondary)] max-w-[400px]">We know that crypto can be complicated and overwhelming. Consider checking out some of our resources to better understand how our app works.</p>
            <Link href="https://muscadine.io" className="bg-[var(--accent)] text-[var(--foreground)] p-2 rounded-lg flex items-center gap-2 text-sm">
                Resources
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
                    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
                    <polyline points="15,3 21,3 21,9"/>
                    <line x1="10" y1="14" x2="21" y2="3"/>
                </svg>
            </Link>
        </div>
    )
}