import type { ComputerMode } from "@rakazo/contracts";
import { Pressable, Text, View } from "react-native";
import { useTheme } from "../lib/theme";

export function ComputerModePicker({
  value,
  onChange,
  disabled = false,
}: {
  value: ComputerMode | undefined;
  onChange: (mode: ComputerMode) => void;
  disabled?: boolean;
}) {
  const { palette } = useTheme();
  return (
    <View style={{ marginTop: 16 }}>
      <Text style={{ color: palette.muted, marginBottom: 8, fontSize: 14 }}>Computer</Text>
      <View style={{ flexDirection: "row", gap: 8 }}>
        {(["team", "dedicated"] as const).map((mode) => (
          <Pressable
            key={mode}
            accessibilityRole="button"
            accessibilityState={{ selected: value === mode }}
            disabled={disabled}
            onPress={() => onChange(mode)}
            style={{
              flex: 1,
              alignItems: "center",
              borderWidth: 1,
              borderColor: value === mode ? palette.hairlineStrong : palette.hairline,
              backgroundColor: value === mode ? palette.surface2 : "transparent",
              borderRadius: 11,
              paddingVertical: 12,
              opacity: disabled ? 0.5 : 1,
            }}
          >
            <Text style={{ color: value === mode ? palette.ink : palette.muted }}>
              {mode === "team" ? "Team" : "Private"}
            </Text>
          </Pressable>
        ))}
      </View>
      <Text
        accessibilityRole="text"
        style={{ color: palette.muted2, fontSize: 13.5, lineHeight: 20, marginTop: 8 }}
      >
        {value === "dedicated"
          ? "Only this bot uses this computer."
          : "Shared with other bots. Switch to Private for this bot’s own computer."}
      </Text>
    </View>
  );
}
