import type { Meta, StoryObj } from "@storybook/react";
import type { CSSProperties, ReactNode } from "react";

type PreviewKind =
  | "sticky"
  | "rect"
  | "circle"
  | "triangle"
  | "star"
  | "line"
  | "connectorUndirected"
  | "connectorArrow"
  | "connectorBidirectional";

type ShowcaseRow = {
  kind: PreviewKind;
  label: string;
};

function isConnectorPreviewKind(
  kind: PreviewKind,
): kind is "connectorUndirected" | "connectorArrow" | "connectorBidirectional" {
  return (
    kind === "connectorUndirected" ||
    kind === "connectorArrow" ||
    kind === "connectorBidirectional"
  );
}

const SHAPE_ROWS: ShowcaseRow[] = [
  { kind: "sticky", label: "Sticky note" },
  { kind: "rect", label: "Rectangle" },
  { kind: "circle", label: "Circle" },
  { kind: "triangle", label: "Triangle" },
  { kind: "star", label: "Star" },
  { kind: "line", label: "Line" },
  { kind: "connectorUndirected", label: "Connector (undirected)" },
  { kind: "connectorArrow", label: "Connector (arrow)" },
  { kind: "connectorBidirectional", label: "Connector (two-way)" },
];

function StoryShell({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        minHeight: "100vh",
        padding: "24px",
        background:
          "linear-gradient(180deg, #dbeafe 0%, #e2e8f0 35%, #e2e8f0 100%)",
      }}
    >
      <div
        style={{
          width: "min(1320px, 96vw)",
          margin: "0 auto",
          borderRadius: 16,
          border: "1px solid rgba(71,85,105,0.35)",
          overflow: "hidden",
          background: "#f8fafc",
          boxShadow: "0 18px 40px rgba(15, 23, 42, 0.18)",
        }}
      >
        <header
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            padding: "12px 16px",
            borderBottom: "1px solid rgba(100,116,139,0.3)",
            background:
              "linear-gradient(180deg, rgba(255,255,255,0.94) 0%, rgba(241,245,249,0.92) 100%)",
          }}
        >
          <strong style={{ fontSize: 13, color: "#0f172a" }}>
            CollabBoard Shape + Connector Label Gallery
          </strong>
          <span style={{ fontSize: 12, color: "#334155" }}>
            With/without text parity check
          </span>
        </header>
        {children}
      </div>
    </div>
  );
}

function RowFrame({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section
      style={{
        border: "1px solid rgba(148,163,184,0.42)",
        borderRadius: 12,
        overflow: "hidden",
        background: "rgba(255,255,255,0.8)",
      }}
    >
      <div
        style={{
          padding: "8px 12px",
          borderBottom: "1px solid rgba(148,163,184,0.3)",
          background: "rgba(241,245,249,0.75)",
          fontSize: 12,
          fontWeight: 700,
          color: "#0f172a",
        }}
      >
        {label}
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(2, minmax(260px, 1fr))",
          gap: 10,
          padding: 10,
        }}
      >
        {children}
      </div>
    </section>
  );
}

function PreviewTile({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <article
      style={{
        border: "1px solid rgba(148,163,184,0.35)",
        borderRadius: 10,
        background: "#f8fafc",
        minHeight: 150,
        display: "grid",
        gridTemplateRows: "auto 1fr",
      }}
    >
      <div
        style={{
          fontSize: 11,
          fontWeight: 700,
          color: "#334155",
          letterSpacing: "0.01em",
          padding: "8px 10px",
          borderBottom: "1px solid rgba(148,163,184,0.24)",
          background: "rgba(248,250,252,0.8)",
        }}
      >
        {title}
      </div>
      <div
        style={{
          position: "relative",
          overflow: "hidden",
          background:
            "linear-gradient(to right, rgba(59,130,246,0.1) 1px, transparent 1px), linear-gradient(to bottom, rgba(59,130,246,0.1) 1px, transparent 1px)",
          backgroundSize: "20px 20px",
        }}
      >
        {children}
      </div>
    </article>
  );
}

