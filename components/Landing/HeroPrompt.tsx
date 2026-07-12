"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Paperclip, Sparkles, MessageSquare, ArrowUp } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function HeroPrompt() {
  const [prompt, setPrompt] = useState("");
  const router = useRouter();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (prompt.trim()) {
      // In a real app, this would pass the initial prompt to the generation page
      router.push(`/generation?q=${encodeURIComponent(prompt)}`);
    } else {
      router.push("/generation");
    }
  };

  return (
    <div className="w-full max-w-4xl mx-auto mt-8">
      <form 
        onSubmit={handleSubmit}
        className="bg-white/60 dark:bg-black/40 backdrop-blur-2xl rounded-full p-2 pl-6 shadow-[0_8px_32px_rgba(0,0,0,0.08)] border border-white/40 flex items-center gap-2 transition-all hover:shadow-[0_8px_40px_rgba(0,0,0,0.12)] focus-within:shadow-[0_8px_40px_rgba(0,0,0,0.12)] focus-within:bg-white/80"
      >
        <input
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Ask Lovable to create a web app that..."
          className="flex-1 bg-transparent border-none focus:ring-0 text-lg sm:text-xl placeholder:text-muted-foreground/60 outline-none text-foreground"
          autoFocus
        />
        
        <div className="flex items-center gap-2 pr-1">
          <Button type="button" variant="ghost" size="sm" className="hidden sm:flex rounded-full text-muted-foreground hover:bg-black/5 hover:text-foreground">
            <Paperclip className="w-4 h-4 mr-2" />
            Attach
          </Button>
          <Button 
            type="submit" 
            size="default"
            className="rounded-full bg-lovable-primary text-primary-foreground hover:bg-lovable-primary/90 w-12 h-12 p-0 flex items-center justify-center transition-transform active:scale-95"
            disabled={!prompt.trim()}
          >
            <ArrowUp className="w-6 h-6" />
          </Button>
        </div>
      </form>
    </div>
  );
}
