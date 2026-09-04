import { Redirect, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  apiBaseWarning,
  currentApiBase,
  defaultApiBase,
  displayApiHost,
  loadSessionToken,
  normalizeApiBase,
  probeApiBase,
  resetApiBase,
  saveApiBase,
  signIn,
  usesCustomApiBase,
} from "../lib/api";
import { type ThemedStyleArgs, useTheme, useThemedStyles } from "../lib/theme";

export default function SignIn() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [ready, setReady] = useState(false);
  const [hasSession, setHasSession] = useState(false);
  const [apiBase, setApiBase] = useState(() => currentApiBase());
  const [serverOpen, setServerOpen] = useState(false);
  const { palette, colorScheme } = useTheme();
  const styles = useThemedStyles(makeStyles);

  useEffect(() => {
    void loadSessionToken().then((token) => {
      setHasSession(Boolean(token));
      setReady(true);
    });
  }, []);

  if (!ready) {
    return (
      <View style={styles.loading}>
        <Text style={styles.loadingLabel}>Loading…</Text>
      </View>
    );
  }
  if (hasSession) return <Redirect href="/" />;

  async function submit() {
    setPending(true);
    setError(null);
    try {
      await signIn(email.trim(), password);
      router.replace("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not sign in");
    } finally {
      setPending(false);
    }
  }

  const custom = usesCustomApiBase(apiBase);

  return (
    <SafeAreaView style={styles.screen}>
      <StatusBar style={colorScheme === "dark" ? "light" : "dark"} />
      <View style={styles.body}>
        <Text style={styles.title}>Sign in to RocksteadyBot</Text>
        <TextInput
          autoCapitalize="none"
          keyboardType="email-address"
          keyboardAppearance={colorScheme}
          placeholder="Email"
          placeholderTextColor={palette.muted2}
          value={email}
          onChangeText={setEmail}
          style={[styles.input, styles.inputFirst]}
        />
        <TextInput
          placeholder="Password"
          placeholderTextColor={palette.muted2}
          keyboardAppearance={colorScheme}
          secureTextEntry
          value={password}
          onChangeText={setPassword}
          style={styles.input}
        />
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <Pressable onPress={() => void submit()} disabled={pending} style={styles.primary}>
          <Text style={styles.primaryLabel}>{pending ? "Working…" : "Continue with email"}</Text>
        </Pressable>
        <Pressable
          accessibilityRole="link"
          accessibilityLabel="Forgot password"
          onPress={() => router.push("/forgot-password")}
          style={styles.link}
        >
          <Text style={styles.linkLabel}>Forgot password?</Text>
        </Pressable>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={
          custom ? `Custom server ${displayApiHost(apiBase)}` : "Use a custom server"
        }
        hitSlop={12}
        onPress={() => setServerOpen(true)}
        style={styles.serverButton}
      >
        {custom ? (
          <>
            <Text style={styles.serverCaption}>Custom server</Text>
            <Text style={styles.serverHost}>{displayApiHost(apiBase)}</Text>
          </>
        ) : (
          <Text style={styles.serverHint}>Use a custom server</Text>
        )}
      </Pressable>
      <ServerSheet
        visible={serverOpen}
        current={apiBase}
        onClose={() => setServerOpen(false)}
        onSaved={(url) => {
          setApiBase(url);
          setServerOpen(false);
        }}
      />
    </SafeAreaView>
  );
}

