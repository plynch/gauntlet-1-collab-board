import { CONTAINER_GEOMETRY, STAGE_HEIGHT, STAGE_WIDTH } from "@/features/boards/components/container-membership-lab-logic";

export const mainStyle = {
  minHeight: "100dvh",
  display: "grid",
  placeItems: "center",
  background: "#e5e7eb",
  padding: 24,
} as const;

export const stageStyle = {
  width: STAGE_WIDTH,
  height: STAGE_HEIGHT,
  position: "relative",
  border: "1px solid #94a3b8",
  backgroundColor: "#f8fafc",
  backgroundImage:
    "linear-gradient(#e5e7eb 1px, transparent 1px), linear-gradient(90deg, #e5e7eb 1px, transparent 1px)",
  backgroundSize: "28px 28px",
} as const;

export const containerStyle = {
  position: "absolute",
  left: CONTAINER_GEOMETRY.x,
  top: CONTAINER_GEOMETRY.y,
  width: CONTAINER_GEOMETRY.width,
  height: CONTAINER_GEOMETRY.height,
  border: "2px solid #334155",
} as const;

export const sectionStyle = {
  position: "absolute",
  border: "1px solid rgba(51, 65, 85, 0.4)",
  background: "rgba(226, 232, 240, 0.2)",
  boxSizing: "border-box",
  pointerEvents: "none",
} as const;

export const sectionLabelStyle = {
  display: "inline-flex",
  margin: 4,
  padding: "1px 6px",
  borderRadius: 999,
  fontSize: 11,
  background: "rgba(255,255,255,0.9)",
  color: "#334155",
} as const;

export const objectStyle = {
  position: "absolute",
  borderRadius: 8,
  background: "#93c5fd",
  border: "2px solid #1d4ed8",
  cursor: "grab",
} as const;

export const statsStyle = {
  position: "absolute",
  left: 16,
  top: 16,
  display: "grid",
  gap: 8,
  padding: 10,
  borderRadius: 10,
  border: "1px solid #94a3b8",
  background: "rgba(255,255,255,0.96)",
  minWidth: 230,
} as const;

export const labelStyle = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  fontSize: 12,
} as const;

export const statLineStyle = { margin: 0, fontSize: 12 } as const;
