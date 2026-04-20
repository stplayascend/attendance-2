import { useEffect, useState } from "react";
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView, Image,
  ActivityIndicator, Alert, Switch,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import * as FileSystem from "expo-file-system";
import * as Sharing from "expo-sharing";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Feather } from "@expo/vector-icons";
import { api, formatApiError } from "../../../src/api";
import { colors, spacing, typography, shared } from "../../../src/theme";
import { Header } from "../../../src/ui";

interface AttRow {
  student_id: string; name: string; usn: string; roll_number: string;
  status: "present" | "absent"; similarity?: number | null;
}
interface Student {
  id: string; name: string; usn: string; roll_number: string;
  branch?: string; face_registered: boolean;
}

export default function SessionDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [session, setSession] = useState<any>(null);
  const [images, setImages] = useState<string[]>([]);
  const [rows, setRows] = useState<AttRow[] | null>(null);
  const [recognizing, setRecognizing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [summary, setSummary] = useState<{ detected: number; matched: number; total: number } | null>(null);

  const load = async () => {
    try {
      const { data } = await api.get(`/sessions/${id}`);
      setSession(data);
      // For completed sessions, load existing attendance so teacher can edit.
      if (data.status === "completed") {
        const { data: studs } = await api.get(`/sessions/${id}/students`);
        const attMap: Record<string, string> = {};
        (data.attendance || []).forEach((e: any) => { attMap[e.student_id] = e.status; });
        const merged: AttRow[] = (studs as Student[]).map((s) => ({
          student_id: s.id, name: s.name, usn: s.usn,
          roll_number: s.roll_number,
          status: (attMap[s.id] as any) || "absent",
          similarity: null,
        }));
        merged.sort((a, b) => a.roll_number.localeCompare(b.roll_number));
        setRows(merged);
      }
    } catch (e) { Alert.alert("Error", formatApiError(e)); }
  };

  useEffect(() => { load(); }, [id]);

  const pickImages = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") { Alert.alert("Permission required"); return; }
    const res = await ImagePicker.launchImageLibraryAsync({
      allowsMultipleSelection: true, base64: true, quality: 0.6,
      mediaTypes: ImagePicker.MediaTypeOptions.Images, selectionLimit: 5,
    });
    if (res.canceled) return;
    const newImgs = res.assets.map((a) => a.base64!).filter(Boolean);
    setImages((p) => [...p, ...newImgs].slice(0, 5));
  };

  const takePhoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== "granted") { Alert.alert("Camera permission required"); return; }
    const res = await ImagePicker.launchCameraAsync({ base64: true, quality: 0.6 });
    if (res.canceled) return;
    const b64 = res.assets[0].base64;
    if (b64) setImages((p) => [...p, b64].slice(0, 5));
  };

  const removeImage = (idx: number) => setImages((p) => p.filter((_, i) => i !== idx));

  const runRecognize = async () => {
    if (!images.length) { Alert.alert("Capture at least 1 photo"); return; }
    setRecognizing(true);
    try {
      const { data } = await api.post(`/sessions/${id}/recognize`, {
        images_base64: images, threshold: 0.4,
      });
      setRows(data.attendance);
      setSummary({
        detected: data.total_faces_detected,
        matched: data.total_matched,
        total: data.total_students,
      });
    } catch (e) { Alert.alert("Recognition failed", formatApiError(e)); }
    finally { setRecognizing(false); }
  };

  const loadRosterManually = async () => {
    // Load class roster so teacher can take attendance without running recognition.
    try {
      const { data: studs } = await api.get(`/sessions/${id}/students`);
      const r: AttRow[] = (studs as Student[]).map((s) => ({
        student_id: s.id, name: s.name, usn: s.usn,
        roll_number: s.roll_number, status: "absent", similarity: null,
      }));
      r.sort((a, b) => a.roll_number.localeCompare(b.roll_number));
      setRows(r);
      setSummary({ detected: 0, matched: 0, total: r.length });
    } catch (e) { Alert.alert("Error", formatApiError(e)); }
  };

  const toggleStatus = (sid: string) => {
    setRows((prev) => prev?.map((r) =>
      r.student_id === sid
        ? { ...r, status: r.status === "present" ? "absent" : "present" }
        : r
    ) ?? null);
  };

  const save = async () => {
    if (!rows) return;
    setSaving(true);
    try {
      await api.post(`/sessions/${id}/save-attendance`, {
        entries: rows.map((r) => ({ student_id: r.student_id, status: r.status })),
      });
      Alert.alert("Saved", "Attendance saved & students notified.", [
        { text: "OK", onPress: () => router.replace("/teacher/dashboard") },
      ]);
    } catch (e) { Alert.alert("Save failed", formatApiError(e)); }
    finally { setSaving(false); }
  };

  const reopen = async () => {
    try {
      await api.put(`/sessions/${id}/reopen`);
      await load();
      Alert.alert("Session reopened", "You can edit attendance; remember to save.");
    } catch (e) { Alert.alert("Error", formatApiError(e)); }
  };

  const exportCsv = async () => {
    setExporting(true);
    try {
      const base = process.env.EXPO_PUBLIC_BACKEND_URL;
      const token = await AsyncStorage.getItem("auth_token");
      const url = `${base}/api/sessions/${id}/export`;
      const filename = `attendance_${session?.lecture?.replace(/\s+/g, "_")}_${session?.date}.csv`;
      const dest = FileSystem.documentDirectory + filename;
      const res = await FileSystem.downloadAsync(url, dest, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(res.uri, {
          mimeType: "text/csv", dialogTitle: "Share Attendance CSV",
        });
      } else {
        Alert.alert("Saved", `CSV saved to: ${res.uri}`);
      }
    } catch (e: any) {
      Alert.alert("Export failed", e?.message || "Could not export CSV");
    } finally { setExporting(false); }
  };

  if (!session) {
    return (
      <SafeAreaView style={[shared.screen, { alignItems: "center", justifyContent: "center" }]}>
        <ActivityIndicator color={colors.brand} />
      </SafeAreaView>
    );
  }

  const isCompleted = session.status === "completed";
  const presentCount = rows?.filter((r) => r.status === "present").length ?? 0;

  return (
    <SafeAreaView style={shared.screen}>
      <View style={{ paddingHorizontal: spacing.lg }}>
        <Header
          title={session.lecture}
          subtitle={`Sem ${session.semester} · Div ${session.division} · ${session.date} · ${session.time_from}–${session.time_to}`}
          right={isCompleted ? (
            <View style={[s.statusBadge, { backgroundColor: "#D1FAE5" }]}>
              <Text style={{ color: colors.present, fontFamily: "Manrope_600SemiBold", fontSize: 11 }}>COMPLETED</Text>
            </View>
          ) : null}
        />
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: 140 }}>
        {!rows ? (
          <>
            <Text style={[typography.label, { marginTop: spacing.md }]}>Classroom photos ({images.length}/5)</Text>
            <View style={s.thumbs}>
              {images.map((b64, i) => (
                <View key={i} style={s.thumbWrap}>
                  <Image source={{ uri: `data:image/jpeg;base64,${b64}` }} style={s.thumb} />
                  <TouchableOpacity testID={`remove-img-${i}`} style={s.removeBtn} onPress={() => removeImage(i)}>
                    <Feather name="x" size={14} color="#fff" />
                  </TouchableOpacity>
                </View>
              ))}
              {images.length < 5 && (
                <>
                  <TouchableOpacity testID="take-photo-btn" style={s.addTile} onPress={takePhoto}>
                    <Feather name="camera" size={22} color={colors.brand} />
                    <Text style={s.addTileText}>Camera</Text>
                  </TouchableOpacity>
                  <TouchableOpacity testID="pick-photo-btn" style={s.addTile} onPress={pickImages}>
                    <Feather name="image" size={22} color={colors.brand} />
                    <Text style={s.addTileText}>Gallery</Text>
                  </TouchableOpacity>
                </>
              )}
            </View>

            <TouchableOpacity
              testID="run-recognize-btn"
              style={[shared.btnPrimary, { marginTop: spacing.lg, opacity: images.length ? 1 : 0.5 }]}
              disabled={!images.length || recognizing}
              onPress={runRecognize}
            >
              {recognizing ? <ActivityIndicator color="#fff" /> :
                <Text style={shared.btnPrimaryText}>Run Face Recognition</Text>}
            </TouchableOpacity>

            <TouchableOpacity testID="manual-roster-btn" onPress={loadRosterManually} style={{ alignItems: "center", paddingVertical: 14 }}>
              <Text style={{ color: colors.brand, fontFamily: "Manrope_600SemiBold" }}>
                Or take attendance manually →
              </Text>
            </TouchableOpacity>
          </>
        ) : (
          <>
            {summary && (
              <View style={s.summaryCard}>
                <View style={s.summaryItem}>
                  <Text style={s.summaryNum}>{summary.detected}</Text>
                  <Text style={typography.small}>Detected</Text>
                </View>
                <View style={s.summaryDivider} />
                <View style={s.summaryItem}>
                  <Text style={[s.summaryNum, { color: colors.present }]}>{presentCount}</Text>
                  <Text style={typography.small}>Present</Text>
                </View>
                <View style={s.summaryDivider} />
                <View style={s.summaryItem}>
                  <Text style={s.summaryNum}>{summary.total}</Text>
                  <Text style={typography.small}>Total</Text>
                </View>
              </View>
            )}

            <Text style={[typography.label, { marginTop: spacing.md }]}>Review & edit</Text>
            {rows.length === 0 ? (
              <Text style={[typography.bodyMuted, { marginTop: 12 }]}>
                No students enrolled in Sem {session.semester} Div {session.division}.
              </Text>
            ) : (
              rows.map((r) => (
                <View key={r.student_id} style={s.row} testID={`att-row-${r.usn}`}>
                  <View style={{ flex: 1 }}>
                    <Text style={typography.body}>{r.name}</Text>
                    <Text style={typography.small}>
                      {r.usn} · Roll {r.roll_number}
                      {r.similarity != null ? ` · sim ${r.similarity.toFixed(2)}` : ""}
                    </Text>
                  </View>
                  <Text style={[s.badge,
                    r.status === "present" ? { color: colors.present } : { color: colors.absent }]}>
                    {r.status.toUpperCase()}
                  </Text>
                  <Switch
                    testID={`toggle-${r.usn}`}
                    value={r.status === "present"}
                    onValueChange={() => toggleStatus(r.student_id)}
                    trackColor={{ false: "#E5E7EB", true: "#86EFAC" }}
                    thumbColor={r.status === "present" ? colors.present : colors.absent}
                  />
                </View>
              ))
            )}

            {isCompleted && (
              <TouchableOpacity
                testID="export-csv-btn"
                style={[shared.btnSecondary, { marginTop: spacing.lg }]}
                onPress={exportCsv}
                disabled={exporting}
              >
                <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
                  {exporting ? <ActivityIndicator color={colors.text} size="small" /> :
                    <Feather name="download" size={16} color={colors.text} />}
                  <Text style={shared.btnSecondaryText}>Export CSV</Text>
                </View>
              </TouchableOpacity>
            )}
          </>
        )}
      </ScrollView>

      {rows && rows.length > 0 && (
        <View style={s.bottomBar}>
          <TouchableOpacity testID="save-attendance-btn" style={shared.btnPrimary} onPress={save} disabled={saving}>
            {saving ? <ActivityIndicator color="#fff" /> :
              <Text style={shared.btnPrimaryText}>
                {isCompleted ? "Save Changes" : "Save Attendance"} ({presentCount}/{rows.length})
              </Text>}
          </TouchableOpacity>
        </View>
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  statusBadge: { paddingVertical: 4, paddingHorizontal: 10, borderRadius: 999 },
  thumbs: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 12 },
  thumbWrap: { position: "relative" },
  thumb: { width: 90, height: 90, borderRadius: 10, backgroundColor: "#EEE" },
  removeBtn: { position: "absolute", top: -6, right: -6, width: 22, height: 22, borderRadius: 11, backgroundColor: colors.absent, alignItems: "center", justifyContent: "center" },
  addTile: {
    width: 90, height: 90, borderRadius: 10, borderWidth: 2, borderColor: colors.border,
    borderStyle: "dashed", alignItems: "center", justifyContent: "center", gap: 4,
    backgroundColor: colors.bgSecondary,
  },
  addTileText: { fontSize: 11, color: colors.brand, fontFamily: "Manrope_600SemiBold" },
  summaryCard: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-around",
    backgroundColor: colors.bgSecondary, borderRadius: 12, padding: 16, marginTop: 12,
    borderWidth: 1, borderColor: colors.border,
  },
  summaryItem: { alignItems: "center" },
  summaryNum: { fontFamily: "Outfit_700Bold", fontSize: 24, color: colors.text },
  summaryDivider: { width: 1, height: 32, backgroundColor: colors.border },
  row: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colors.border },
  badge: { fontFamily: "Manrope_600SemiBold", fontSize: 11, letterSpacing: 0.8 },
  bottomBar: {
    position: "absolute", left: 0, right: 0, bottom: 0,
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
    backgroundColor: "#fff", borderTopWidth: 1, borderTopColor: colors.border,
  },
});
