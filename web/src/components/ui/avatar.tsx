import { type ComponentProps, useState } from "react";
import { cn } from "@/lib/utils";

type Props = ComponentProps<"div"> & {
	src?: string | null;
	alt?: string;
	fallback: string;
	size?: "sm" | "md";
};

export function Avatar({ src, alt, fallback, size = "md", className, ...props }: Props) {
	const [errored, setErrored] = useState(false);
	const showImg = !!src && !errored;
	const dim = size === "sm" ? "h-7 w-7 text-xs" : "h-8 w-8 text-sm";

	return (
		<div
			className={cn(
				"relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-secondary text-secondary-foreground ring-1 ring-foreground/10",
				dim,
				className,
			)}
			{...props}
		>
			{showImg ? (
				<img
					src={src}
					alt={alt ?? ""}
					className="h-full w-full object-cover"
					onError={() => setErrored(true)}
				/>
			) : (
				<span className="font-medium leading-none">{fallback}</span>
			)}
		</div>
	);
}
