export const AI_FOOTER_DEFAULT_HEIGHT = 220;
export const AI_FOOTER_MIN_HEIGHT = 140;
export const AI_FOOTER_MAX_HEIGHT = 460;
export const AI_FOOTER_COLLAPSED_HEIGHT = 34;
export const AI_FOOTER_HEIGHT_STORAGE_KEY = "collabboard-ai-footer-height-v1";

export function clampAiFooterHeight(nextHeight: number): number {
  return Math.min(
    AI_FOOTER_MAX_HEIGHT,
    Math.max(AI_FOOTER_MIN_HEIGHT, Math.round(nextHeight)),
  );
}
