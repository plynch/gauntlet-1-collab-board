import type { BoardObjectKind } from "@/features/boards/types";

type ColorSwatch = {
  name: string;
  value: string;
};

const BOARD_COLOR_SWATCHES: ColorSwatch[] = [
  { name: "Yellow", value: "#fde68a" },
  { name: "Orange", value: "#fdba74" },
  { name: "Red", value: "#fca5a5" },
  { name: "Pink", value: "#f9a8d4" },
  { name: "Purple", value: "#c4b5fd" },
  { name: "Blue", value: "#93c5fd" },
  { name: "Teal", value: "#99f6e4" },
  { name: "Green", value: "#86efac" },
  { name: "Gray", value: "#d1d5db" },
  { name: "Tan", value: "#d2b48c" },
];

/**
 * Handles tool icon.
 */
export function ToolIcon({ kind }: { kind: BoardObjectKind }) {
  if (kind === "sticky") {
    return (
      <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
        <rect
          x="2"
          y="2"
          width="12"
          height="12"
          rx="1.8"
          fill="#fde68a"
          stroke="#b08928"
        />
        <rect
          x="3.2"
          y="3.2"
          width="9.6"
          height="2.2"
          rx="0.8"
          fill="#fcd34d"
        />
        <line
          x1="4.1"
          y1="7.2"
          x2="11.9"
          y2="7.2"
          stroke="#9a7b19"
          strokeWidth="0.9"
        />
        <line
          x1="4.1"
          y1="9.4"
          x2="10.4"
          y2="9.4"
          stroke="#9a7b19"
          strokeWidth="0.9"
        />
      </svg>
    );
  }

  if (kind === "text") {
    return (
      <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
        <path
          d="M2 3.2h12M8 3.2v9.6M4.8 12.8h6.4"
          stroke="#334155"
          strokeWidth="1.9"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
      </svg>
    );
  }

  if (kind === "rect") {
    return (
      <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
        <rect
          x="2"
          y="3"
          width="12"
          height="10"
          rx="0.5"
          fill="#93c5fd"
          stroke="#1d4ed8"
        />
      </svg>
    );
  }

  if (kind === "circle") {
    return (
      <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
        <circle cx="8" cy="8" r="5.5" fill="#86efac" stroke="#15803d" />
      </svg>
    );
  }

  if (kind === "gridContainer") {
    return (
      <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
        <rect
          x="2"
          y="2"
          width="12"
          height="12"
          rx="1.2"
          fill="#f8fafc"
          stroke="#475569"
        />
        <rect
          x="3.2"
          y="3.2"
          width="4.6"
          height="4.6"
          rx="0.6"
          fill="#d1fae5"
        />
        <rect
          x="8.2"
          y="3.2"
          width="4.6"
          height="4.6"
          rx="0.6"
          fill="#fee2e2"
        />
        <rect
          x="3.2"
          y="8.2"
          width="4.6"
          height="4.6"
          rx="0.6"
          fill="#dbeafe"
        />
        <rect
          x="8.2"
          y="8.2"
          width="4.6"
          height="4.6"
          rx="0.6"
          fill="#fef3c7"
        />
      </svg>
    );
  }

  if (kind === "connectorUndirected") {
    return (
      <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
        <line x1="3" y1="8" x2="13" y2="8" stroke="#334155" strokeWidth="2.2" />
        <circle
          cx="3"
          cy="8"
          r="1.6"
          fill="white"
          stroke="#334155"
          strokeWidth="1"
        />
        <circle
          cx="13"
          cy="8"
          r="1.6"
          fill="white"
          stroke="#334155"
          strokeWidth="1"
        />
      </svg>
    );
  }

  if (kind === "connectorArrow") {
    return (
      <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
        <line
          x1="2.8"
          y1="8"
          x2="12.3"
          y2="8"
          stroke="#1d4ed8"
          strokeWidth="2.2"
        />
        <polygon points="12.3,5.5 14.6,8 12.3,10.5" fill="#1d4ed8" />
        <circle
          cx="2.8"
          cy="8"
          r="1.3"
          fill="white"
          stroke="#1d4ed8"
          strokeWidth="1"
        />
      </svg>
    );
  }

  if (kind === "connectorBidirectional") {
    return (
      <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
        <line
          x1="3.6"
          y1="8"
          x2="12.4"
          y2="8"
          stroke="#0f766e"
          strokeWidth="2.2"
        />
        <polygon points="3.6,5.6 1.4,8 3.6,10.4" fill="#0f766e" />
        <polygon points="12.4,5.6 14.6,8 12.4,10.4" fill="#0f766e" />
      </svg>
    );
  }

  if (kind === "triangle") {
    return (
      <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
        <polygon
          points="8,2 14,13 2,13"
          fill="#c4b5fd"
          stroke="#6d28d9"
          strokeWidth="1.1"
        />
      </svg>
    );
  }

  if (kind === "star") {
    return (
      <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
        <polygon
          points="8,1.8 9.9,6.1 14.5,6.1 10.8,8.9 12.3,13.7 8,10.8 3.7,13.7 5.2,8.9 1.5,6.1 6.1,6.1"
          fill="#fcd34d"
          stroke="#92400e"
          strokeWidth="1.05"
        />
      </svg>
    );
  }

  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
      <line
        x1="2.5"
        y1="8"
        x2="13.5"
        y2="8"
        stroke="#1f2937"
        strokeWidth="2.5"
      />
    </svg>
  );
}

