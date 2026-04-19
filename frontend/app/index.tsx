import { useEffect } from "react";
import {
  View, Text, Image, TouchableOpacity, StyleSheet, ActivityIndicator,
} from "react-native";
import { useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "../src/AuthContext";
import { colors, spacing, typography, shared } from "../src/theme";

const HERO = "https://static.prod-images.emergentagent.com/jobs/09880b46-2e59-486f-86df-a17b3b81cf29/images/4ec27b0585566d48c63e9f72a5226b9267ea8bd67a7d47e05ae6cbf7c346c3e5.png";

export default function Index() {
  const router = useRouter();
  const { user, loading } = useAuth();

  useEffect(() => {
    if (loading) return;
    if (user?.role === "teacher") router.replace("/teacher/dashboard");
    else if (user?.role === "student") router.replace("/student/dashboard");
  }, [user, loading]);

  if (loading) {
    return (
      <SafeAreaView style={[shared.screen, { alignItems: "center", justifyContent: "center" }]}>
        <ActivityIndicator size="large" color={colors.brand} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={shared.screenPad} testID="role-selection-screen">
      <View style={styles.top}>
        <Text style={typography.label}>AI Attendance</Text>
        <Text style={[typography.h1, { marginTop: 4 }]}>Recognize. Record. Report.</Text>
        <Text style={[typography.bodyMuted, { marginTop: 12 }]}>
          Face-recognition powered attendance for modern classrooms.
        </Text>
      </View>

      <View style={styles.heroWrap}>
        <Image source={{ uri: HERO }} style={styles.hero} resizeMode="contain" />
      </View>

      <View style={styles.actions}>
        <Text style={[typography.label, { marginBottom: spacing.sm }]}>Continue as</Text>

        <TouchableOpacity
          testID="role-teacher-btn"
          style={styles.roleCard}
          onPress={() => router.push("/teacher/login")}
          activeOpacity={0.85}
        >
          <View style={[styles.iconBox, { backgroundColor: colors.brand }]}>
            <Feather name="users" size={22} color="#fff" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={typography.h3}>Teacher</Text>
            <Text style={typography.small}>Create sessions & capture attendance</Text>
          </View>
          <Feather name="chevron-right" size={22} color={colors.textSecondary} />
        </TouchableOpacity>

        <TouchableOpacity
          testID="role-student-btn"
          style={styles.roleCard}
          onPress={() => router.push("/student/login")}
          activeOpacity={0.85}
        >
          <View style={[styles.iconBox, { backgroundColor: colors.accent }]}>
            <Feather name="user" size={22} color="#fff" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={typography.h3}>Student</Text>
            <Text style={typography.small}>Register your face & view attendance</Text>
          </View>
          <Feather name="chevron-right" size={22} color={colors.textSecondary} />
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  top: { paddingTop: spacing.lg },
  heroWrap: { alignItems: "center", marginVertical: spacing.lg, flex: 1, justifyContent: "center" },
  hero: { width: "90%", height: 240 },
  actions: { paddingBottom: spacing.lg },
  roleCard: {
    flexDirection: "row", alignItems: "center", gap: 14,
    borderWidth: 1, borderColor: colors.border, borderRadius: 16,
    paddingVertical: 18, paddingHorizontal: 16, marginTop: spacing.md,
    backgroundColor: "#fff",
  },
  iconBox: {
    width: 44, height: 44, borderRadius: 12,
    alignItems: "center", justifyContent: "center", marginRight: 6,
  },
});