function ServerSheet({
  visible,
  current,
  onClose,
  onSaved,
}: {
  visible: boolean;
  current: string;
  onClose: () => void;
  onSaved: (url: string) => void;
}) {
  const [draft, setDraft] = useState(current);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const { palette, colorScheme } = useTheme();
  const styles = useThemedStyles(makeStyles);

  useEffect(() => {
    if (!visible) return;
    setDraft(current);
    setError(null);
    setPending(false);
  }, [visible, current]);

  const parsedDraft = normalizeApiBase(draft);
  const warning = parsedDraft.ok ? apiBaseWarning(parsedDraft.url) : null;

  async function save() {
    setPending(true);
    setError(null);
    try {
      const probed = await probeApiBase(draft);
      if (!probed.ok) {
        setError(probed.error);
        return;
      }
      const saved = await saveApiBase(probed.url);
      if (!saved.ok) {
        setError(saved.error);
        return;
      }
      onSaved(saved.url);
    } finally {
      setPending(false);
    }
  }

  async function restoreDefault() {
    setPending(true);
    setError(null);
    try {
      const saved = await resetApiBase();
      if (!saved.ok) {
        setError(saved.error);
        return;
      }
      onSaved(saved.url);
    } finally {
      setPending(false);
    }
  }

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        style={styles.screen}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <SafeAreaView style={styles.sheet}>
          <View style={styles.sheetHeader}>
            <Pressable onPress={onClose} hitSlop={8}>
              <Text style={styles.sheetCancel}>Cancel</Text>
            </Pressable>
            <Text style={styles.sheetTitle}>Server</Text>
            <Pressable onPress={() => void save()} disabled={pending} hitSlop={8}>
              <Text style={styles.sheetTitle}>{pending ? "Checking…" : "Save"}</Text>
            </Pressable>
          </View>
          <Text style={styles.sheetBody}>
            Point this app at your self-hosted RocksteadyBot origin — the same HTTPS URL you open in
            a browser.
          </Text>
          <TextInput
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="off"
            keyboardType="url"
            keyboardAppearance={colorScheme}
            textContentType="URL"
            returnKeyType="go"
            onSubmitEditing={() => void save()}
            placeholder={defaultApiBase()}
            placeholderTextColor={palette.muted2}
            value={draft}
            onChangeText={(value) => {
              setDraft(value);
              setError(null);
            }}
            style={[styles.input, styles.sheetInput]}
          />
          {warning ? <Text style={styles.warning}>{warning}</Text> : null}
          {error ? <Text style={styles.error}>{error}</Text> : null}
          {usesCustomApiBase(current) || draft.trim() !== current ? (
            <Pressable
              onPress={() => void restoreDefault()}
              disabled={pending}
              style={styles.resetButton}
            >
              <Text style={styles.sheetCancel}>Use default server</Text>
            </Pressable>
          ) : null}
        </SafeAreaView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const makeStyles = ({ palette }: ThemedStyleArgs) =>
  StyleSheet.create({
    screen: {
      flex: 1,
      backgroundColor: palette.page,
    },
    loading: {
      flex: 1,
      backgroundColor: palette.page,
      justifyContent: "center",
      padding: 24,
    },
    loadingLabel: {
      color: palette.muted,
      textAlign: "center",
    },
    body: {
      flex: 1,
      justifyContent: "center",
      paddingHorizontal: 24,
    },
    title: {
      color: palette.ink,
      fontSize: 32,
      fontWeight: "500",
      textAlign: "center",
    },
    input: {
      marginTop: 12,
      backgroundColor: palette.input,
      borderRadius: 13,
      padding: 16,
      color: palette.ink,
    },
    inputFirst: {
      marginTop: 28,
    },
    error: {
      color: palette.danger,
      marginTop: 12,
    },
    warning: {
      color: palette.muted2,
      marginTop: 12,
      fontSize: 13,
    },
    primary: {
      marginTop: 16,
      backgroundColor: palette.solid,
      borderRadius: 13,
      padding: 18,
      alignItems: "center",
    },
    primaryLabel: {
      color: palette.solidInk,
      fontSize: 17,
    },
    link: {
      marginTop: 16,
      alignItems: "center",
    },
    linkLabel: {
      color: palette.ink,
      fontSize: 16,
      fontWeight: "500",
    },
    serverButton: {
      alignItems: "center",
      paddingHorizontal: 24,
      paddingBottom: 12,
      paddingTop: 8,
    },
    serverCaption: {
      color: palette.muted2,
      fontSize: 12,
    },
    serverHost: {
      color: palette.muted,
      fontSize: 13,
      marginTop: 2,
    },
    serverHint: {
      color: palette.muted2,
      fontSize: 13,
    },
    sheet: {
      flex: 1,
      paddingHorizontal: 24,
      paddingTop: 12,
    },
    sheetHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    sheetCancel: {
      color: palette.muted,
      fontSize: 17,
    },
    sheetTitle: {
      color: palette.ink,
      fontSize: 17,
      fontWeight: "600",
    },
    sheetBody: {
      color: palette.muted,
      marginTop: 28,
      fontSize: 15,
      lineHeight: 22,
    },
    sheetInput: {
      marginTop: 20,
      fontSize: 16,
    },
    resetButton: {
      marginTop: 28,
      alignItems: "center",
    },
  });
