import type { Workspace } from "@rakazo/contracts";
import { useState } from "react";
import {
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { native } from "../lib/native";
import { NativeSymbol } from "./native-symbol";

export function WorkspacePickerModal({
  workspaces,
  workspaceId,
  busy,
  onClose,
  onSwitch,
  onCreate,
  onRename,
  onDelete,
}: {
  workspaces: Workspace[];
  workspaceId: string;
  busy?: boolean;
  onClose: () => void;
  onSwitch: (workspaceId: string) => Promise<void>;
  onCreate: (name: string) => Promise<void>;
  onRename: (workspaceId: string, name: string) => Promise<void>;
  onDelete: (workspaceId: string) => Promise<void>;
}) {
  const current = workspaces.find((workspace) => workspace.id === workspaceId);
  const [draft, setDraft] = useState<"create" | "rename" | null>(null);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function save(request: () => Promise<void>) {
    if (saving || busy) return;
    setSaving(true);
    setError(null);
    try {
      await request();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update workspace");
      setSaving(false);
    }
  }

  return (
    <Modal transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Pressable
          accessibilityLabel="Close workspaces"
          style={StyleSheet.absoluteFill}
          onPress={onClose}
        />
        <View style={styles.sheet}>
          <Text style={styles.title}>Workspace</Text>
          <ScrollView keyboardShouldPersistTaps="handled">
            {workspaces.map((workspace) => (
              <Pressable
                key={workspace.id}
                disabled={saving || workspace.id === workspaceId}
                onPress={() => void save(() => onSwitch(workspace.id))}
                style={({ pressed }) => [styles.action, pressed && styles.pressed]}
              >
                <Text style={styles.actionLabel}>{workspace.name}</Text>
                {workspace.id === workspaceId ? (
                  <NativeSymbol ios="checkmark" android="checkmark" size={16} />
                ) : null}
              </Pressable>
            ))}
          </ScrollView>
          {draft ? (
            <View style={styles.newRow}>
              <TextInput
                autoFocus
                value={name}
                onChangeText={setName}
                maxLength={80}
                placeholder={draft === "rename" ? "Workspace name" : "New workspace"}
                placeholderTextColor={native.secondaryLabel}
                style={styles.input}
              />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={draft === "rename" ? "Save workspace name" : "Create workspace"}
                disabled={saving || !name.trim()}
                onPress={() =>
                  void save(() =>
                    draft === "rename" && current
                      ? onRename(current.id, name.trim())
                      : onCreate(name.trim()),
                  )
                }
                style={({ pressed }) => [styles.smallAction, pressed && styles.pressed]}
              >
                <Text style={styles.smallActionLabel}>Save</Text>
              </Pressable>
            </View>
          ) : (
            <>
              <Pressable
                disabled={saving}
                onPress={() => {
                  setDraft("create");
                  setName("");
                }}
                style={({ pressed }) => [styles.action, pressed && styles.pressed]}
              >
                <Text style={styles.actionLabel}>New workspace</Text>
              </Pressable>
              {current ? (
                <Pressable
                  disabled={saving}
                  onPress={() => {
                    setDraft("rename");
                    setName(current.name);
                  }}
                  style={({ pressed }) => [styles.action, pressed && styles.pressed]}
                >
                  <Text style={styles.actionLabel}>Rename</Text>
                </Pressable>
              ) : null}
              {workspaces.length > 1 && current ? (
                <Pressable
                  disabled={saving}
                  onPress={() => {
                    Alert.alert("Delete workspace?", `Delete ${current.name} and its bots?`, [
                      { text: "Cancel", style: "cancel" },
                      {
                        text: "Delete",
                        style: "destructive",
                        onPress: () => void save(() => onDelete(current.id)),
                      },
                    ]);
                  }}
                  style={({ pressed }) => [styles.action, pressed && styles.pressed]}
                >
                  <Text style={[styles.actionLabel, styles.danger]}>Delete workspace</Text>
                </Pressable>
              ) : null}
            </>
          )}
          {error ? <Text style={styles.error}>{error}</Text> : null}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.45)",
  },
  sheet: {
    margin: 12,
    borderRadius: 18,
    backgroundColor: "#1C1C1E",
    paddingHorizontal: 8,
    paddingTop: 16,
    paddingBottom: 12,
    maxHeight: "80%",
  },
  title: {
    color: native.label,
    fontSize: 13,
    fontWeight: "600",
    paddingHorizontal: 12,
    paddingBottom: 8,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  action: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    gap: 12,
  },
  pressed: {
    opacity: 0.55,
  },
  actionLabel: {
    color: native.label,
    fontSize: 17,
    flex: 1,
  },
  danger: {
    color: "#E24B4A",
  },
  newRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 8,
    paddingVertical: 8,
  },
  input: {
    flex: 1,
    height: 40,
    borderRadius: 10,
    backgroundColor: native.fill,
    color: native.label,
    paddingHorizontal: 12,
    fontSize: 16,
  },
  smallAction: {
    height: 40,
    justifyContent: "center",
    paddingHorizontal: 12,
  },
  smallActionLabel: {
    color: native.label,
    fontSize: 16,
    fontWeight: "600",
  },
  error: {
    color: "#E24B4A",
    paddingHorizontal: 12,
    paddingTop: 4,
    paddingBottom: 8,
  },
});
