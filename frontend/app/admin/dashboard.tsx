import { useCallback, useState } from "react";
import {
  View, Text, TouchableOpacity, StyleSheet, FlatList, ActivityIndicator,
  Modal, TextInput, Alert, Image, ScrollView, RefreshControl,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useFocusEffect } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { api, formatApiError } from "../../src/api";
import { useAuth } from "../../src/AuthContext";
import { colors, spacing, typography, shared } from "../../src/theme";

type Tab = "pending" | "approved" | "students";

interface Teacher {
  id: string; employee_id: string; name: string; status: string;
  id_photo_base64?: string; created_at: string;
}
interface Student {
  id: string; name: string; usn: string; roll_number: string;
  branch?: string; semester: string; division: string;
}

export default function AdminDashboard() {
  const router = useRouter();
  const { logout } = useAuth();
  const [tab, setTab] = useState<Tab>("pending");
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);

  // approve modal
  const [approving, setApproving] = useState<Teacher | null>(null);
  const [approvePw, setApprovePw] = useState("");

  // edit-student modal
  const [editing, setEditing] = useState<Student | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      if (tab === "students") {
        const { data } = await api.get("/admin/students");
        setStudents(data);
      } else {
        const status = tab === "pending" ? "pending" : "approved";
        const { data } = await api.get(`/admin/teachers?status=${status}`);
        setTeachers(data);
      }
    } catch (e) { Alert.alert("Error", formatApiError(e)); }
    finally { setLoading(false); }
  };

  useFocusEffect(useCallback(() => { load(); }, [tab]));

  const approve = async () => {
    if (!approving || !approvePw || approvePw.length < 6) {
      Alert.alert("Set a password (6+ chars)"); return;
    }
    try {
      await api.post(`/admin/teachers/${approving.id}/approve`, { password: approvePw });
      Alert.alert("Approved", `Employee ${approving.employee_id} can now log in.`);
      setApproving(null); setApprovePw("");
      load();
    } catch (e) { Alert.alert("Error", formatApiError(e)); }
  };

  const reject = async (t: Teacher) => {
    Alert.alert("Reject teacher?", `${t.name} (${t.employee_id})`, [
      { text: "Cancel" },
      {
        text: "Reject", style: "destructive", onPress: async () => {
          try {
            await api.post(`/admin/teachers/${t.id}/reject`);
            load();
          } catch (e) { Alert.alert("Error", formatApiError(e)); }
        },
      },
    ]);
  };

  const doLogout = async () => { await logout(); router.replace("/login"); };

  return (
    <SafeAreaView style={shared.screen}>
      <View style={s.topBar}>
        <View style={{ flex: 1 }}>
          <Text style={typography.label}>Admin</Text>
          <Text style={typography.h2}>Control Panel</Text>
        </View>
        <TouchableOpacity testID="admin-logout" onPress={doLogout} style={s.logoutBtn}>
          <Feather name="log-out" size={20} color={colors.textSecondary} />
        </TouchableOpacity>
      </View>

      <View style={s.tabs}>
        {(["pending", "approved", "students"] as Tab[]).map((t) => (
          <TouchableOpacity
            key={t} testID={`admin-tab-${t}`}
            style={[s.tab, tab === t && s.tabActive]}
            onPress={() => setTab(t)}
          >
            <Text style={[s.tabText, tab === t && s.tabTextActive]}>
              {t === "pending" ? "Pending" : t === "approved" ? "Teachers" : "Students"}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? (
        <ActivityIndicator style={{ marginTop: spacing.xl }} color={colors.brand} />
      ) : tab === "students" ? (
        <FlatList
          data={students}
          keyExtractor={(i) => i.id}
          contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: spacing.xl }}
          refreshControl={<RefreshControl refreshing={false} onRefresh={load} />}
          ListEmptyComponent={<Text style={[typography.bodyMuted, { marginTop: 20, textAlign: "center" }]}>No students</Text>}
          renderItem={({ item }) => (
            <TouchableOpacity
              testID={`admin-student-${item.usn}`}
              style={shared.rowItem}
              onPress={() => setEditing(item)}
            >
              <View style={{ flex: 1 }}>
                <Text style={typography.body}>{item.name}</Text>
                <Text style={typography.small}>
                  {item.usn} · {item.branch || "—"} · Sem {item.semester} · Div {item.division}
                </Text>
              </View>
              <Feather name="edit-2" size={18} color={colors.textSecondary} />
            </TouchableOpacity>
          )}
        />
      ) : (
        <FlatList
          data={teachers}
          keyExtractor={(i) => i.id}
          contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: spacing.xl }}
          refreshControl={<RefreshControl refreshing={false} onRefresh={load} />}
          ListEmptyComponent={<Text style={[typography.bodyMuted, { marginTop: 20, textAlign: "center" }]}>
            {tab === "pending" ? "No pending requests" : "No approved teachers"}
          </Text>}
          renderItem={({ item }) => (
            <View style={s.teacherCard} testID={`admin-teacher-${item.employee_id}`}>
              <View style={{ flexDirection: "row", gap: 12 }}>
                {item.id_photo_base64 ? (
                  <Image source={{ uri: `data:image/jpeg;base64,${item.id_photo_base64}` }} style={s.idPhoto} />
                ) : (
                  <View style={[s.idPhoto, { alignItems: "center", justifyContent: "center", backgroundColor: colors.bgSecondary }]}>
                    <Feather name="user" size={28} color={colors.borderStrong} />
                  </View>
                )}
                <View style={{ flex: 1 }}>
                  <Text style={typography.h3}>{item.name}</Text>
                  <Text style={typography.small}>{item.employee_id}</Text>
                  <Text style={[typography.small, { marginTop: 4 }]}>
                    Submitted {new Date(item.created_at).toLocaleDateString()}
                  </Text>
                </View>
              </View>
              {tab === "pending" && (
                <View style={{ flexDirection: "row", gap: 10, marginTop: 12 }}>
                  <TouchableOpacity
                    testID={`approve-${item.employee_id}`}
                    style={[shared.btnPrimary, { flex: 1 }]}
                    onPress={() => setApproving(item)}
                  >
                    <Text style={shared.btnPrimaryText}>Approve</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    testID={`reject-${item.employee_id}`}
                    style={[shared.btnSecondary, { flex: 1 }]}
                    onPress={() => reject(item)}
                  >
                    <Text style={[shared.btnSecondaryText, { color: colors.absent }]}>Reject</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          )}
        />
      )}

      {/* Approve Modal */}
      <Modal visible={!!approving} transparent animationType="slide" onRequestClose={() => setApproving(null)}>
        <View style={s.modalBg}>
          <View style={s.modalCard}>
            <Text style={typography.h3}>Approve {approving?.name}</Text>
            <Text style={[typography.small, { marginTop: 6 }]}>
              Set initial password for Employee ID: {approving?.employee_id}
            </Text>
            <TextInput
              testID="approve-password-input"
              style={[shared.input, { marginTop: 16 }]}
              placeholder="Initial password (6+ chars)"
              value={approvePw} onChangeText={setApprovePw}
              secureTextEntry
            />
            <View style={{ flexDirection: "row", gap: 10, marginTop: 16 }}>
              <TouchableOpacity style={[shared.btnSecondary, { flex: 1 }]} onPress={() => { setApproving(null); setApprovePw(""); }}>
                <Text style={shared.btnSecondaryText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity testID="approve-confirm" style={[shared.btnPrimary, { flex: 1 }]} onPress={approve}>
                <Text style={shared.btnPrimaryText}>Approve</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Edit Student Modal */}
      {editing && (
        <EditStudentModal
          student={editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load(); }}
        />
      )}
    </SafeAreaView>
  );
}

