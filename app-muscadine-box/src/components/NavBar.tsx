import ConnectButton from "./ConnectButton";
import Image from "next/image";

export function NavBar() {
    return (
        <header>
            <div className="flex justify-between items-center fixed px-4 py-3 top-0 left-0 right-0 z-50">
                <div className="flex items-center gap-2">
                    <Image src="/favicon.png" alt="Muscadine" width={32} height={32} className="rounded-full"/>
                    <h1 className="text-2xl">Muscadine</h1>
                </div>

                <ConnectButton />
            </div>
        </header>
    )
}
export default NavBar;
