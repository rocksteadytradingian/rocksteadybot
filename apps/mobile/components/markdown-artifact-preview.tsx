import { ChatMarkdown } from "@rakazo/chat-ui/native";
import { useEffect, useState } from "react";
import { Alert, Modal, Pressable, SafeAreaView, ScrollView, Text, View } from "react-native";
import {
  type MobileArtifactTarget,
  openMobileArtifact,
  readMobileArtifactText,
} from "../lib/artifact-open";
import { useTheme } from "../lib/theme";
import { NativeSymbol } from "./native-symbol";

export type MarkdownArtifactPreviewTarget = {
  artifactId: string;
  name: string;
  mimeType: string;
};

export function MarkdownArtifactPreview({
  threadTarget,
  target,
  onClose,
}: {
  threadTarget: MobileArtifactTarget;
  target: MarkdownArtifactPreviewTarget;
  onClose: () => void;
}) {
  const [state, setState] = useState<
    | { status: "loading" }
    | { status: "ready"; markdown: string }
    | { status: "error"; message: string }
  >({ status: "loading" });
  const { palette } = useTheme();
  const targetBotId = "botId" in threadTarget ? threadTarget.botId : undefined;
  const targetGroupId = "groupId" in threadTarget ? threadTarget.groupId : undefined;

  useEffect(() => {
    let cancelled = false;
    const requestTarget: MobileArtifactTarget =
      targetBotId !== undefined ? { botId: targetBotId } : { groupId: targetGroupId! };
    void readMobileArtifactText(requestTarget, target.artifactId, target.mimeType)
      .then((markdown) => {
        if (!cancelled) setState({ status: "ready", markdown });
      })
      .catch((error) => {
        if (cancelled) return;
        setState({
          status: "error",
          message: error instanceof Error ? error.message : "Could not load this file.",
        });
      });
    return () => {
      cancelled = true;
    };
  }, [targetBotId, targetGroupId, target.artifactId, target.mimeType]);

  return (
    <Modal animationType="fade" presentationStyle="fullScreen" onRequestClose={onClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: palette.page }}>
        <View
          style={{
            height: 54,
            flexDirection: "row",
            alignItems: "center",
            borderBottomWidth: 1,
            borderBottomColor: palette.hairline,
            paddingHorizontal: 12,
          }}
        >
          <Text
            numberOfLines={1}
            style={{ flex: 1, color: palette.ink, fontSize: 15, fontWeight: "500" }}
          >
            {target.name}
          </Text>
          <Pressable
            accessibilityLabel={`Share ${target.name}`}
            hitSlop={8}
            onPress={() =>
              void openMobileArtifact(
                threadTarget,
                target.artifactId,
                target.name,
                target.mimeType,
              ).catch((error) =>
                Alert.alert(
                  "Could not share file",
                  error instanceof Error ? error.message : "Try again.",
                ),
              )
            }
            style={{ padding: 10 }}
          >
            <NativeSymbol
              ios="square.and.arrow.up"
              android="share-social-outline"
              size={19}
              color={palette.muted}
            />
          </Pressable>
          <Pressable
            accessibilityLabel="Close preview"
            hitSlop={8}
            onPress={onClose}
            style={{ padding: 10 }}
          >
            <NativeSymbol ios="xmark" android="close" size={19} color={palette.muted} />
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={{ paddingHorizontal: 24, paddingVertical: 28 }}>
          {state.status === "loading" ? (
            <Text style={{ color: palette.muted, fontSize: 15 }}>Loading preview…</Text>
          ) : state.status === "error" ? (
            <View
              style={{
                borderRadius: 14,
                borderWidth: 1,
                borderColor: palette.danger,
                backgroundColor: palette.surface2,
                padding: 14,
              }}
            >
              <Text style={{ color: palette.danger, fontSize: 15 }}>{state.message}</Text>
            </View>
          ) : (
            <ChatMarkdown>{state.markdown}</ChatMarkdown>
          )}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}
