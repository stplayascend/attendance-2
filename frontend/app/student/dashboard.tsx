import { useCallback, useEffect, useState } from "react";
import {
  View, Text, TouchableOpacity, StyleSheet, FlatList, RefreshControl, ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useFocusEffect } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { api } from "../../src/api";
import { useAuth } from "../../src/AuthContext";
import { colors, spacing, typography, shared } from "../../src/theme";

interface Rec {
  id: string; session_id: string; lecture: string; date: string;
  time_from: string; time_to: string; status: "present" | "absent";
}

export default function StudentDashboard() {
  const router = useRouter();
  const { user, logout, token } = useAuth();
  const [data, setData] = useState<{ total: number; present: number; absent: number; percentage: number; records: Rec[] } | null>(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    try {
      const { data } = await api.get("/attendance/student");
      setData(data);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  };

  useFocusEffect(useCallback(() => { load(); }, []));

  // Real-time attendance updates via WebSocket (refresh list on push).
  useEffect(() => {
    if (!token) return;
    const base = process.env.EXPO_PUBLIC_BACKEND_URL || "";
    const wsUrl = base.replace(/^http/, "ws") + `/api/ws/notifications?token=${token}`;
    let ws: WebSocket | null = null;
    let closed = false;
    let retryTimer: any = null;
    const connect = () => {
      try {
        ws = new WebSocket(wsUrl);
        ws.onmessage = () => load();
        ws.onclose = () => { if (!closed) retryTimer = setTimeout(connect, 3000); };
      } catch {}
    };
    connect();
    return () => {
      closed = true;
      if (retryTimer) clearTimeout(retryTimer);
      ws?.close();
    };
  }, [token]);

  const doLogout = async () => { await logout(); router.replace("/login"); };

  const pctColor = !data ? colors.text
    : data.percentage >= 75 ? colors.present
    : data.percentage >= 50 ? colors.warning
    : colors.absent;

  return (
    <SafeAreaView style={shared.screen}>
      <View style={s.topBar}>
        <View style={{ flex: 1 }}>
          <Text style={typography.label}>Welcome</Text>
          <Text style={typography.h2} testID="student-name">{user?.name ?? ""}</Text>
          <Text style={typography.small}>
            {user?.usn} · {user?.branch || ""} · Sem {user?.semester} · Div {user?.division}
          </Text>
        </View>
        <TouchableOpacity testID="student-settings" onPress={() => router.push("/change-password")}
          style={[s.logoutBtn, { marginRight: 8 }]}>
          <Feather name="lock" size={18} color={colors.textSecondary} />
        </TouchableOpacity>
        <TouchableOpacity testID="student-logout" onPress={doLogout} style={s.logoutBtn}>
          <Feather name="log-out" size={20} color={colors.textSecondary} />
        </TouchableOpacity>
      </View>

      {!user?.face_registered && (
        <TouchableOpacity testID="register-face-banner" style={s.banner}
          onPress={() => router.push("/student/face-capture")}>
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

      <View style={{ paddingHorizontal: spacing.lg, marginTop: spacing.lg, marginBottom: 4 }}>
        <Text style={typography.label}>Attendance</Text>
      </View>

      {loading ? <ActivityIndicator style={{ marginTop: spacing.xl }} color={colors.brand} /> : (
        <FlatList data={data?.records ?? []} keyExtractor={(i) => i.id}
          contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: spacing.xl }}
          refreshControl={<RefreshControl refreshing={false} onRefresh={load} />}
          ListEmptyComponent={
            <View style={{ alignItems: "center", paddingTop: spacing.xl }}>
              <Feather name="inbox" size={36} color={colors.borderStrong} />
              <Text style={[typography.bodyMuted, { marginTop: 8 }]}>No attendance records yet</Text>
            </View>
          }
          renderItem={({ item }) => (
            <View style={shared.rowItem}>
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
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  topBar: { flexDirection: "row", alignItems: "center", paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.sm },
  logoutBtn: { width: 40, height: 40, borderRadius: 10, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.border },
  banner: { flexDirection: "row", alignItems: "center", marginHorizontal: spacing.lg, paddingVertical: 12, paddingHorizontal: 14, backgroundColor: "#FEF3C7", borderRadius: 10, marginTop: 6 },
  statsCard: { marginHorizontal: spacing.lg, marginTop: spacing.md, padding: 18, borderWidth: 1, borderColor: colors.border, borderRadius: 16, backgroundColor: colors.bgSecondary },
  bigPct: { fontFamily: "Outfit_700Bold", fontSize: 44, letterSpacing: -1, marginTop: 4 },
  statsRow: { flexDirection: "row", gap: 16, marginTop: 10 },
  statsItem: { flex: 1 },
  statNum: { fontFamily: "Outfit_700Bold", fontSize: 20, color: colors.text },
  badge: { fontFamily: "Manrope_600SemiBold", fontSize: 12, letterSpacing: 0.8 },
});
