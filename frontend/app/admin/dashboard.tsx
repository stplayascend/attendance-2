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
import { PillToggle } from "../../src/ui";

type Tab = "pending" | "approved" | "students";
interface Teacher {
  id: string; employee_id: string; name: string; email?: string;
  status: string; id_photo_base64?: string; courses?: string[]; created_at: string;
}
interface Student {
  id: string; name: string; usn: string; email?: string; roll_number: string;
  branch?: string; semester: string; division: string;
}

const SEMESTERS = ["All", "1", "2", "3", "4", "5", "6", "7", "8"];
const DIVISIONS = ["All", "A", "B", "C", "D"];

export default function AdminDashboard() {
  const router = useRouter();
  const { logout } = useAuth();
  const [tab, setTab] = useState<Tab>("pending");
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewing, setViewing] = useState<Teacher | null>(null);
  const [editing, setEditing] = useState<Student | null>(null);
  const [filterSem, setFilterSem] = useState("All");
  const [filterDiv, setFilterDiv] = useState("All");

  const load = async () => {
    setLoading(true);
    try {
      if (tab === "students") {
        const qs: string[] = [];
        if (filterSem !== "All") qs.push(`semester=${filterSem}`);
        if (filterDiv !== "All") qs.push(`division=${filterDiv}`);
        const { data } = await api.get(`/admin/students${qs.length ? "?" + qs.join("&") : ""}`);
        setStudents(data);
      } else {
        const status = tab === "pending" ? "pending" : "approved";
        const { data } = await api.get(`/admin/teachers?status=${status}`);
        setTeachers(data);
      }
    } catch (e) { Alert.alert("Error", formatApiError(e)); }
    finally { setLoading(false); }
  };

  useFocusEffect(useCallback(() => { load(); }, [tab, filterSem, filterDiv]));

  const approve = async (t: Teacher) => {
    try {
      const { data } = await api.post(`/admin/teachers/${t.id}/approve`);
      Alert.alert("Approved",
        `${t.name} can now log in with Employee ID ${t.employee_id} and password ${data.default_password}. Email sent.`);
      setViewing(null); load();
    } catch (e) { Alert.alert("Error", formatApiError(e)); }
  };

  const reject = (t: Teacher) => {
    Alert.alert("Reject teacher?", `${t.name} (${t.employee_id})`, [
      { text: "Cancel" },
      { text: "Reject", style: "destructive", onPress: async () => {
          try { await api.post(`/admin/teachers/${t.id}/reject`); setViewing(null); load(); }
          catch (e) { Alert.alert("Error", formatApiError(e)); }
        } },
    ]);
  };

  const delTeacher = (t: Teacher) => {
    Alert.alert("Delete teacher?", `${t.name} (${t.employee_id}) will be permanently removed.`, [
      { text: "Cancel" },
      { text: "Delete", style: "destructive", onPress: async () => {
          try { await api.delete(`/admin/teachers/${t.id}`); setViewing(null); load(); }
          catch (e) { Alert.alert("Error", formatApiError(e)); }
        } },
    ]);
  };

  const delStudent = (s: Student) => {
    Alert.alert("Delete student?", `${s.name} (${s.usn}) will be permanently removed.`, [
      { text: "Cancel" },
      { text: "Delete", style: "destructive", onPress: async () => {
          try { await api.delete(`/admin/students/${s.id}`); load(); }
          catch (e) { Alert.alert("Error", formatApiError(e)); }
        } },
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
          <TouchableOpacity key={t} testID={`admin-tab-${t}`}
            style={[s.tab, tab === t && s.tabActive]} onPress={() => setTab(t)}>
            <Text style={[s.tabText, tab === t && s.tabTextActive]}>
              {t === "pending" ? "Pending" : t === "approved" ? "Teachers" : "Students"}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {tab === "students" && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false}
          style={{ maxHeight: 120 }} contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingVertical: 8 }}>
          <View>
            <Text style={shared.inputLabel}>Semester</Text>
            <View style={{ flexDirection: "row", gap: 8, marginTop: 4 }}>
              {SEMESTERS.map((o) => (
                <TouchableOpacity key={o} testID={`filter-sem-${o}`}
                  onPress={() => setFilterSem(o)}
                  style={[s.filterPill, filterSem === o && s.filterPillActive]}>
                  <Text style={[s.filterPillText, filterSem === o && { color: "#fff" }]}>{o}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={[shared.inputLabel, { marginTop: 8 }]}>Division</Text>
            <View style={{ flexDirection: "row", gap: 8, marginTop: 4 }}>
              {DIVISIONS.map((o) => (
                <TouchableOpacity key={o} testID={`filter-div-${o}`}
                  onPress={() => setFilterDiv(o)}
                  style={[s.filterPill, filterDiv === o && s.filterPillActive]}>
                  <Text style={[s.filterPillText, filterDiv === o && { color: "#fff" }]}>{o}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </ScrollView>
      )}

      {loading ? (
        <ActivityIndicator style={{ marginTop: spacing.xl }} color={colors.brand} />
      ) : tab === "students" ? (
        <FlatList data={students} keyExtractor={(i) => i.id}
          contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: spacing.xl }}
          refreshControl={<RefreshControl refreshing={false} onRefresh={load} />}
          ListEmptyComponent={<Text style={[typography.bodyMuted, { marginTop: 20, textAlign: "center" }]}>No students</Text>}
          renderItem={({ item }) => (
            <View style={[shared.rowItem, { gap: 8 }]} testID={`admin-student-${item.usn}`}>
              <TouchableOpacity style={{ flex: 1 }} onPress={() => setEditing(item)}>
                <Text style={typography.body}>{item.name}</Text>
                <Text style={typography.small}>
                  {item.usn} · {item.branch || "—"} · Sem {item.semester} · Div {item.division}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setEditing(item)} style={s.iconBtn} testID={`edit-${item.usn}`}>
                <Feather name="edit-2" size={16} color={colors.textSecondary} />
              </TouchableOpacity>
              <TouchableOpacity onPress={() => delStudent(item)} style={s.iconBtn} testID={`del-${item.usn}`}>
                <Feather name="trash-2" size={16} color={colors.absent} />
              </TouchableOpacity>
            </View>
          )}
        />
      ) : (
        <FlatList data={teachers} keyExtractor={(i) => i.id}
          contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: spacing.xl }}
          refreshControl={<RefreshControl refreshing={false} onRefresh={load} />}
          ListEmptyComponent={<Text style={[typography.bodyMuted, { marginTop: 20, textAlign: "center" }]}>
            {tab === "pending" ? "No pending requests" : "No approved teachers"}
          </Text>}
          renderItem={({ item }) => (
            <TouchableOpacity
              testID={`admin-teacher-${item.employee_id}`}
              style={s.teacherCard}
              onPress={() => setViewing(item)}
            >
              <View style={{ flexDirection: "row", gap: 12, alignItems: "center" }}>
                {item.id_photo_base64 ? (
                  <Image source={{ uri: `data:image/jpeg;base64,${item.id_photo_base64}` }} style={s.idThumb} />
                ) : (
                  <View style={[s.idThumb, { alignItems: "center", justifyContent: "center", backgroundColor: colors.bgSecondary }]}>
                    <Feather name="user" size={24} color={colors.borderStrong} />
                  </View>
                )}
                <View style={{ flex: 1 }}>
                  <Text style={typography.h3}>{item.name}</Text>
                  <Text style={typography.small}>{item.employee_id} · {item.email || ""}</Text>
                  {item.courses?.length ? (
                    <Text style={[typography.small, { marginTop: 2 }]}>
                      {item.courses.length} course{item.courses.length > 1 ? "s" : ""}
                    </Text>
                  ) : null}
                </View>
                <Feather name="chevron-right" size={20} color={colors.textSecondary} />
              </View>
            </TouchableOpacity>
          )}
        />
      )}

      {/* Teacher detail modal */}
      {viewing && (
        <Modal visible transparent animationType="slide" onRequestClose={() => setViewing(null)}>
          <View style={s.modalBg}>
            <View style={s.modalCard}>
              <ScrollView>
                <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 12 }}>
                  <Text style={[typography.h2, { flex: 1 }]}>{viewing.name}</Text>
                  <TouchableOpacity onPress={() => setViewing(null)}>
                    <Feather name="x" size={22} color={colors.textSecondary} />
                  </TouchableOpacity>
                </View>
                <Text style={typography.small}>Employee ID: {viewing.employee_id}</Text>
                <Text style={typography.small}>Email: {viewing.email || "—"}</Text>
                <Text style={typography.small}>Status: {viewing.status}</Text>

                {viewing.courses?.length ? (
                  <>
                    <Text style={[typography.label, { marginTop: 14 }]}>Courses</Text>
                    {viewing.courses.map((c, i) => (
                      <Text key={i} style={typography.body}>• {c}</Text>
                    ))}
                  </>
                ) : null}

                {viewing.id_photo_base64 && (
                  <>
                    <Text style={[typography.label, { marginTop: 14 }]}>ID Card Photo</Text>
                    <Image source={{ uri: `data:image/jpeg;base64,${viewing.id_photo_base64}` }}
                      style={s.bigPhoto} resizeMode="contain" />
                  </>
                )}

                {tab === "pending" ? (
                  <View style={{ flexDirection: "row", gap: 10, marginTop: 20 }}>
                    <TouchableOpacity testID="modal-reject" style={[shared.btnSecondary, { flex: 1 }]} onPress={() => reject(viewing)}>
                      <Text style={[shared.btnSecondaryText, { color: colors.absent }]}>Reject</Text>
                    </TouchableOpacity>
                    <TouchableOpacity testID="modal-approve" style={[shared.btnPrimary, { flex: 1 }]} onPress={() => approve(viewing)}>
                      <Text style={shared.btnPrimaryText}>Approve</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <TouchableOpacity testID="modal-delete" style={[shared.btnSecondary, { marginTop: 20 }]} onPress={() => delTeacher(viewing)}>
                    <Text style={[shared.btnSecondaryText, { color: colors.absent }]}>Delete Teacher</Text>
                  </TouchableOpacity>
                )}
              </ScrollView>
            </View>
          </View>
        </Modal>
      )}

      {editing && (
        <EditStudentModal student={editing} onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load(); }} />
      )}
    </SafeAreaView>
  );
}

