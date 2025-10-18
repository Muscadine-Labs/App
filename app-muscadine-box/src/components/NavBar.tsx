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
                    <Image src="/home-24.svg" alt="Muscadine" width={16} height={16} />
                    <p className="text-xs">Home</p>
                </button>
                <button className="flex items-center justify-start gap-2 w-full p-2">
                    <Image src="/vaults-24.svg" alt="Muscadine" width={16} height={16} />
                    <p className="text-xs">Vaults</p>
                </button>
                <button className="flex items-center justify-start gap-2 w-full p-2">
                    <Image src="/learn-24.svg" alt="Muscadine" width={16} height={16} />
                    <p className="text-xs">Learn</p>
                </button>

            </div>
        </div>



    )};