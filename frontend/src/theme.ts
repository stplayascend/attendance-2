import { StyleSheet } from "react-native";

export const colors = {
  bg: "#FFFFFF",
  bgSecondary: "#F8FAFC",
  bgTertiary: "#F1F5F9",
  text: "#0F172A",
  textSecondary: "#475569",
  textInverse: "#FFFFFF",
  brand: "#1D4ED8",
  brandHover: "#1E3A8A",
  accent: "#3B82F6",
  present: "#10B981",
  absent: "#EF4444",
  warning: "#F59E0B",
  border: "#E2E8F0",
  borderStrong: "#CBD5E1",
  borderFocus: "#2563EB",
};

export const spacing = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32, xxl: 48 };

export const fonts = {
  heading: "Outfit_700Bold",
  headingSemi: "Outfit_600SemiBold",
  body: "Manrope_400Regular",
  bodyMedium: "Manrope_500Medium",
  bodySemi: "Manrope_600SemiBold",
};

export const typography = StyleSheet.create({
  h1: { fontFamily: fonts.heading, fontSize: 32, lineHeight: 40, color: colors.text, letterSpacing: -0.5 },
  h2: { fontFamily: fonts.headingSemi, fontSize: 24, lineHeight: 32, color: colors.text, letterSpacing: -0.3 },
  h3: { fontFamily: fonts.headingSemi, fontSize: 20, lineHeight: 28, color: colors.text },
  body: { fontFamily: fonts.body, fontSize: 16, lineHeight: 24, color: colors.text },
  bodyMuted: { fontFamily: fonts.body, fontSize: 16, lineHeight: 24, color: colors.textSecondary },
  label: {
    fontFamily: fonts.bodySemi, fontSize: 12, lineHeight: 16,
    letterSpacing: 1.2, textTransform: "uppercase", color: colors.textSecondary,
  },
  small: { fontFamily: fonts.body, fontSize: 14, lineHeight: 20, color: colors.textSecondary },
});

export const shared = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  screenPad: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: spacing.lg },
  btnPrimary: {
    backgroundColor: colors.brand, borderRadius: 12, paddingVertical: 16,
    alignItems: "center", justifyContent: "center",
  },
  btnPrimaryText: { color: "#FFFFFF", fontFamily: fonts.bodySemi, fontSize: 16 },
  btnSecondary: {
    backgroundColor: colors.bgTertiary, borderRadius: 12, paddingVertical: 16,
    alignItems: "center", justifyContent: "center",
  },
  btnSecondaryText: { color: colors.text, fontFamily: fonts.bodySemi, fontSize: 16 },
  input: {
    borderWidth: 1, borderColor: colors.borderStrong, borderRadius: 8,
    paddingHorizontal: 16, paddingVertical: 14, fontSize: 16,
    fontFamily: fonts.body, color: colors.text, backgroundColor: "#FFFFFF",
  },
  inputLabel: {
    fontFamily: fonts.bodySemi, fontSize: 12, color: colors.textSecondary,
    letterSpacing: 1.0, textTransform: "uppercase", marginBottom: 6,
  },
  card: {
    backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: colors.border,
    borderRadius: 12, padding: 16,
  },
  rowItem: {
    paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: colors.border,
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
  },
});
