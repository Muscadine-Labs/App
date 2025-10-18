import ConnectButton from "./ConnectButton";
import Image from "next/image";

function ConnectScreen() {
    return (
        <div className="flex flex-col items-center justify-center h-[calc(100vh-var(--nav-bar-height))]">
            <div className="flex flex-col w-72 h-100 bg-[var(--surface)] rounded-3xl items-center justify-end gap-20 p-8">
            <div className="flex flex-col items-center">
                    <div className="flex flex-col-reverse items-center">
                        <Image src="/favicon.png" alt="Muscadine" width={48} height={48} className="rounded-full" />
                    </div>
                   
                </div>
                <div className="flex flex-col items-center gap-4"> 
                    <p className="text-sm text-foreground-secondary text-center">Connecting your wallet gives you access to the Muscadine Vault</p>
                    <ConnectButton />
                </div>
                 
            
                <p className="text-xs text-foreground text-center">By connecting your wallet, you agree to the <a href="#" className="text-blue-500">Terms of Service</a> and <a href="#" className="text-blue-500">Privacy Policy</a></p>
                

            </div>
        </div>
    );
}

export default ConnectScreen;