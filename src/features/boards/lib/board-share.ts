export function getBoardShareUrl(boardId: string, origin: string): string {
  const normalizedOrigin = origin.endsWith("/") ? origin.slice(0, -1) : origin;
  return `${normalizedOrigin}/boards/${boardId}`;
}

export async function copyBoardUrlToClipboard(
  boardId: string,
  origin: string,
): Promise<string> {
  const shareUrl = getBoardShareUrl(boardId, origin);

  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(shareUrl);
    return shareUrl;
  }

  if (typeof document !== "undefined") {
    const input = document.createElement("textarea");
    input.value = shareUrl;
    input.setAttribute("readonly", "true");
    input.style.position = "fixed";
    input.style.opacity = "0";
    document.body.appendChild(input);
    input.focus();
    input.select();

    const copied = document.execCommand("copy");
    document.body.removeChild(input);
    if (copied) {
      return shareUrl;
    }
  }

  throw new Error("Clipboard is unavailable in this browser.");
}
