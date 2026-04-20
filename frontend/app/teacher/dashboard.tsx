import { useEffect, useState, useCallback } from "react";
import {
  View, Text, TouchableOpacity, FlatList, StyleSheet,
  RefreshControl, ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useFocusEffect } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { api, formatApiError } from "../../src/api";
import { useAuth } from "../../src/AuthContext";
import { colors, spacing, typography, shared } from "../../src/theme";

interface Session {
  id: string; lecture: string; semester: string; division: string;
  time_from: string; time_to: string; date: string; status: string;
}

export default function TeacherDashboard() {
  const router = useRouter();
  const { user, logout } = useAuth();
  const [items, setItems] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const load = async () => {
    setErr(null);
    try {
      const { data } = await api.get("/sessions");
      setItems(data);
    } catch (e) { setErr(formatApiError(e)); }
    finally { setLoading(false); }
  };

  useFocusEffect(useCallback(() => { load(); }, []));

  return (
    <SafeAreaView style={shared.screen}>
      <View style={styles.topBar}>
        <View style={{ flex: 1 }}>
          <Text style={typography.label}>Welcome</Text>
          <Text style={typography.h2} testID="teacher-name">{user?.name ?? ""}</Text>
          {user?.subject ? <Text style={typography.small}>{user.subject}</Text> : null}
        </View>
        <TouchableOpacity testID="teacher-logout" onPress={async () => { await logout(); router.replace("/login"); }} style={styles.logoutBtn}>
          <Feather name="log-out" size={20} color={colors.textSecondary} />
        </TouchableOpacity>
      </View>

      <View style={{ paddingHorizontal: spacing.lg, marginTop: spacing.md }}>
        <TouchableOpacity
          testID="create-session-btn"
          style={styles.fab}
          onPress={() => router.push("/teacher/create-session")}
        >
          <Feather name="plus-circle" size={22} color="#fff" />
          <Text style={styles.fabText}>Create New Session</Text>
        </TouchableOpacity>
      </View>

      <View style={{ paddingHorizontal: spacing.lg, marginTop: spacing.lg, marginBottom: spacing.sm }}>
        <Text style={typography.label}>Past Sessions</Text>
      </View>

      {loading ? (
        <ActivityIndicator style={{ marginTop: spacing.xl }} color={colors.brand} />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(i) => i.id}
          contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: spacing.xl }}
          refreshControl={<RefreshControl refreshing={false} onRefresh={load} />}
          ListEmptyComponent={
            <View style={{ alignItems: "center", paddingTop: spacing.xl }}>
              <Feather name="calendar" size={40} color={colors.borderStrong} />
              <Text style={[typography.bodyMuted, { marginTop: spacing.md }]}>
                No sessions yet. Tap "Create New Session" to begin.
              </Text>
              {err && <Text style={{ color: colors.absent, marginTop: 8 }}>{err}</Text>}
            </View>
          }
          renderItem={({ item }) => (
            <TouchableOpacity
              testID={`session-row-${item.id}`}
              style={styles.row}
              onPress={() => router.push(`/teacher/session/${item.id}`)}
            >
              <View style={{ flex: 1 }}>
                <Text style={typography.h3}>{item.lecture}</Text>
                <Text style={typography.small}>
                  Sem {item.semester} · Div {item.division} · {item.date}
                </Text>
                <Text style={[typography.small, { marginTop: 2 }]}>
                  {item.time_from} – {item.time_to}
                </Text>
              </View>
              <View style={[styles.badge, item.status === "completed" ? styles.badgeDone : styles.badgeOpen]}>
                <Text style={[styles.badgeText,
                  item.status === "completed" ? { color: colors.present } : { color: colors.warning }]}>
                  {item.status}
                </Text>
              </View>
              <Feather name="chevron-right" size={20} color={colors.textSecondary} style={{ marginLeft: 8 }} />
            </TouchableOpacity>
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  topBar: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: spacing.lg, paddingTop: spacing.md,
  },
  logoutBtn: {
    width: 40, height: 40, borderRadius: 10, alignItems: "center",
    justifyContent: "center", borderWidth: 1, borderColor: colors.border,
  },
  fab: {
    backgroundColor: colors.brand, paddingVertical: 18, borderRadius: 16,
    flexDirection: "row", gap: 10, alignItems: "center", justifyContent: "center",
  },
  fabText: { color: "#fff", fontFamily: "Manrope_600SemiBold", fontSize: 16 },
  row: {
    paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: colors.border,
    flexDirection: "row", alignItems: "center",
  },
  badge: { paddingVertical: 4, paddingHorizontal: 10, borderRadius: 999 },
  badgeOpen: { backgroundColor: "#FEF3C7" },
  badgeDone: { backgroundColor: "#D1FAE5" },
  badgeText: { fontFamily: "Manrope_600SemiBold", fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5 },
});
