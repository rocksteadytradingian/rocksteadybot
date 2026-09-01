import { useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { requestPasswordReset } from "../lib/api";

export default function ForgotPassword() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

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
    <SafeAreaView style={{ flex: 1, backgroundColor: "#F7F7F4" }}>
      <StatusBar style="dark" />
      <View style={{ flex: 1, justifyContent: "center", paddingHorizontal: 24 }}>
        <Text style={{ color: "#1B1B1E", fontSize: 32, fontWeight: "500", textAlign: "center" }}>
          Reset your password
        </Text>
        <TextInput
          autoCapitalize="none"
          keyboardType="email-address"
          placeholder="Email"
          placeholderTextColor="#8C8C86"
          value={email}
          onChangeText={setEmail}
          style={{
            marginTop: 28,
            backgroundColor: "#F1F1ED",
            borderRadius: 13,
            padding: 16,
            color: "#1B1B1E",
          }}
        />
        {error ? <Text style={{ color: "#C94244", marginTop: 12 }}>{error}</Text> : null}
        {notice ? <Text style={{ color: "#6E6E68", marginTop: 12 }}>{notice}</Text> : null}
        <Pressable
          onPress={() => void submit()}
          disabled={pending}
          style={{
            marginTop: 16,
            backgroundColor: "#121215",
            borderRadius: 13,
            padding: 18,
            alignItems: "center",
          }}
        >
          <Text style={{ color: "#FBFBF9", fontSize: 17 }}>
            {pending ? "Working…" : "Send reset link"}
          </Text>
        </Pressable>
        <Pressable onPress={() => router.back()} style={{ marginTop: 24, alignItems: "center" }}>
          <Text style={{ color: "#1B1B1E", fontSize: 16, fontWeight: "500" }}>Sign in</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}
