import type { BoardEditorProfile } from "@/features/boards/types";

type BoardSettingsAccessSectionProps = {
  title: string;
  openLabel: string;
  openValue: boolean;
  openDescription: string;
  savingAccess: boolean;
  inputPlaceholder: string;
  inputValue: string;
  addLabel: string;
  emptyLabel: string;
  profiles: BoardEditorProfile[];
  onToggleOpen: (value: boolean) => void;
  onInputChange: (value: string) => void;
  onAdd: () => void;
  onRemove: (uid: string) => void;
};

function getProfileLabel(profile: BoardEditorProfile): string {
  return profile.email ?? profile.displayName ?? profile.uid;
}

export function BoardSettingsAccessSection({
  title,
  openLabel,
  openValue,
  openDescription,
  savingAccess,
  inputPlaceholder,
  inputValue,
  addLabel,
  emptyLabel,
  profiles,
  onToggleOpen,
  onInputChange,
  onAdd,
  onRemove,
}: BoardSettingsAccessSectionProps) {
  return (
    <section style={sectionStyle}>
      <h2 style={{ marginTop: 0 }}>{title}</h2>
      <label style={checkboxLabelStyle}>
        <input
          type="checkbox"
          checked={openValue}
          onChange={(event) => onToggleOpen(event.target.checked)}
          disabled={savingAccess}
        />
        {openLabel}
      </label>

      <p style={{ color: "var(--text-muted)" }}>{openDescription}</p>

      <div style={inputRowStyle}>
        <input
          placeholder={inputPlaceholder}
          value={inputValue}
          onChange={(event) => onInputChange(event.target.value)}
          style={inputStyle}
        />
        <button
          type="button"
          onClick={onAdd}
          disabled={savingAccess || inputValue.trim().length === 0}
        >
          {addLabel}
        </button>
      </div>

      <ul style={listStyle}>
        {profiles.map((profile) => (
          <li key={profile.uid} style={listItemStyle}>
            <span>{getProfileLabel(profile)}</span>
            <button
              type="button"
              onClick={() => onRemove(profile.uid)}
              disabled={savingAccess}
            >
              Remove
            </button>
          </li>
        ))}
        {profiles.length === 0 ? (
          <li style={{ color: "var(--text-muted)" }}>{emptyLabel}</li>
        ) : null}
      </ul>
    </section>
  );
}

const sectionStyle = {
  border: "1px solid var(--border)",
  borderRadius: 10,
  padding: "1rem",
  background: "var(--surface)",
} as const;

const checkboxLabelStyle = {
  display: "inline-flex",
  alignItems: "center",
  gap: "0.5rem",
} as const;

const inputRowStyle = { display: "flex", gap: "0.5rem", flexWrap: "wrap" } as const;
const inputStyle = { minWidth: 260, flex: "1 1 260px", padding: "0.5rem" } as const;

const listStyle = {
  listStyle: "none",
  margin: "0.75rem 0 0",
  padding: 0,
  display: "grid",
  gap: "0.5rem",
} as const;

const listItemStyle = {
  border: "1px solid var(--border)",
  borderRadius: 8,
  padding: "0.5rem",
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: "0.75rem",
  flexWrap: "wrap",
  background: "var(--surface)",
} as const;
