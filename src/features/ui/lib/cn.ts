import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Handles cn.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
