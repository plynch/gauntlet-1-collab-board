import type { Meta, StoryObj } from "@storybook/react";
import type { ReactNode } from "react";

import { GridContainer } from "@/features/ui/components/grid-container";

type Point = { x: number; y: number };

const CANVAS_WIDTH = 1120;
const CANVAS_HEIGHT = 680;

/**
 * Renders story canvas frame.
 */
function StoryCanvasFrame({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        minHeight: "100vh",
        padding: "24px",
        background:
          "radial-gradient(1200px 520px at 50% -140px, #dbeafe 0%, #e2e8f0 52%, #e2e8f0 100%)",
      }}
    >
      <div
        style={{
          width: "min(1280px, 96vw)",
          margin: "0 auto",
          borderRadius: "18px",
          border: "1px solid rgba(51,65,85,0.35)",
          overflow: "hidden",
          boxShadow: "0 18px 40px rgba(15, 23, 42, 0.22)",
          background: "#f8fafc",
        }}
      >
        <div
          style={{
            height: 42,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "0 14px",
            borderBottom: "1px solid rgba(100,116,139,0.35)",
            background:
              "linear-gradient(180deg, rgba(255,255,255,0.92) 0%, rgba(241,245,249,0.9) 100%)",
          }}
        >
          <strong style={{ fontSize: 13, color: "#0f172a" }}>
            CollabBoard Component Library
          </strong>
          <span style={{ fontSize: 12, color: "#475569" }}>
            Board Shapes Showcase
          </span>
        </div>
        {children}
      </div>
    </div>
  );
}

/**
 * Renders shape tag.
 */
function ShapeTag({ label }: { label: string }) {
  return (
    <span
      style={{
        borderRadius: 999,
        border: "1px solid rgba(51,65,85,0.32)",
        background: "rgba(255,255,255,0.95)",
        color: "#1e293b",
        fontSize: 11,
        fontWeight: 600,
        padding: "5px 9px",
      }}
    >
      {label}
    </span>
  );
}

/**
 * Renders connectors scene.
 */
function ConnectorsLayer() {
  const undirectedStart: Point = { x: 174, y: 292 };
  const undirectedEnd: Point = { x: 346, y: 248 };
  const oneWayStart: Point = { x: 346, y: 248 };
  const oneWayEnd: Point = { x: 515, y: 170 };
  const twoWayStart: Point = { x: 515, y: 170 };
  const twoWayEnd: Point = { x: 812, y: 220 };

  return (
    <svg
      width={CANVAS_WIDTH}
      height={CANVAS_HEIGHT}
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
      }}
    >
      <defs>
        <marker
          id="arrow-head"
          markerWidth="10"
          markerHeight="10"
          refX="8.8"
          refY="5"
          orient="auto"
        >
          <path d="M0,0 L10,5 L0,10 Z" fill="#0f172a" />
        </marker>
        <marker
          id="arrow-head-mint"
          markerWidth="10"
          markerHeight="10"
          refX="8.8"
          refY="5"
          orient="auto"
        >
          <path d="M0,0 L10,5 L0,10 Z" fill="#0f766e" />
        </marker>
      </defs>

      <path
        d={`M ${undirectedStart.x} ${undirectedStart.y} C 230 292, 260 260, ${undirectedEnd.x} ${undirectedEnd.y}`}
        stroke="#334155"
        strokeWidth="3"
        fill="none"
      />
      <path
        d={`M ${oneWayStart.x} ${oneWayStart.y} C 396 236, 440 196, ${oneWayEnd.x} ${oneWayEnd.y}`}
        stroke="#0f172a"
        strokeWidth="3"
        fill="none"
        markerEnd="url(#arrow-head)"
      />
      <path
        d={`M ${twoWayStart.x} ${twoWayStart.y} C 604 186, 708 192, ${twoWayEnd.x} ${twoWayEnd.y}`}
        stroke="#0f766e"
        strokeWidth="3"
        fill="none"
        markerStart="url(#arrow-head-mint)"
        markerEnd="url(#arrow-head-mint)"
      />
    </svg>
  );
}

/**
 * Renders all board shapes on a styled canvas.
 */
