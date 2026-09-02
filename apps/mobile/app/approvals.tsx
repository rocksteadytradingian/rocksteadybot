import type { PendingApproval } from "@rakazo/contracts";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { NativeSymbol } from "../components/native-symbol";
import { rpc } from "../lib/api";
import { approvalThreadParams, fetchPendingApprovals, formatRequestedAt } from "../lib/approvals";
import { native } from "../lib/native";

export default function Approvals() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [items, setItems] = useState<PendingApproval[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setItems(await fetchPendingApprovals());
    } catch (err) {
      Alert.alert("Could not load approvals", err instanceof Error ? err.message : "Try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );

  async function approve(item: PendingApproval) {
    setBusyId(item.id);
    try {
      await rpc("threads/answer", {
        ...(item.groupId ? { groupId: item.groupId } : { botId: item.botId }),
        runId: item.runId,
        messageId: item.messageId,
        answer: "allow",
      });
      setItems((current) => current.filter((row) => row.id !== item.id));
    } catch (err) {
      Alert.alert("Could not approve", err instanceof Error ? err.message : "Try again.");
      await refresh();
    } finally {
      setBusyId(null);
    }
  }

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, 24) }}
    >
      {loading && items.length === 0 ? (
        <ActivityIndicator color={native.secondaryLabel} style={styles.spinner} />
      ) : items.length === 0 ? (
        <Text style={styles.empty}>Nothing waiting</Text>
      ) : (
        items.map((item) => {
          const requested = formatRequestedAt(item.requestedAt);
          return (
            <View key={item.id} style={styles.card}>
              <View style={styles.cardTop}>
                <NativeSymbol
                  ios="exclamationmark.triangle"
                  android="warning-outline"
                  size={16}
                  color="#F5A03C"
                />
                <View style={styles.cardBody}>
                  <Text style={styles.summary}>
                    {item.botName} · {item.summary}
                  </Text>
                  {item.highRisk ? <Text style={styles.risk}>High risk action</Text> : null}
                  {requested ? <Text style={styles.time}>Requested {requested}</Text> : null}
                </View>
              </View>
              <View style={styles.actions}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="View"
                  onPress={() => router.push(approvalThreadParams(item))}
                  style={({ pressed }) => [styles.viewButton, pressed && styles.pressed]}
                >
                  <Text style={styles.viewLabel}>View</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Approve"
                  disabled={busyId === item.id}
                  onPress={() => void approve(item)}
                  style={({ pressed }) => [styles.approveButton, pressed && styles.pressed]}
                >
                  <Text style={styles.approveLabel}>
                    {busyId === item.id ? "Sending…" : "Approve"}
                  </Text>
                </Pressable>
              </View>
            </View>
          );
        })
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#000",
  },
  spinner: {
    marginTop: 48,
  },
  empty: {
    color: native.secondaryLabel,
    fontSize: 16,
    paddingHorizontal: 20,
    paddingTop: 28,
  },
  card: {
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#2A2A2E",
    backgroundColor: "#141416",
    padding: 14,
    gap: 12,
  },
  cardTop: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  cardBody: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  summary: {
    color: native.label,
    fontSize: 16,
    fontWeight: "600",
  },
  risk: {
    alignSelf: "flex-start",
    overflow: "hidden",
    borderRadius: 999,
    backgroundColor: "rgba(245,160,60,0.16)",
    color: "#F5A03C",
    fontSize: 12,
    fontWeight: "600",
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  time: {
    color: native.secondaryLabel,
    fontSize: 13,
  },
  actions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 8,
  },
  viewButton: {
    borderRadius: 11,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#3A3A40",
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  viewLabel: {
    color: native.label,
    fontSize: 14,
  },
  approveButton: {
    borderRadius: 11,
    backgroundColor: "#F1F1EF",
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  approveLabel: {
    color: "#17171A",
    fontSize: 14,
    fontWeight: "600",
  },
  pressed: {
    opacity: 0.6,
  },
});