/**
 * Handles color swatch picker.
 */
export function ColorSwatchPicker({
  currentColor,
  onSelectColor,
}: {
  currentColor: string | null;
  onSelectColor: (nextColor: string) => void;
}) {
  const currentColorKey = currentColor ? currentColor.toLowerCase() : null;

  return (
    <div
      style={{
        display: "flex",
        flexWrap: "nowrap",
        gap: 6,
        alignItems: "center",
      }}
      onPointerDown={(event) => event.stopPropagation()}
    >
      {BOARD_COLOR_SWATCHES.map((swatch) => {
        const isSelected =
          currentColorKey !== null &&
          swatch.value.toLowerCase() === currentColorKey;

        return (
          <button
            key={swatch.value}
            type="button"
            onClick={() => onSelectColor(swatch.value)}
            title={swatch.name}
            aria-label={`Set color to ${swatch.name}`}
            style={{
              width: 18,
              height: 18,
              borderRadius: "50%",
              border: isSelected
                ? "2px solid var(--text)"
                : "1px solid var(--border)",
              boxSizing: "border-box",
              background: swatch.value,
              cursor: "pointer",
            }}
          />
        );
      })}
    </div>
  );
}

/**
 * Handles trash icon.
 */
export function TrashIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
      <path
        d="M3.5 4.5h9m-7.8 0 .4 8.2a1 1 0 0 0 1 .9h3a1 1 0 0 0 1-.9l.4-8.2m-4.9 0V3.2a.7.7 0 0 1 .7-.7h2.6a.7.7 0 0 1 .7.7v1.3"
        stroke="#7f1d1d"
        strokeWidth="1.35"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * Handles duplicate icon.
 */
export function DuplicateIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
      <rect
        x="5.3"
        y="2.4"
        width="8"
        height="8"
        rx="1.2"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
      />
      <rect
        x="2.7"
        y="5"
        width="8"
        height="8"
        rx="1.2"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
      />
    </svg>
  );
}

/**
 * Handles briefcase icon.
 */
export function BriefcaseIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
      <rect
        x="2"
        y="4.6"
        width="12"
        height="8.8"
        rx="1.5"
        fill="#e0e7ff"
        stroke="#3730a3"
      />
      <path
        d="M6 4V3.2c0-.4.3-.7.7-.7h2.6c.4 0 .7.3.7.7V4"
        stroke="#3730a3"
        strokeWidth="1.2"
        fill="none"
        strokeLinecap="round"
      />
      <path d="M2 8.2h12" stroke="#3730a3" strokeWidth="1.2" />
      <rect x="7.1" y="7.5" width="1.8" height="1.5" rx="0.4" fill="#3730a3" />
    </svg>
  );
}

/**
 * Handles clear text icon.
 */
export function ClearTextIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
      <path
        d="M3.2 3.2l9.6 9.6M12.8 3.2l-9.6 9.6"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}