function ShapeShowcaseCanvas() {
  return (
    <div
      style={{
        position: "relative",
        width: CANVAS_WIDTH,
        height: CANVAS_HEIGHT,
        backgroundColor: "#eef2f7",
        backgroundImage:
          "linear-gradient(to right, rgba(148,163,184,0.24) 1px, transparent 1px), linear-gradient(to bottom, rgba(148,163,184,0.24) 1px, transparent 1px)",
        backgroundSize: "40px 40px",
      }}
    >
      <ConnectorsLayer />

      <div
        style={{
          position: "absolute",
          left: 24,
          top: 20,
          display: "flex",
          gap: 8,
          flexWrap: "wrap",
          maxWidth: 760,
        }}
      >
        <ShapeTag label="sticky" />
        <ShapeTag label="rect" />
        <ShapeTag label="circle" />
        <ShapeTag label="triangle" />
        <ShapeTag label="star" />
        <ShapeTag label="connector-undirected" />
        <ShapeTag label="connector-arrow" />
        <ShapeTag label="connector-bidirectional" />
        <ShapeTag label="gridContainer" />
      </div>

      <div
        style={{
          position: "absolute",
          left: 72,
          top: 120,
          width: 204,
          height: 142,
          borderRadius: 12,
          border: "1px solid rgba(146, 64, 14, 0.45)",
          background: "#fde68a",
          boxShadow: "0 8px 20px rgba(146, 64, 14, 0.16)",
          padding: "12px 14px",
          display: "flex",
          flexDirection: "column",
          gap: 8,
        }}
      >
        <strong style={{ fontSize: 13, color: "#78350f" }}>Sticky note</strong>
        <span style={{ fontSize: 12, lineHeight: 1.35, color: "#92400e" }}>
          Stakeholder-ready
          <br />
          future UI library
        </span>
      </div>

      <div
        style={{
          position: "absolute",
          left: 286,
          top: 214,
          width: 120,
          height: 70,
          borderRadius: 12,
          border: "2px solid rgba(30, 64, 175, 0.55)",
          background: "#93c5fd",
          boxShadow: "0 8px 14px rgba(30, 64, 175, 0.2)",
        }}
      />

      <div
        style={{
          position: "absolute",
          left: 458,
          top: 116,
          width: 110,
          height: 110,
          borderRadius: "999px",
          border: "2px solid rgba(6, 95, 70, 0.58)",
          background: "#86efac",
          boxShadow: "0 8px 14px rgba(6, 95, 70, 0.17)",
        }}
      />

      <svg
        width="142"
        height="122"
        viewBox="0 0 142 122"
        style={{
          position: "absolute",
          left: 740,
          top: 138,
          overflow: "visible",
        }}
      >
        <polygon
          points="71,8 134,111 8,111"
          fill="#c4b5fd"
          stroke="rgba(55, 48, 163, 0.65)"
          strokeWidth="4"
          strokeLinejoin="round"
        />
      </svg>

      <svg
        width="180"
        height="170"
        viewBox="0 0 180 170"
        style={{
          position: "absolute",
          left: 830,
          top: 320,
          overflow: "visible",
        }}
      >
        <polygon
          points="90,8 110,64 170,64 122,100 140,160 90,124 40,160 58,100 10,64 70,64"
          fill="#fde047"
          stroke="rgba(51, 65, 85, 0.75)"
          strokeWidth="6"
          strokeLinejoin="round"
        />
      </svg>

      <div
        style={{
          position: "absolute",
          left: 530,
          top: 316,
          width: 430,
          height: 282,
          border: "1px solid rgba(100, 116, 139, 0.48)",
          borderRadius: 12,
          overflow: "hidden",
          background: "rgba(255,255,255,0.72)",
          boxShadow: "0 10px 22px rgba(15, 23, 42, 0.11)",
        }}
      >
        <GridContainer
          rows={2}
          cols={2}
          gap={2}
          minCellHeight={88}
          containerTitle="Grid container"
          sectionTitles={[
            "North",
            "East",
            "South",
            "West",
          ]}
          cellColors={["transparent", "#bfdbfe", "#d1fae5", "#fecaca"]}
          showCellColorPickers={false}
        />
      </div>
    </div>
  );
}

const meta = {
  title: "Board/Shapes Showcase",
  component: ShapeShowcaseCanvas,
  parameters: {
    layout: "fullscreen",
    docs: {
      description: {
        component:
          "A presentation-ready board canvas that showcases every currently supported board shape and connector style.",
      },
    },
  },
  decorators: [
    (Story) => (
      <StoryCanvasFrame>
        <Story />
      </StoryCanvasFrame>
    ),
  ],
} satisfies Meta<typeof ShapeShowcaseCanvas>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Gallery: Story = {};
