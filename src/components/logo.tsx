import Image from "next/image";
import { cn } from "@/lib/cn";
import wordmark from "../../public/ogserc-wordmark.png";
import mark from "../../public/ogserc-mark.png";

/**
 * The OGSERC logo. The wordmark's dark green letters need a light ground, so
 * it always sits on a white tile, in dark mode as well.
 */
export function Logo({ className, height = 32, priority = false }: { className?: string; height?: number; priority?: boolean }) {
  const width = Math.round((wordmark.width / wordmark.height) * height);
  return (
    <span className={cn("inline-flex items-center rounded-lg bg-white px-2.5 py-1.5 shadow-sm ring-1 ring-black/5", className)}>
      <Image src={wordmark} alt="OGSERC" width={width} height={height} priority={priority} />
    </span>
  );
}

/** The square mark (the "O" with the Ogun State map), for tight spaces. */
export function LogoMark({ size = 32, className }: { size?: number; className?: string }) {
  return <Image src={mark} alt="OGSERC" width={size} height={size} className={cn("shrink-0", className)} />;
}
