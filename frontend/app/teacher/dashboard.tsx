import { useEffect, useState, useCallback } from "react";
import {
  View, Text, TouchableOpacity, FlatList, StyleSheet,
  RefreshControl, ActivityIndicator, Modal, TextInput, Alert, ScrollView,
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
  const { user, logout, refresh } = useAuth();
  const [items, setItems] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [coursesOpen, setCoursesOpen] = useState(false);
  const [editCourses, setEditCourses] = useState<string[]>([]);
  const [savingCourses, setSavingCourses] = useState(false);

  const load = async () => {
    try {
      const { data } = await api.get("/sessions");
      setItems(data);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  };

  useFocusEffect(useCallback(() => { load(); }, []));

  const openCourses = () => {
    setEditCourses([...(user?.courses || [])]);
    setCoursesOpen(true);
  };

  const saveCourses = async () => {
    setSavingCourses(true);
    try {
      await api.put("/teachers/me/courses", {
        courses: editCourses.filter((c) => c.trim()),
      });
      await refresh();
      setCoursesOpen(false);
    } catch (e) { Alert.alert("Error", formatApiError(e)); }
    finally { setSavingCourses(false); }
  };

  const doLogout = async () => { await logout(); router.replace("/login"); };

  return (
    <SafeAreaView style={shared.screen}>
      <View style={styles.topBar}>
        <View style={{ flex: 1 }}>
          <Text style={typography.label}>Welcome</Text>
          <Text style={typography.h2} testID="teacher-name">{user?.name ?? ""}</Text>
          {user?.employee_id ? <Text style={typography.small}>{user.employee_id}</Text> : null}
        </View>
        <TouchableOpacity testID="teacher-logout" onPress={doLogout} style={styles.logoutBtn}>
          <Feather name="log-out" size={20} color={colors.textSecondary} />
        </TouchableOpacity>
      </View>

      <View style={{ paddingHorizontal: spacing.lg, marginTop: spacing.md }}>
        <TouchableOpacity testID="create-session-btn" style={styles.fab}
          onPress={() => router.push("/teacher/create-session")}>
          <Feather name="plus-circle" size={22} color="#fff" />
          <Text style={styles.fabText}>Create New Session</Text>
        </TouchableOpacity>

        <TouchableOpacity testID="courses-btn" style={styles.coursesCard} onPress={openCourses}>
          <Feather name="book-open" size={20} color={colors.brand} />
          <View style={{ flex: 1, marginLeft: 10 }}>
            <Text style={typography.body}>My Courses ({user?.courses?.length || 0})</Text>
            <Text style={typography.small} numberOfLines={1}>
              {user?.courses?.length ? user.courses.join(" · ") : "Tap to add courses"}
            </Text>
          </View>
          <Feather name="chevron-right" size={18} color={colors.textSecondary} />
        </TouchableOpacity>

        <TouchableOpacity testID="change-password-link"
          style={styles.coursesCard} onPress={() => router.push("/change-password")}>
          <Feather name="lock" size={20} color={colors.brand} />
          <Text style={[typography.body, { flex: 1, marginLeft: 10 }]}>Change Password</Text>
          <Feather name="chevron-right" size={18} color={colors.textSecondary} />
        </TouchableOpacity>
      </View>

      <View style={{ paddingHorizontal: spacing.lg, marginTop: spacing.lg, marginBottom: spacing.sm }}>
        <Text style={typography.label}>Past Sessions</Text>
      </View>

      {loading ? (
        <ActivityIndicator style={{ marginTop: spacing.xl }} color={colors.brand} />
      ) : (
        <FlatList data={items} keyExtractor={(i) => i.id}
          contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: spacing.xl }}
          refreshControl={<RefreshControl refreshing={false} onRefresh={load} />}
          ListEmptyComponent={
            <View style={{ alignItems: "center", paddingTop: spacing.xl }}>
              <Feather name="calendar" size={40} color={colors.borderStrong} />
              <Text style={[typography.bodyMuted, { marginTop: spacing.md, textAlign: "center" }]}>
                No sessions yet. Tap "Create New Session" to begin.
              </Text>
            </View>
          }
          renderItem={({ item }) => (
            <TouchableOpacity testID={`session-row-${item.id}`} style={styles.row}
              onPress={() => router.push(`/teacher/session/${item.id}`)}>
              <View style={{ flex: 1 }}>
                <Text style={typography.h3}>{item.lecture}</Text>
                <Text style={typography.small}>Sem {item.semester} · Div {item.division} · {item.date}</Text>
                <Text style={[typography.small, { marginTop: 2 }]}>{item.time_from} – {item.time_to}</Text>
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

      <Modal visible={coursesOpen} transparent animationType="slide" onRequestClose={() => setCoursesOpen(false)}>
        <View style={styles.modalBg}>
          <View style={styles.modalCard}>
            <ScrollView>
              <Text style={typography.h3}>My Courses</Text>
              <Text style={[typography.small, { marginTop: 4 }]}>Add or remove courses you teach.</Text>
              {editCourses.map((c, i) => (
                <View key={i} style={{ flexDirection: "row", gap: 8, marginTop: 10, alignItems: "center" }}>
                  <TextInput testID={`course-input-${i}`}
                    style={[shared.input, { flex: 1 }]} value={c}
                    placeholder={`Course ${i + 1}`}
                    onChangeText={(t) => setEditCourses((prev) => prev.map((x, j) => j === i ? t : x))} />
                  <TouchableOpacity onPress={() => setEditCourses((p) => p.filter((_, j) => j !== i))}
                    style={[styles.iconBtn]}>
                    <Feather name="trash-2" size={16} color={colors.absent} />
                  </TouchableOpacity>
                </View>
              ))}
              <TouchableOpacity testID="add-course-btn"
                style={[shared.btnSecondary, { marginTop: 12 }]}
                onPress={() => setEditCourses((p) => [...p, ""])}>
                <Text style={shared.btnSecondaryText}>+ Add Course</Text>
              </TouchableOpacity>
              <View style={{ flexDirection: "row", gap: 10, marginTop: 20 }}>
                <TouchableOpacity style={[shared.btnSecondary, { flex: 1 }]} onPress={() => setCoursesOpen(false)}>
                  <Text style={shared.btnSecondaryText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity testID="save-courses" style={[shared.btnPrimary, { flex: 1 }]} onPress={saveCourses} disabled={savingCourses}>
                  {savingCourses ? <ActivityIndicator color="#fff" /> : <Text style={shared.btnPrimaryText}>Save</Text>}
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  topBar: { flexDirection: "row", alignItems: "center", paddingHorizontal: spacing.lg, paddingTop: spacing.md },
  logoutBtn: { width: 40, height: 40, borderRadius: 10, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.border },
  fab: { backgroundColor: colors.brand, paddingVertical: 18, borderRadius: 16, flexDirection: "row", gap: 10, alignItems: "center", justifyContent: "center" },
  fabText: { color: "#fff", fontFamily: "Manrope_600SemiBold", fontSize: 16 },
  coursesCard: { marginTop: 12, flexDirection: "row", alignItems: "center", padding: 14, borderWidth: 1, borderColor: colors.border, borderRadius: 12, backgroundColor: "#fff" },
  row: { paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: colors.border, flexDirection: "row", alignItems: "center" },
  badge: { paddingVertical: 4, paddingHorizontal: 10, borderRadius: 999 },
  badgeOpen: { backgroundColor: "#FEF3C7" },
  badgeDone: { backgroundColor: "#D1FAE5" },
  badgeText: { fontFamily: "Manrope_600SemiBold", fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5 },
  modalBg: { flex: 1, backgroundColor: "rgba(15,23,42,0.6)", justifyContent: "flex-end" },
  modalCard: { backgroundColor: "#fff", borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, maxHeight: "88%" },
  iconBtn: { padding: 10, borderRadius: 8, borderWidth: 1, borderColor: colors.border },
});
