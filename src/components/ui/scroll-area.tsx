import * as React from "react"
import { cn } from "@/lib/utils"

const ScrollArea = React.forwardRef<
    HTMLDivElement,
    React.HTMLAttributes<HTMLDivElement> & { viewportRef?: React.RefObject<HTMLDivElement> }
>(({ className, children, viewportRef, ...props }, ref) => (
    <div
        ref={ref}
        className={cn("relative overflow-hidden", className)}
        {...props}
    >
        <div ref={viewportRef} className="h-full w-full overflow-auto scrollbar-hide">
            {children}
        </div>
    </div>
))
ScrollArea.displayName = "ScrollArea"

export { ScrollArea }
