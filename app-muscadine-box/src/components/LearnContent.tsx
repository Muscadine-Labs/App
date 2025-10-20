import Link from "next/link";


export default function LearnContent() {
    return (
        <div className="flex flex-col items-start justify-start h-full w-full gap-2">
            <h1 className="text-xl text-left text-[var(--foreground)]">Welcome to Learn</h1>
            <p className="text-sm text-left text-[var(--foreground-secondary)]">We know that crypto can be complicated and overwhelming. Consider checking out some of our resources to better understand how our app works.</p>
            <div className="w-full py-2 gap-2">
                <h2>Where to start?</h2>
                <ul className="w-full py-2">
                    <li className="border-b border-[var(--border-subtle)] last:border-b-0 py-2">
                        <Link href="https://muscadine.io/learn/what-is-crypto" className="text-sm text-[var(--foreground-secondary)] transition-colors">What is DeFi</Link>
                    </li>
                    <li className="border-b border-[var(--border-subtle)] last:border-b-0 py-2">
                        <Link href="https://muscadine.io/learn/what-is-crypto" className="text-sm text-[var(--foreground-secondary)] transition-colors">What is Morpho</Link>
                    </li>
                    <li className="border-b border-[var(--border-subtle)] last:border-b-0 py-2">
                        <Link href="https://muscadine.io/learn/what-is-crypto" className="text-sm text-[var(--foreground-secondary)] transition-colors">Understanding Vaults</Link>
                    </li>
                    <li className="border-b border-[var(--border-subtle)] last:border-b-0 py-2">
                        <Link href="https://muscadine.io/learn/what-is-crypto" className="text-sm text-[var(--foreground-secondary)] transition-colors">Risk Explanation</Link>
                    </li>
                </ul>
                <div className="flex justify-start">
                    <Link 
                        href="https://muscadine.io/learn/what-is-crypto" 
                        className="inline-flex items-center gap-2 px-4 py-2 bg-[var(--primary)] text-white text-sm rounded-lg hover:bg-[var(--primary-hover)] transition-colors"
                    >
                        All Resources
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
            </div>
            
            
        </div>
    )
}