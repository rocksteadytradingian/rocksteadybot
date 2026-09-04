import { useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { requestPasswordReset } from "../lib/api";
import { type ThemedStyleArgs, useTheme, useThemedStyles } from "../lib/theme";

export default function ForgotPassword() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const { palette, colorScheme } = useTheme();
  const styles = useThemedStyles(makeStyles);

  async function submit() {
    setPending(true);
    setError(null);
    setNotice(null);
    try {
      await requestPasswordReset(email.trim());
      setNotice("If that account exists, a reset link was sent.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not request a reset");
    } finally {
      setPending(false);
    }
  }

  return (
    <SafeAreaView style={styles.screen}>
      <StatusBar style={colorScheme === "dark" ? "light" : "dark"} />
      <View style={styles.body}>
        <Text style={styles.title}>Reset your password</Text>
        <TextInput
          autoCapitalize="none"
          keyboardType="email-address"
          keyboardAppearance={colorScheme}
          placeholder="Email"
          placeholderTextColor={palette.muted2}
          value={email}
          onChangeText={setEmail}
          style={styles.input}
        />
        {error ? <Text style={styles.error}>{error}</Text> : null}
        {notice ? <Text style={styles.notice}>{notice}</Text> : null}
        <Pressable onPress={() => void submit()} disabled={pending} style={styles.primary}>
          <Text style={styles.primaryLabel}>{pending ? "Working…" : "Send reset link"}</Text>
        </Pressable>
        <Pressable onPress={() => router.back()} style={styles.link}>
          <Text style={styles.linkLabel}>Sign in</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const makeStyles = ({ palette }: ThemedStyleArgs) =>
  StyleSheet.create({
    screen: {
      flex: 1,
      backgroundColor: palette.page,
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
      marginTop: 28,
      backgroundColor: palette.input,
      borderRadius: 13,
      padding: 16,
      color: palette.ink,
    },
    error: {
      color: palette.danger,
      marginTop: 12,
    },
    notice: {
      color: palette.muted,
      marginTop: 12,
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
      marginTop: 24,
      alignItems: "center",
    },
    linkLabel: {
      color: palette.ink,
      fontSize: 16,
      fontWeight: "500",
    },
  });
