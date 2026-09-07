import { DEFAULT_UI_THEME, RK_PALETTES, type RkPalette } from "@rakazo/ui-tokens";
import Markdown, {
  MarkdownStream,
  type RenderRules,
} from "@ronradtke/react-native-markdown-display";
import { createContext, memo, type ReactNode, useContext, useMemo } from "react";
import { Linking, StyleSheet, Text, View } from "react-native";
import type { ChatMarkdownProps } from "./markdown";
import { sanitizeMarkdownUrl } from "./markdown";

/**
 * The palette every {@link ChatMarkdown} below the provider paints itself with.
 * Mobile mounts {@link ChatMarkdownThemeProvider} once at the app root with the
 * palette from `lib/theme`; without a provider the markdown falls back to the
 * default Claude palette rather than a hardcoded dark one.
 */
const ChatMarkdownPaletteContext = createContext<RkPalette>(RK_PALETTES[DEFAULT_UI_THEME]);

export function ChatMarkdownThemeProvider({
  palette,
  children,
}: {
  palette: RkPalette;
  children: ReactNode;
}) {
  return <ChatMarkdownPaletteContext value={palette}>{children}</ChatMarkdownPaletteContext>;
}

function makeStyles(palette: RkPalette) {
  return StyleSheet.create({
    body: {
      color: palette.body,
      fontSize: 15.5,
      lineHeight: 23,
      width: "100%",
      minWidth: 0,
      flexShrink: 1,
    },
    paragraph: {
      marginTop: 0,
      marginBottom: 9,
      width: "100%",
      flexShrink: 1,
    },
    heading1: {
      color: palette.ink,
      fontSize: 21,
      lineHeight: 27,
      marginTop: 10,
      marginBottom: 5,
    },
    heading2: {
      color: palette.ink,
      fontSize: 19,
      lineHeight: 25,
      marginTop: 10,
      marginBottom: 5,
    },
    heading3: {
      color: palette.ink,
      fontSize: 17,
      lineHeight: 23,
      marginTop: 8,
      marginBottom: 4,
    },
    strong: {
      color: palette.ink,
      fontWeight: "700",
    },
    link: {
      color: palette.link,
      textDecorationLine: "underline",
      marginBottom: 0,
    },
    code_inline: {
      color: palette.ink,
      backgroundColor: palette.input,
      borderColor: palette.hairlineStrong,
      borderWidth: StyleSheet.hairlineWidth,
      padding: 0,
      paddingHorizontal: 4,
      paddingVertical: 1,
      borderRadius: 4,
    },
    code_block: {
      color: palette.ink,
      backgroundColor: palette.panel,
      borderColor: palette.hairline,
    },
    fence: {
      backgroundColor: palette.panel,
      borderColor: palette.hairline,
    },
    fence_code: {
      backgroundColor: palette.panel,
    },
    blockquote: {
      backgroundColor: "transparent",
      borderLeftColor: palette.hairlineStrong,
    },
    table: {
      borderColor: palette.hairlineStrong,
    },
    tr: {
      borderColor: palette.hairlineStrong,
    },
    hr: {
      backgroundColor: palette.hairlineStrong,
    },
    bullet_list_content: {
      flex: 1,
      flexShrink: 1,
      minWidth: 0,
    },
    ordered_list_content: {
      flex: 1,
      flexShrink: 1,
      minWidth: 0,
    },
  });
}

async function openSafeLink(url: string) {
  const safeUrl = sanitizeMarkdownUrl(url);
  if (!safeUrl) return;
  if (await Linking.canOpenURL(safeUrl)) await Linking.openURL(safeUrl);
}

// Keep links as Text so they stay inside textgroup; Pressable (a View) is laid out
// outside the text flow and collapses the bubble height, overlapping later messages.
const renderRules: RenderRules = {
  link: (node, children, _parent, styleMap) => (
    <Text
      accessibilityRole="link"
      key={node.key}
      style={styleMap.link}
      onPress={() => {
        void openSafeLink(node.attributes.href ?? "");
      }}
    >
      {children}
    </Text>
  ),
};

export const ChatMarkdown = memo(function ChatMarkdown({
  children,
  streaming = false,
}: ChatMarkdownProps) {
  const palette = useContext(ChatMarkdownPaletteContext);
  const styles = useMemo(() => makeStyles(palette), [palette]);

  const sharedProps = {
    colorScheme: palette.colorScheme,
    style: styles,
    rules: renderRules,
    allowedImageHandlers: ["https://", "http://"],
    onLinkPress: (url: string) => {
      void openSafeLink(url);
      return false;
    },
  };

  return (
    <View style={layout.wrap}>
      {streaming ? (
        <MarkdownStream {...sharedProps} cursorColor={palette.muted2} streaming>
          {children}
        </MarkdownStream>
      ) : (
        <Markdown {...sharedProps}>{children}</Markdown>
      )}
    </View>
  );
});

const layout = StyleSheet.create({
  wrap: {
    width: "100%",
    minWidth: 0,
    flexShrink: 1,
  },
});

export type { ChatMarkdownProps } from "./markdown";