function LabelPill({ text }: { text: string }) {
  return (
    <div
      style={{
        position: "absolute",
        left: "50%",
        top: "50%",
        transform: "translate(-50%, -50%)",
        borderRadius: 8,
        border: "1px solid rgba(100,116,139,0.4)",
        background: "rgba(255,255,255,0.92)",
        color: "#0f172a",
        fontSize: 12,
        fontWeight: 600,
        lineHeight: 1.25,
        padding: "0.2rem 0.45rem",
        boxShadow: "0 2px 6px rgba(15,23,42,0.14)",
      }}
    >
      {text}
    </div>
  );
}

function ConnectorPreview({
  variant,
  text,
}: {
  variant: "connectorUndirected" | "connectorArrow" | "connectorBidirectional";
  text: string | null;
}) {
  const strokeColor =
    variant === "connectorArrow"
      ? "#1d4ed8"
      : variant === "connectorBidirectional"
        ? "#0f766e"
        : "#334155";
  const markerId = `${variant}-${text ? "label" : "plain"}`;
  const leftNodeStyle: CSSProperties = {
    position: "absolute",
    left: 30,
    top: 48,
    width: 38,
    height: 38,
    borderRadius: "999px",
    border: "2px solid rgba(15,23,42,0.28)",
    background: "#86efac",
  };
  const rightNodeStyle: CSSProperties = {
    position: "absolute",
    right: 28,
    top: 44,
    width: 56,
    height: 46,
    borderRadius: 8,
    border: "2px solid rgba(15,23,42,0.28)",
    background: "#93c5fd",
  };

  return (
    <>
      <div style={leftNodeStyle} />
      <div style={rightNodeStyle} />
      <svg
        viewBox="0 0 320 140"
        width="100%"
        height="100%"
        style={{
          position: "absolute",
          inset: 0,
          overflow: "visible",
          pointerEvents: "none",
        }}
      >
        <defs>
          <marker
            id={markerId}
            markerWidth="10"
            markerHeight="10"
            refX="8"
            refY="5"
            orient="auto"
          >
            <path d="M0 0 L10 5 L0 10 Z" fill={strokeColor} />
          </marker>
        </defs>
        <path
          d="M 68 67 C 118 67, 188 67, 236 66"
          stroke={strokeColor}
          strokeWidth="4"
          fill="none"
          markerStart={
            variant === "connectorBidirectional" ? `url(#${markerId})` : undefined
          }
          markerEnd={
            variant !== "connectorUndirected" ? `url(#${markerId})` : undefined
          }
        />
      </svg>
      {text ? <LabelPill text={text} /> : null}
    </>
  );
}

