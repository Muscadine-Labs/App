import Image from "next/image";
import Link from "next/link";

export function NavBar() {
    return (
        <div id="navbar" className="flex flex-col fixed top-0 left-0 w-[var(--navbar-width)] h-screen bg-[var(--background)] p-4">
            <div className="flex items-center justify-start gap-2 p-2">
                <Image src="/favicon.png" alt="Muscadine" width={16} height={16} className="rounded-full"/>
                <Link href="https://muscadine.box" className="text-xs">Muscadine</Link>
            </div>
            <div className="flex flex-col items-center justify-center gap-2 mt-6">
                <button className="flex items-center justify-start gap-2 w-full p-2">
                <svg 
                    xmlns="http://www.w3.org/2000/svg" 
                    viewBox="0 0 24 24" 
                    className="w-4 h-4 text-foreground"
                    fill="currentColor"
                    >
                    <path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z"/>
                </svg>
                    <p className="text-xs">Home</p>
                </button>
                <button className="flex items-center justify-start gap-2 w-full p-2">
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
                    <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
                    <rect x="7" y="8" width="10" height="8" rx="1" ry="1"/>
                    <path d="M12 8v8"/>
                    <path d="M8 12h8"/>
                    </svg>
                    <p className="text-xs">Vaults</p>
                </button>
                <button className="flex items-center justify-start gap-2 w-full p-2">
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
                    <p className="text-xs">Learn</p>
                </button>

            </div>
        </div>



    )};