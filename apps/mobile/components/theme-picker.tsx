import { Pressable, StyleSheet, Text, View } from "react-native";
import {
  type ThemedStyleArgs,
  UI_THEMES,
  type UiThemeId,
  useTheme,
  useThemedStyles,
} from "../lib/theme";

/**
 * Radio list of the shared colour themes, mirroring the web `UiThemePicker`.
 * Selecting one applies it immediately and persists it per-device.
 */
export function ThemePicker() {
  const { theme, setTheme } = useTheme();
  const styles = useThemedStyles(makeStyles);

  return (
    <View accessibilityRole="radiogroup" accessibilityLabel="Themes" style={styles.list}>
      {UI_THEMES.map((option) => {
        const selected = option.id === theme;
        return (
          <Pressable
            key={option.id}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            accessibilityLabel={option.label}
            onPress={() => setTheme(option.id as UiThemeId)}
            style={({ pressed }) => [styles.row, pressed && styles.pressed]}
          >
            <View style={[styles.swatch, { backgroundColor: option.swatch }]}>
              <View style={[styles.swatchAccent, { backgroundColor: option.accent }]} />
            </View>
            <Text style={styles.label}>{option.label}</Text>
            {selected ? (
              <Text accessibilityElementsHidden style={styles.check}>
                ✓
              </Text>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}

const makeStyles = ({ palette, radius }: ThemedStyleArgs) =>
  StyleSheet.create({
    list: {
      gap: 2,
    },
    row: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      paddingVertical: 10,
      paddingHorizontal: 4,
      borderRadius: radius,
    },
    pressed: {
      backgroundColor: palette.hover,
    },
    swatch: {
      width: 26,
      height: 26,
      borderRadius: 13,
      overflow: "hidden",
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: palette.hairlineStrong,
    },
    swatchAccent: {
      position: "absolute",
      top: 0,
      bottom: 0,
      right: 0,
      width: 13,
    },
    label: {
      flex: 1,
      color: palette.ink,
      fontSize: 15,
    },
    check: {
      color: palette.muted,
      fontSize: 13,
    },
  });
