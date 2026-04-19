import { useCallback, useState } from "react";
import {
  View, Text, TouchableOpacity, StyleSheet, FlatList, RefreshControl, ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useFocusEffect } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { api, formatApiError } from "../../src/api";
import { useAuth } from "../../src/AuthContext";
import { colors, spacing, typography, shared } from "../../src/theme";

interface Rec {
  id: string; session_id: string; lecture: string; date: string;
  time_from: string; time_to: string; status: "present" | "absent";
}
interface Note {
  id: string; title: string; message: string; status: string;
  read: boolean; created_at: string;
}

export default function StudentDashboard() {
  const router = useRouter();
  const { user, logout } = useAuth();
  const [data, setData] = useState<{ total: number; present: number; absent: number; percentage: number; records: Rec[] } | null>(null);
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"history" | "notifications">("history");
  const [err, setErr] = useState<string | null>(null);

  const load = async () => {
    setErr(null);
    try {
      const [att, nt] = await Promise.all([
        api.get("/attendance/student"),
        api.get("/notifications"),
      ]);
      setData(att.data);
      setNotes(nt.data);
    } catch (e) { setErr(formatApiError(e)); }
    finally { setLoading(false); }
  };

  useFocusEffect(useCallback(() => { load(); }, []));

  const markRead = async (id: string) => {
    try {
      await api.put(`/notifications/${id}/read`);
      setNotes((p) => p.map((n) => (n.id === id ? { ...n, read: true } : n)));
    } catch {}
  };

  const unreadCount = notes.filter((n) => !n.read).length;
  const pctColor = !data ? colors.text : data.percentage >= 75 ? colors.present : data.percentage >= 50 ? colors.warning : colors.absent;

  return (
    <SafeAreaView style={shared.screen}>
      <View style={s.topBar}>
        <View style={{ flex: 1 }}>
          <Text style={typography.label}>Welcome</Text>
          <Text style={typography.h2} testID="student-name">{user?.name ?? ""}</Text>
          <Text style={typography.small}>
            {user?.usn} · Sem {user?.semester} · Div {user?.division}
          </Text>
        </View>
        <TouchableOpacity testID="student-logout" onPress={logout} style={s.logoutBtn}>
          <Feather name="log-out" size={20} color={colors.textSecondary} />
        </TouchableOpacity>
      </View>

      {!user?.face_registered && (
        <TouchableOpacity
          testID="register-face-banner"
          style={s.banner}
          onPress={() => router.push("/student/face-capture")}
        >
          <Feather name="alert-triangle" size={18} color={colors.warning} />
          <Text style={{ flex: 1, marginLeft: 8, color: colors.text, fontFamily: "Manrope_500Medium" }}>
            Register your face to enable attendance
          </Text>
          <Feather name="chevron-right" size={18} color={colors.textSecondary} />
        </TouchableOpacity>
      )}

      <View style={s.statsCard}>
        <Text style={typography.label}>Overall attendance</Text>
        <Text style={[s.bigPct, { color: pctColor }]} testID="attendance-percentage">
          {data ? data.percentage.toFixed(1) : "—"}%
        </Text>
        <View style={s.statsRow}>
          <View style={s.statsItem}>
            <Text style={[s.statNum, { color: colors.present }]}>{data?.present ?? 0}</Text>
            <Text style={typography.small}>Present</Text>
          </View>
          <View style={s.statsItem}>
            <Text style={[s.statNum, { color: colors.absent }]}>{data?.absent ?? 0}</Text>
            <Text style={typography.small}>Absent</Text>
          </View>
          <View style={s.statsItem}>
            <Text style={s.statNum}>{data?.total ?? 0}</Text>
            <Text style={typography.small}>Total</Text>
          </View>
        </View>
      </View>

      <View style={s.tabs}>
        <TouchableOpacity
          testID="tab-history"
          style={[s.tab, tab === "history" && s.tabActive]}
          onPress={() => setTab("history")}
        >
          <Text style={[s.tabText, tab === "history" && s.tabTextActive]}>History</Text>
        </TouchableOpacity>
        <TouchableOpacity
          testID="tab-notifications"
          style={[s.tab, tab === "notifications" && s.tabActive]}
          onPress={() => setTab("notifications")}
        >
          <Text style={[s.tabText, tab === "notifications" && s.tabTextActive]}>
            Notifications{unreadCount ? ` (${unreadCount})` : ""}
          </Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator style={{ marginTop: spacing.xl }} color={colors.brand} />
      ) : tab === "history" ? (
        <FlatList
          data={data?.records ?? []}
          keyExtractor={(i) => i.id}
          contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: spacing.xl }}
          refreshControl={<RefreshControl refreshing={false} onRefresh={load} />}
          ListEmptyComponent={
            <View style={{ alignItems: "center", paddingTop: spacing.xl }}>
              <Feather name="inbox" size={36} color={colors.borderStrong} />
              <Text style={[typography.bodyMuted, { marginTop: 8 }]}>No attendance records yet</Text>
              {err && <Text style={{ color: colors.absent, marginTop: 8 }}>{err}</Text>}
            </View>
          }
          renderItem={({ item }) => (
            <View style={shared.rowItem} testID={`att-${item.id}`}>
              <View style={{ flex: 1 }}>
                <Text style={typography.body}>{item.lecture}</Text>
                <Text style={typography.small}>{item.date} · {item.time_from}–{item.time_to}</Text>
              </View>
              <Text style={[s.badge, { color: item.status === "present" ? colors.present : colors.absent }]}>
                {item.status.toUpperCase()}
              </Text>
            </View>
          )}
        />
      ) : (
        <FlatList
          data={notes}
          keyExtractor={(i) => i.id}
          contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: spacing.xl }}
          refreshControl={<RefreshControl refreshing={false} onRefresh={load} />}
          ListEmptyComponent={
            <View style={{ alignItems: "center", paddingTop: spacing.xl }}>
              <Feather name="bell-off" size={36} color={colors.borderStrong} />
              <Text style={[typography.bodyMuted, { marginTop: 8 }]}>No notifications</Text>
            </View>
          }
          renderItem={({ item }) => (
            <TouchableOpacity
              testID={`note-${item.id}`}
              style={[s.noteRow, !item.read && { backgroundColor: colors.bgSecondary }]}
              onPress={() => markRead(item.id)}
            >
              <View style={[s.noteDot, { backgroundColor: item.status === "present" ? colors.present : colors.absent }]} />
              <View style={{ flex: 1 }}>
                <Text style={typography.body}>{item.title}</Text>
                <Text style={typography.small}>{item.message}</Text>
              </View>
              {!item.read && <View style={s.unreadDot} />}
            </TouchableOpacity>
          )}
        />
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  topBar: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.sm,
  },
  logoutBtn: {
    width: 40, height: 40, borderRadius: 10, alignItems: "center",
    justifyContent: "center", borderWidth: 1, borderColor: colors.border,
  },
  banner: {
    flexDirection: "row", alignItems: "center",
    marginHorizontal: spacing.lg, paddingVertical: 12, paddingHorizontal: 14,
    backgroundColor: "#FEF3C7", borderRadius: 10, marginTop: 6,
  },
  statsCard: {
    marginHorizontal: spacing.lg, marginTop: spacing.md,
    padding: 18, borderWidth: 1, borderColor: colors.border, borderRadius: 16,
    backgroundColor: colors.bgSecondary,
  },
  bigPct: { fontFamily: "Outfit_700Bold", fontSize: 44, letterSpacing: -1, marginTop: 4 },
  statsRow: { flexDirection: "row", gap: 16, marginTop: 10 },
  statsItem: { flex: 1 },
  statNum: { fontFamily: "Outfit_700Bold", fontSize: 20, color: colors.text },
  tabs: {
    flexDirection: "row", marginHorizontal: spacing.lg, marginTop: spacing.lg,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  tab: { paddingVertical: 12, paddingHorizontal: 4, marginRight: 20 },
  tabActive: { borderBottomWidth: 2, borderBottomColor: colors.brand },
  tabText: { fontFamily: "Manrope_500Medium", color: colors.textSecondary, fontSize: 14 },
  tabTextActive: { color: colors.brand, fontFamily: "Manrope_600SemiBold" },
  badge: { fontFamily: "Manrope_600SemiBold", fontSize: 12, letterSpacing: 0.8 },
  noteRow: {
    flexDirection: "row", alignItems: "center", gap: 10,
    paddingVertical: 12, paddingHorizontal: 12, borderRadius: 10, marginTop: 8,
    borderWidth: 1, borderColor: colors.border,
  },
  noteDot: { width: 8, height: 8, borderRadius: 4 },
  unreadDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.brand },
});
