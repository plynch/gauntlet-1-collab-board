export const AI_HELP_MESSAGE = [
  "🤖 Quick AI Help",
  "",
  "Try one of these:",
  "- Add a yellow sticky note that says 'User Research'",
  "- Create a blue rectangle at position 100,200",
  "- Move all the pink sticky notes to the right side",
  "- Create a SWOT analysis template",
  "",
  "You can ask in plain language anytime.",
  "Tip: Up/Down recalls command history.",
].join("\n");

export const AI_WELCOME_MESSAGE = [
  "👋 Hi! I can edit this board with natural language.",
  "",
  "Examples:",
  "• Add a yellow sticky note that says 'User Research'",
  "• Create a blue rectangle at position 100,200",
  "• Move all the pink sticky notes to the right side",
  "• Create a SWOT analysis template",
  "",
  "Use normal language first. Type /help if you want quick examples ✨",
].join("\n");

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
};