function EditStudentModal({ student, onClose, onSaved }:
  { student: Student; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(student.name);
  const [branch, setBranch] = useState(student.branch || "");
  const [sem, setSem] = useState(student.semester);
  const [div, setDiv] = useState(student.division);
  const [roll, setRoll] = useState(student.roll_number);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      await api.put(`/admin/students/${student.id}`, {
        name, branch, semester: sem, division: div, roll_number: roll,
      });
      Alert.alert("Saved"); onSaved();
    } catch (e) { Alert.alert("Error", formatApiError(e)); }
    finally { setSaving(false); }
  };

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={s.modalBg}>
        <View style={s.modalCard}>
          <ScrollView>
            <Text style={typography.h3}>Edit Student</Text>
            <Text style={[typography.small, { marginTop: 4 }]}>{student.usn}</Text>

            <Text style={[shared.inputLabel, { marginTop: 14 }]}>Name</Text>
            <TextInput style={shared.input} value={name} onChangeText={setName} testID="edit-name" />

            <Text style={[shared.inputLabel, { marginTop: 14 }]}>Branch</Text>
            <TextInput style={shared.input} value={branch} onChangeText={setBranch} autoCapitalize="characters" testID="edit-branch" />

            <Text style={[shared.inputLabel, { marginTop: 14 }]}>Semester</Text>
            <TextInput style={shared.input} value={sem} onChangeText={setSem} keyboardType="numeric" testID="edit-sem" />

            <Text style={[shared.inputLabel, { marginTop: 14 }]}>Division</Text>
            <TextInput style={shared.input} value={div} onChangeText={setDiv} autoCapitalize="characters" testID="edit-div" />

            <Text style={[shared.inputLabel, { marginTop: 14 }]}>Roll Number</Text>
            <TextInput style={shared.input} value={roll} onChangeText={setRoll} keyboardType="numeric" testID="edit-roll" />

            <View style={{ flexDirection: "row", gap: 10, marginTop: 20 }}>
              <TouchableOpacity style={[shared.btnSecondary, { flex: 1 }]} onPress={onClose}>
                <Text style={shared.btnSecondaryText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity testID="edit-save" style={[shared.btnPrimary, { flex: 1 }]} onPress={save} disabled={saving}>
                {saving ? <ActivityIndicator color="#fff" /> : <Text style={shared.btnPrimaryText}>Save</Text>}
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
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
  tabs: {
    flexDirection: "row", marginHorizontal: spacing.lg, marginTop: spacing.md,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  tab: { paddingVertical: 12, paddingHorizontal: 4, marginRight: 20 },
  tabActive: { borderBottomWidth: 2, borderBottomColor: colors.brand },
  tabText: { fontFamily: "Manrope_500Medium", color: colors.textSecondary, fontSize: 14 },
  tabTextActive: { color: colors.brand, fontFamily: "Manrope_600SemiBold" },
  teacherCard: {
    padding: 16, borderWidth: 1, borderColor: colors.border,
    borderRadius: 14, marginTop: 12, backgroundColor: "#fff",
  },
  idPhoto: { width: 80, height: 80, borderRadius: 8, backgroundColor: "#EEE" },
  modalBg: {
    flex: 1, backgroundColor: "rgba(15,23,42,0.6)",
    justifyContent: "flex-end",
  },
  modalCard: {
    backgroundColor: "#fff", borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: 24, maxHeight: "85%",
  },
});