function EditStudentModal({ student, onClose, onSaved }:
  { student: Student; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(student.name);
  const [email, setEmail] = useState(student.email || "");
  const [branch, setBranch] = useState(student.branch || "");
  const [sem, setSem] = useState(student.semester);
  const [div, setDiv] = useState(student.division);
  const [roll, setRoll] = useState(student.roll_number);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      await api.put(`/admin/students/${student.id}`, {
        name, email, branch, semester: sem, division: div, roll_number: roll,
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
            {[
              ["Name", name, setName, undefined],
              ["Email", email, setEmail, "email-address"],
              ["Branch", branch, setBranch, undefined],
              ["Semester", sem, setSem, "numeric"],
              ["Division", div, setDiv, undefined],
              ["Roll Number", roll, setRoll, "numeric"],
            ].map(([label, val, set, kb]: any) => (
              <View key={label}>
                <Text style={[shared.inputLabel, { marginTop: 14 }]}>{label}</Text>
                <TextInput style={shared.input} value={val} onChangeText={set} keyboardType={kb} autoCapitalize={kb ? "none" : "words"} />
              </View>
            ))}
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
  topBar: { flexDirection: "row", alignItems: "center", paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.sm },
  logoutBtn: { width: 40, height: 40, borderRadius: 10, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.border },
  tabs: { flexDirection: "row", marginHorizontal: spacing.lg, marginTop: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border },
  tab: { paddingVertical: 12, paddingHorizontal: 4, marginRight: 20 },
  tabActive: { borderBottomWidth: 2, borderBottomColor: colors.brand },
  tabText: { fontFamily: "Manrope_500Medium", color: colors.textSecondary, fontSize: 14 },
  tabTextActive: { color: colors.brand, fontFamily: "Manrope_600SemiBold" },
  teacherCard: { padding: 14, borderWidth: 1, borderColor: colors.border, borderRadius: 12, marginTop: 10, backgroundColor: "#fff" },
  idThumb: { width: 60, height: 60, borderRadius: 8, backgroundColor: "#EEE" },
  bigPhoto: { width: "100%", height: 260, backgroundColor: "#EEE", borderRadius: 8, marginTop: 8 },
  modalBg: { flex: 1, backgroundColor: "rgba(15,23,42,0.6)", justifyContent: "flex-end" },
  modalCard: { backgroundColor: "#fff", borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, maxHeight: "88%" },
  filterPill: { paddingVertical: 6, paddingHorizontal: 12, borderRadius: 999, borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: "#fff" },
  filterPillActive: { backgroundColor: colors.brand, borderColor: colors.brand },
  filterPillText: { fontFamily: "Manrope_500Medium", color: colors.text, fontSize: 13 },
  iconBtn: { padding: 8, borderRadius: 8, borderWidth: 1, borderColor: colors.border },
});
