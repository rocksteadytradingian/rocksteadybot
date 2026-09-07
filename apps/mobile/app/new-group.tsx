import { GROUP_MEMBER_MAX, GROUP_MEMBER_MIN } from "@rakazo/contracts";
import { Stack, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, ScrollView, Text, TextInput } from "react-native";
import { BotAvatar } from "../components/bot-avatar";
import { type MobileBot, rpc } from "../lib/api";
import { useTheme } from "../lib/theme";

export default function NewGroup() {
  const router = useRouter();
  const [bots, setBots] = useState<MobileBot[]>([]);
  const [name, setName] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [defaultBotId, setDefaultBotId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const { palette } = useTheme();

  useEffect(() => {
    void rpc<MobileBot[]>("bots/list")
      .then((nextBots) => setBots(nextBots.filter((bot) => !bot.archivedAt)))
      .catch(() => undefined);
  }, []);

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

  async function create() {
    if (
      !name.trim() ||
      selected.length < GROUP_MEMBER_MIN ||
      selected.length > GROUP_MEMBER_MAX ||
      pending
    )
      return;
    setPending(true);
    setError(null);
    try {
      const group = await rpc<{ id: string; name: string }>("groups/create", {
        name: name.trim(),
        botIds: selected,
        ...(defaultBotId ? { defaultBotId } : {}),
      });
      router.replace({
        pathname: "/group-thread",
        params: { groupId: group.id, name: group.name },
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create group");
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <Stack.Screen options={{ title: "New group" }} />
      <ScrollView
        style={{ flex: 1, backgroundColor: palette.page }}
        contentContainerStyle={{ padding: 24 }}
      >
        <Text style={{ color: palette.muted, fontSize: 14 }}>Name</Text>
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder="Name this group"
          placeholderTextColor={palette.muted2}
          style={{
            marginTop: 8,
            backgroundColor: palette.surface2,
            borderRadius: 11,
            padding: 14,
            color: palette.ink,
            fontSize: 16,
          }}
        />
        <Text style={{ color: palette.muted, fontSize: 14, marginTop: 20 }}>
          Members ({GROUP_MEMBER_MIN}–{GROUP_MEMBER_MAX})
        </Text>
        {bots.map((bot) => {
          const checked = selected.includes(bot.id);
          return (
            <Pressable
              key={bot.id}
              onPress={() => toggle(bot.id)}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 12,
                paddingVertical: 12,
              }}
            >
              <BotAvatar color={bot.color} identity={bot.id} size={34} status={bot.status} />
              <Text style={{ flex: 1, color: palette.ink, fontSize: 16 }}>{bot.name}</Text>
              <Text style={{ color: palette.muted2 }}>{checked ? "✓" : ""}</Text>
            </Pressable>
          );
        })}
        <Text
          accessibilityLabel="Leader, the bot that responds first"
          style={{ color: palette.muted, fontSize: 14, marginTop: 20 }}
        >
          Leader
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ selected: !defaultBotId }}
          onPress={() => setDefaultBotId("")}
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 12,
            paddingVertical: 12,
          }}
        >
          <Text style={{ flex: 1, color: palette.ink, fontSize: 16 }}>First member</Text>
          <Text style={{ color: palette.muted2 }}>{defaultBotId ? "" : "✓"}</Text>
        </Pressable>
        {bots
          .filter((bot) => selected.includes(bot.id))
          .map((bot) => (
            <Pressable
              key={`leader-${bot.id}`}
              accessibilityRole="button"
              accessibilityState={{ selected: defaultBotId === bot.id }}
              onPress={() => setDefaultBotId(bot.id)}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 12,
                paddingVertical: 12,
              }}
            >
              <BotAvatar color={bot.color} size={34} status={bot.status} />
              <Text style={{ flex: 1, color: palette.ink, fontSize: 16 }}>{bot.name}</Text>
              <Text style={{ color: palette.muted2 }}>{defaultBotId === bot.id ? "✓" : ""}</Text>
            </Pressable>
          ))}
        {error ? <Text style={{ color: palette.danger, marginTop: 12 }}>{error}</Text> : null}
        <Pressable
          onPress={() => void create()}
          disabled={
            !name.trim() ||
            selected.length < GROUP_MEMBER_MIN ||
            selected.length > GROUP_MEMBER_MAX ||
            pending
          }
          style={{
            marginTop: 24,
            backgroundColor: palette.accent,
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
          <Text style={{ color: palette.accentInk, fontSize: 16, fontWeight: "600" }}>
            {pending ? "Creating…" : "Create group"}
          </Text>
        </Pressable>
      </ScrollView>
    </>
  );
}
