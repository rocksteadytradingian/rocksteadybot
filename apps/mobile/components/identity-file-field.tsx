import { IDENTITY_FILE_MAX_CHARS } from "@rakazo/core";
import type { MemoryDocument } from "@rakazo/contracts";
import { Text, TextInput, type TextStyle, View, type ViewStyle } from "react-native";

export function identityDocumentByPath(
  documents: readonly MemoryDocument[],
  path: string,
): MemoryDocument | undefined {
  const needle = path.toLowerCase();
  return documents.find(
    (document) => document.path.replaceAll("\\", "/").split("/").pop()?.toLowerCase() === needle,
  );
}

export function IdentityFileField({
  path,
  hint,
  value,
  onChange,
  labelStyle,
  hintStyle,
  inputStyle,
}: {
  path: string;
  hint: string;
  value: string;
  onChange: (value: string) => void;
  labelStyle: TextStyle;
  hintStyle: TextStyle;
  inputStyle: TextStyle & ViewStyle;
}) {
  return (
    <View>
      <Text style={labelStyle}>{path}</Text>
      <Text style={hintStyle}>{hint}</Text>
      <TextInput
        value={value}
        maxLength={IDENTITY_FILE_MAX_CHARS}
        onChangeText={onChange}
        placeholder={hint}
        placeholderTextColor="#6C6C70"
        multiline
        accessibilityLabel={path}
        style={inputStyle}
      />
    </View>
  );
}
