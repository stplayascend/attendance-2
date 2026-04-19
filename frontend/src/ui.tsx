import React from "react";
import {
  View, Text, TouchableOpacity, TextInput, StyleSheet, KeyboardAvoidingView,
  Platform, ScrollView,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { colors, spacing, typography, shared } from "./theme";

export const Header: React.FC<{ title: string; subtitle?: string; back?: boolean; right?: React.ReactNode }> =
({ title, subtitle, back = true, right }) => {
  const router = useRouter();
  return (
    <View style={styles.header}>
      <View style={{ flexDirection: "row", alignItems: "center" }}>
        {back && (
          <TouchableOpacity testID="back-btn" onPress={() => router.back()} style={styles.backBtn}>
            <Feather name="chevron-left" size={24} color={colors.text} />
          </TouchableOpacity>
        )}
        <View style={{ flex: 1, marginLeft: back ? 4 : 0 }}>
          <Text style={typography.h2}>{title}</Text>
          {subtitle ? <Text style={[typography.small, { marginTop: 2 }]}>{subtitle}</Text> : null}
        </View>
        {right}
      </View>
    </View>
  );
};

export const Field: React.FC<{
  label: string; value: string; onChangeText: (t: string) => void;
  placeholder?: string; secureTextEntry?: boolean; autoCapitalize?: any;
  keyboardType?: any; testID?: string;
}> = ({ label, value, onChangeText, placeholder, secureTextEntry, autoCapitalize = "none", keyboardType, testID }) => (
  <View style={{ marginTop: spacing.md }}>
    <Text style={shared.inputLabel}>{label}</Text>
    <TextInput
      testID={testID}
      style={shared.input}
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor="#94A3B8"
      secureTextEntry={secureTextEntry}
      autoCapitalize={autoCapitalize}
      keyboardType={keyboardType}
    />
  </View>
);

export const FormScreen: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <SafeAreaView style={shared.screen}>
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      style={{ flex: 1 }}
    >
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl }}
      >
        {children}
      </ScrollView>
    </KeyboardAvoidingView>
  </SafeAreaView>
);

export const PillToggle: React.FC<{
  options: string[]; value: string; onChange: (v: string) => void; testID?: string;
}> = ({ options, value, onChange, testID }) => (
  <View style={styles.pillRow} testID={testID}>
    {options.map((o) => {
      const active = value === o;
      return (
        <TouchableOpacity
          key={o}
          testID={`${testID}-${o}`}
          onPress={() => onChange(o)}
          style={[styles.pill, active && styles.pillActive]}
        >
          <Text style={[styles.pillText, active && styles.pillTextActive]}>{o}</Text>
        </TouchableOpacity>
      );
    })}
  </View>
);

export const ErrorText: React.FC<{ message?: string | null }> = ({ message }) =>
  message ? (
    <View style={styles.errorBox}>
      <Feather name="alert-circle" size={16} color={colors.absent} />
      <Text style={styles.errorText}>{message}</Text>
    </View>
  ) : null;

const styles = StyleSheet.create({
  header: { paddingTop: spacing.md, paddingBottom: spacing.md },
  backBtn: { width: 36, height: 36, alignItems: "center", justifyContent: "center", marginLeft: -6 },
  pillRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 8 },
  pill: {
    paddingVertical: 10, paddingHorizontal: 14, borderRadius: 999,
    borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: "#fff",
  },
  pillActive: { backgroundColor: colors.brand, borderColor: colors.brand },
  pillText: { fontFamily: "Manrope_500Medium", color: colors.text, fontSize: 14 },
  pillTextActive: { color: "#fff" },
  errorBox: {
    marginTop: spacing.md, backgroundColor: "#FEF2F2", borderRadius: 8,
    padding: 12, flexDirection: "row", alignItems: "center", gap: 8,
    borderWidth: 1, borderColor: "#FECACA",
  },
  errorText: { color: colors.absent, fontFamily: "Manrope_500Medium", fontSize: 14, flex: 1 },
});
