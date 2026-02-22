export const viewportBoundsSchema = {
  type: "object",
  properties: {
    left: { type: "number" },
    top: { type: "number" },
    width: { type: "number" },
    height: { type: "number" },
  },
  required: ["left", "top", "width", "height"],
  additionalProperties: false,
} as const;
