import Link from "next/link";
import { Button } from "@/components/ui/button"; // Assuming standard shadcn button exists

export default function NavBar() {
  return (
    <nav className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-6 py-4">
      <div className="flex items-center gap-8">
        <Link href="/" className="flex items-center gap-2">
          {/* Placeholder Lovable Logo */}
          <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-pink-500 via-orange-400 to-blue-400 flex items-center justify-center">
            <div className="w-4 h-4 bg-white rounded-full opacity-50 mix-blend-overlay"></div>
          </div>
          <span className="text-xl font-semibold tracking-tight text-foreground">Lovable</span>
        </Link>
        
        <div className="hidden md:flex items-center gap-6 text-sm font-medium text-foreground/80">
          <Link href="#" className="hover:text-foreground transition-colors">Solutions</Link>
          <Link href="#" className="hover:text-foreground transition-colors">Enterprise</Link>
          <Link href="#" className="hover:text-foreground transition-colors">Pricing</Link>
          <Link href="#" className="hover:text-foreground transition-colors">Community</Link>
          <Link href="#" className="hover:text-foreground transition-colors">Discover</Link>
        </div>
      </div>

      <div className="flex items-center gap-4">
        <Link href="/generation" className="text-sm font-medium text-foreground hover:text-foreground/80 transition-colors">
          Log in
        </Link>
        <Link href="/generation">
          <Button className="bg-lovable-primary text-primary-foreground hover:bg-lovable-primary/90 rounded-full px-6 font-medium shadow-sm transition-transform active:scale-95">
            Get started
          </Button>
        </Link>
      </div>
    </nav>
  );
}
