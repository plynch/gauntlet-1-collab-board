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

export function ColorSwatchPicker({
  currentColor,
  leadingSwatch,
  onSelectColor,
}: {
  currentColor: string | null;
  leadingSwatch?: ColorSwatch | null;
  onSelectColor: (nextColor: string) => void;
}) {
  const currentColorKey = currentColor ? currentColor.toLowerCase() : null;
  const swatches = leadingSwatch
    ? [
        leadingSwatch,
        ...BOARD_COLOR_SWATCHES.filter(
          (swatch) =>
            swatch.value.toLowerCase() !== leadingSwatch.value.toLowerCase(),
        ),
      ]
    : BOARD_COLOR_SWATCHES;

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
      {swatches.map((swatch) => {
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
