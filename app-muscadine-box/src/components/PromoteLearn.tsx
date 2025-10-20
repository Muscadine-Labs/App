import Link from "next/link";

export default function PromoteLearn() {
    return (
        <div className="flex flex-col rounded-lg bg-[var(--surface)] h-full justify-center items-start gap-4 p-4 border border-[var(--primary)]">
            <div className="flex items-center gap-2">
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
                            <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/>
                            <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>
                        </svg>
            <h1>Learn</h1>
            </div>
            <p className="text-sm text-[var(--foreground-secondary)] max-w-[400px]">We know that crypto can be complicated and overwhelming. Consider checking out some of our resources to better understand how our app works.</p>
            <Link href="https://muscadine.io" className="bg-[var(--surface-elevated)] text-[var(--foreground)] p-2 rounded-lg flex items-center gap-2 text-sm">
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