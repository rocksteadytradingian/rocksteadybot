import { GROUP_MEMBER_MAX, GROUP_MEMBER_MIN } from "@rakazo/contracts";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Alert, Pressable, ScrollView, Text, TextInput } from "react-native";
import { BotAvatar } from "../components/bot-avatar";
import { type MobileBot, type MobileGroup, rpc } from "../lib/api";

export default function GroupSettingsScreen() {
  const router = useRouter();
  const { groupId } = useLocalSearchParams<{ groupId: string }>();
  const [group, setGroup] = useState<MobileGroup | null>(null);
  const [bots, setBots] = useState<MobileBot[]>([]);
  const [name, setName] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [defaultBotId, setDefaultBotId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (!groupId) return;
    void Promise.all([
      rpc<MobileGroup[]>("groups/list").then(
        (groups) => groups.find((row) => row.id === groupId) ?? null,
      ),
      rpc<MobileBot[]>("bots/list"),
    ])
      .then(([nextGroup, nextBots]) => {
        if (!nextGroup) throw new Error("Group not found");
        setGroup(nextGroup);
        setName(nextGroup.name);
        setSelected(nextGroup.members.map((member) => member.botId));
        setDefaultBotId(nextGroup.defaultBotId ?? "");
        setBots(nextBots.filter((bot) => !bot.archivedAt));
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load group"));
  }, [groupId]);

  function toggle(botId: string) {
    setSelected((current) => {
      const next = current.includes(botId)
        ? current.filter((id) => id !== botId)
        : current.length >= GROUP_MEMBER_MAX
          ? current
          : [...current, botId];
      if (defaultBotId && !next.includes(defaultBotId)) setDefaultBotId("");
      return next;
    });
  }

  async function save() {
    if (!groupId || !group || pending) return;
    setPending(true);
    setError(null);
    try {
      const nextDefault = selected.includes(defaultBotId) ? defaultBotId || null : null;
      const input: {
        groupId: string;
        name?: string;
        botIds?: string[];
        defaultBotId?: string | null;
      } = { groupId, defaultBotId: nextDefault };
      if (name.trim() !== group.name) input.name = name.trim();
      const memberIds = group.members.map((member) => member.botId).join(",");
      if (selected.join(",") !== memberIds) input.botIds = selected;
      await rpc("groups/update", input);
      router.back();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save group");
    } finally {
      setPending(false);
    }
  }

  function remove() {
    if (!groupId || !group) return;
    Alert.alert(group.name, "Delete this group? Bots and their solo threads are kept.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () =>
          void rpc("groups/remove", { groupId })
            .then(() => router.replace("/"))
            .catch((err) =>
              Alert.alert(
                "Could not delete group",
                err instanceof Error ? err.message : "Try again.",
              ),
            ),
      },
    ]);
  }

  return (
    <>
      <Stack.Screen options={{ title: "Group settings" }} />
      <ScrollView
        style={{ flex: 1, backgroundColor: "#050506" }}
        contentContainerStyle={{ padding: 24 }}
      >
        <Text style={{ color: "#85858A", fontSize: 14 }}>Name</Text>
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder="Group name"
          placeholderTextColor="#6C6C70"
          style={{
            marginTop: 8,
            backgroundColor: "#1A1A1D",
            borderRadius: 11,
            padding: 14,
            color: "#ECECEE",
            fontSize: 16,
          }}
        />
        <Text style={{ color: "#85858A", fontSize: 14, marginTop: 20 }}>
          Members ({GROUP_MEMBER_MIN}–{GROUP_MEMBER_MAX})
        </Text>
        {bots.map((bot) => {
          const checked = selected.includes(bot.id);
          return (
            <Pressable
              key={bot.id}
              onPress={() => toggle(bot.id)}
              style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12 }}
            >
              <BotAvatar color={bot.color} size={34} status={bot.status} />
              <Text style={{ flex: 1, color: "#ECECEE", fontSize: 16 }}>{bot.name}</Text>
              <Text style={{ color: "#6C6C70" }}>{checked ? "✓" : ""}</Text>
            </Pressable>
          );
        })}
        <Text
          accessibilityLabel="Leader, the bot that responds first"
          style={{ color: "#85858A", fontSize: 14, marginTop: 20 }}
        >
          Leader
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ selected: !defaultBotId }}
          onPress={() => setDefaultBotId("")}
          style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12 }}
        >
          <Text style={{ flex: 1, color: "#ECECEE", fontSize: 16 }}>First member</Text>
          <Text style={{ color: "#6C6C70" }}>{defaultBotId ? "" : "✓"}</Text>
        </Pressable>
        {bots
          .filter((bot) => selected.includes(bot.id))
          .map((bot) => (
            <Pressable
              key={`leader-${bot.id}`}
              accessibilityRole="button"
              accessibilityState={{ selected: defaultBotId === bot.id }}
              onPress={() => setDefaultBotId(bot.id)}
              style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12 }}
            >
              <BotAvatar color={bot.color} size={34} status={bot.status} />
              <Text style={{ flex: 1, color: "#ECECEE", fontSize: 16 }}>{bot.name}</Text>
              <Text style={{ color: "#6C6C70" }}>{defaultBotId === bot.id ? "✓" : ""}</Text>
            </Pressable>
          ))}
        {error ? <Text style={{ color: "#FF6B6B", marginTop: 12 }}>{error}</Text> : null}
        <Pressable
          onPress={() => void save()}
          disabled={
            !name.trim() ||
            selected.length < GROUP_MEMBER_MIN ||
            selected.length > GROUP_MEMBER_MAX ||
            pending
          }
          style={{
            marginTop: 24,
            backgroundColor: "#8B5CF6",
            opacity:
              !name.trim() ||
              selected.length < GROUP_MEMBER_MIN ||
              selected.length > GROUP_MEMBER_MAX ||
              pending
                ? 0.5
                : 1,
            borderRadius: 11,
            padding: 14,
            alignItems: "center",
          }}
        >
          <Text style={{ color: "#FFF", fontSize: 16, fontWeight: "600" }}>
            {pending ? "Saving…" : "Save"}
          </Text>
        </Pressable>
        <Pressable
          onPress={remove}
          style={{
            marginTop: 16,
            borderRadius: 11,
            borderWidth: 1,
            borderColor: "#3A2020",
            padding: 14,
            alignItems: "center",
          }}
        >
          <Text style={{ color: "#FF6B6B", fontSize: 16 }}>Delete group</Text>
        </Pressable>
      </ScrollView>
    </>
  );
}
