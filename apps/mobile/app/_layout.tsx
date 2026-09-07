import { ChatMarkdownThemeProvider } from "@rakazo/chat-ui/native";
import {
  DefaultTheme,
  type Theme as NavTheme,
  ThemeProvider as NavThemeProvider,
  Stack,
} from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect, useMemo, useState } from "react";
import { View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { AvatarStyleProvider } from "../components/avatar-style";
import { loadApiBase } from "../lib/api";
import { loadUiTheme, type RkPalette, ThemeProvider, type UiThemeId, useTheme } from "../lib/theme";
import { applyMobileUiDirection } from "../lib/ui-direction";

applyMobileUiDirection();

function navThemeFor(palette: RkPalette): NavTheme {
  return {
    ...DefaultTheme,
    dark: palette.colorScheme === "dark",
    colors: {
      ...DefaultTheme.colors,
      primary: palette.accent,
      background: palette.page,
      card: palette.panel,
      text: palette.ink,
      border: palette.hairline,
      notification: palette.accent,
    },
  };
}

function ThemedStack() {
  const { palette, colorScheme } = useTheme();
  const navTheme = useMemo(() => navThemeFor(palette), [palette]);

  return (
    <NavThemeProvider value={navTheme}>
      <StatusBar style={colorScheme === "dark" ? "light" : "dark"} />
      <ChatMarkdownThemeProvider palette={palette}>
        <Stack
          screenOptions={{
            headerStyle: { backgroundColor: palette.panel },
            headerTintColor: palette.ink,
            headerShadowVisible: false,
            headerBackButtonDisplayMode: "minimal",
            contentStyle: { backgroundColor: palette.page },
          }}
        >
          <Stack.Screen name="index" options={{ headerShown: false, title: "RocksteadyBot" }} />
          <Stack.Screen name="sign-in" options={{ headerShown: false }} />
          <Stack.Screen name="forgot-password" options={{ headerShown: false }} />
          <Stack.Screen name="account" options={{ title: "Account" }} />
          <Stack.Screen name="models" options={{ title: "Models" }} />
          <Stack.Screen name="voice" options={{ title: "Voice" }} />
          <Stack.Screen name="integrations" options={{ title: "Plugins" }} />
          <Stack.Screen
            name="new"
            options={{
              title: "New bot",
              presentation: "modal",
              gestureEnabled: true,
              headerBackVisible: false,
            }}
          />
          <Stack.Screen
            name="new-group"
            options={{
              title: "New group",
              presentation: "modal",
              gestureEnabled: true,
            }}
          />
          <Stack.Screen name="group-thread" options={{ title: "Group" }} />
          <Stack.Screen name="group-settings" options={{ title: "Group settings" }} />
          <Stack.Screen name="bot-settings" options={{ title: "Chat settings" }} />
          <Stack.Screen name="thread" options={{ title: "Thread" }} />
          <Stack.Screen name="routine" options={{ title: "Routine" }} />
          <Stack.Screen name="computer" options={{ title: "Computer" }} />
          <Stack.Screen name="approvals" options={{ title: "Approvals" }} />
        </Stack>
      </ChatMarkdownThemeProvider>
    </NavThemeProvider>
  );
}

export default function Layout() {
  const [ready, setReady] = useState(false);
  const [initialTheme, setInitialTheme] = useState<UiThemeId>();

  useEffect(() => {
    void Promise.all([loadApiBase(), loadUiTheme()])
      .then(([, theme]) => setInitialTheme(theme))
      .finally(() => setReady(true));
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      {ready ? (
        <ThemeProvider initialTheme={initialTheme}>
          <AvatarStyleProvider>
            <ThemedStack />
          </AvatarStyleProvider>
        </ThemeProvider>
      ) : (
        <View style={{ flex: 1, backgroundColor: "#050506" }} />
      )}
    </GestureHandlerRootView>
  );
}
