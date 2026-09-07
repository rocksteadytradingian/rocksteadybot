import type { Routine } from "@rakazo/contracts";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";
import { rpc } from "../lib/api";
import { useTheme } from "../lib/theme";

export default function RoutineDetail() {
  const { botId, botName, routineId } = useLocalSearchParams<{
    botId?: string;
    botName?: string;
    routineId?: string;
  }>();
  const router = useRouter();
  const [routine, setRoutine] = useState<Routine | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { palette } = useTheme();

  useEffect(() => {
    if (!botId || !routineId) {
      setError("Routine link is incomplete");
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    void rpc<Routine[]>("routines/list", { botId })
      .then((routines) => {
        if (cancelled) return;
        const match = routines.find((item) => item.id === routineId);
        if (match) setRoutine(match);
        else setError("This routine no longer exists");
      })
      .catch((loadError) => {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "Could not load routine");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [botId, routineId]);

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: palette.page }}
      contentContainerStyle={{ padding: 24, gap: 18 }}
    >
      <Stack.Screen options={{ title: routine?.name ?? "Routine" }} />
      {loading ? <ActivityIndicator color={palette.muted} /> : null}
      {error ? <Text style={{ color: palette.danger, fontSize: 15 }}>{error}</Text> : null}
      {routine ? (
        <>
          <View
            style={{
              borderRadius: 16,
              borderWidth: 1,
              borderColor: palette.hairline,
              backgroundColor: palette.surface,
              padding: 18,
              gap: 8,
            }}
          >
            <Text style={{ color: palette.ink, fontSize: 20, fontWeight: "600" }}>
              {routine.name}
            </Text>
            <Text style={{ color: routine.active ? palette.success : palette.muted, fontSize: 14 }}>
              {routine.active ? "Active" : "Paused"} · {routine.crons.join(", ")} ·{" "}
              {routine.timezone}
            </Text>
          </View>
          <View style={{ gap: 8 }}>
            <Text style={{ color: palette.muted, fontSize: 13, textTransform: "uppercase" }}>
              Prompt
            </Text>
            <Text
              selectable
              style={{
                color: palette.body,
                fontSize: 15,
                lineHeight: 23,
                borderRadius: 16,
                backgroundColor: palette.surface,
                padding: 18,
              }}
            >
              {routine.prompt}
            </Text>
          </View>
          <Pressable
            accessibilityRole="button"
            onPress={() =>
              router.push({
                pathname: "/thread",
                params: { botId: botId ?? "", name: botName ?? "Bot" },
              })
            }
            style={{
              alignItems: "center",
              borderRadius: 12,
              backgroundColor: palette.solid,
              padding: 14,
            }}
          >
            <Text style={{ color: palette.solidInk, fontSize: 15, fontWeight: "600" }}>
              Open conversation
            </Text>
          </Pressable>
        </>
      ) : null}
    </ScrollView>
  );
}