function PrimitivePreview({
  kind,
  text,
}: {
  kind: Exclude<
    PreviewKind,
    "connectorUndirected" | "connectorArrow" | "connectorBidirectional"
  >;
  text: string | null;
}) {
  const baseShapeStyle: CSSProperties = {
    position: "absolute",
    left: "50%",
    top: "50%",
    transform: "translate(-50%, -50%)",
  };

  if (kind === "sticky") {
    return (
      <>
        <div
          style={{
            ...baseShapeStyle,
            width: 136,
            height: 102,
            borderRadius: 10,
            border: "1px solid rgba(146,64,14,0.46)",
            background: "#fde68a",
            boxShadow: "0 8px 16px rgba(146,64,14,0.16)",
          }}
        />
        {text ? <LabelPill text={text} /> : null}
      </>
    );
  }

  if (kind === "rect") {
    return (
      <>
        <div
          style={{
            ...baseShapeStyle,
            width: 160,
            height: 90,
            borderRadius: 6,
            border: "2px solid rgba(30,64,175,0.55)",
            background: "#93c5fd",
            boxShadow: "0 8px 16px rgba(30,64,175,0.15)",
          }}
        />
        {text ? <LabelPill text={text} /> : null}
      </>
    );
  }

  if (kind === "circle") {
    return (
      <>
        <div
          style={{
            ...baseShapeStyle,
            width: 112,
            height: 112,
            borderRadius: "999px",
            border: "2px solid rgba(6,95,70,0.54)",
            background: "#86efac",
            boxShadow: "0 8px 16px rgba(6,95,70,0.16)",
          }}
        />
        {text ? <LabelPill text={text} /> : null}
      </>
    );
  }

  if (kind === "triangle") {
    return (
      <>
        <svg
          viewBox="0 0 180 140"
          width="100%"
          height="100%"
          style={{ position: "absolute", inset: 0, overflow: "visible" }}
        >
          <polygon
            points="90,16 156,124 24,124"
            fill="#c4b5fd"
            stroke="rgba(55,48,163,0.65)"
            strokeWidth="5"
            strokeLinejoin="round"
          />
        </svg>
        {text ? <LabelPill text={text} /> : null}
      </>
    );
  }

  if (kind === "star") {
    return (
      <>
        <svg
          viewBox="0 0 190 150"
          width="100%"
          height="100%"
          style={{ position: "absolute", inset: 0, overflow: "visible" }}
        >
          <polygon
            points="95,16 114,62 166,62 124,92 142,136 95,108 48,136 66,92 24,62 76,62"
            fill="#fde047"
            stroke="rgba(51,65,85,0.75)"
            strokeWidth="5"
            strokeLinejoin="round"
          />
        </svg>
        {text ? <LabelPill text={text} /> : null}
      </>
    );
  }

  return (
    <>
      <div
        style={{
          ...baseShapeStyle,
          width: 190,
          height: 4,
          borderRadius: 999,
          background: "#1d4ed8",
        }}
      />
      {text ? <LabelPill text={text} /> : null}
    </>
  );
}

function ShapeRow({ row }: { row: ShowcaseRow }) {
  const text = `${row.label} label`;

  if (isConnectorPreviewKind(row.kind)) {
    return (
      <RowFrame label={row.label}>
        <PreviewTile title="Without text">
          <ConnectorPreview variant={row.kind} text={null} />
        </PreviewTile>
        <PreviewTile title="With text">
          <ConnectorPreview variant={row.kind} text={text} />
        </PreviewTile>
      </RowFrame>
    );
  }

  return (
    <RowFrame label={row.label}>
      <PreviewTile title="Without text">
        <PrimitivePreview kind={row.kind} text={null} />
      </PreviewTile>
      <PreviewTile title="With text">
        <PrimitivePreview kind={row.kind} text={text} />
      </PreviewTile>
    </RowFrame>
  );
}

function ShapeLabelMatrix() {
  return (
    <div style={{ padding: 14, display: "grid", gap: 10 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          padding: "8px 10px",
          border: "1px solid rgba(148,163,184,0.3)",
          borderRadius: 10,
          background: "rgba(255,255,255,0.85)",
          color: "#334155",
          fontSize: 12,
        }}
      >
        <span>
          Inspect each row left-to-right to confirm shape/connector text rendering parity.
        </span>
        <strong style={{ color: "#0f172a" }}>9 object kinds covered</strong>
      </div>
      {SHAPE_ROWS.map((row) => (
        <ShapeRow key={row.kind} row={row} />
      ))}
    </div>
  );
}

const meta = {
  title: "Board/Shape Label Inspector",
  component: ShapeLabelMatrix,
  parameters: {
    layout: "fullscreen",
    docs: {
      description: {
        component:
          "Streamlined human inspection story: each supported shape and connector is shown with and without label text.",
      },
    },
  },
  decorators: [
    (Story) => (
      <StoryShell>
        <Story />
      </StoryShell>
    ),
  ],
} satisfies Meta<typeof ShapeLabelMatrix>;

export default meta;

type Story = StoryObj<typeof meta>;

export const WithAndWithoutText: Story = {};
