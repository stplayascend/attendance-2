import { useState } from "react";
import { Text, TouchableOpacity, View, ActivityIndicator, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { api, formatApiError } from "../../src/api";
import { useAuth } from "../../src/AuthContext";
import { Header, Field, FormScreen, ErrorText, PillToggle } from "../../src/ui";
import { shared, spacing, typography, colors } from "../../src/theme";

const SEMESTERS = ["1", "2", "3", "4", "5", "6", "7", "8"];
const DIVISIONS = ["A", "B", "C", "D"];

export default function CreateSession() {
  const router = useRouter();
  const { user } = useAuth();
  const courses = user?.courses || [];
  const [semester, setSemester] = useState("5");
  const [division, setDivision] = useState("A");
  const [lecture, setLecture] = useState(courses[0] || "");
  const [from, setFrom] = useState("10:00");
  const [to, setTo] = useState("11:00");
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    setErr(null);
    if (!lecture) { setErr("Select a course"); return; }
    const timeRe = /^([01]?\d|2[0-3]):[0-5]\d$/;
    if (!timeRe.test(from) || !timeRe.test(to)) { setErr("Time must be HH:MM"); return; }
    setLoading(true);
    try {
      const { data } = await api.post("/sessions", {
        semester, division, lecture, time_from: from, time_to: to,
      });
      router.replace(`/teacher/session/${data.id}`);
    } catch (e) { setErr(formatApiError(e)); }
    finally { setLoading(false); }
  };

  return (
    <FormScreen>
      <Header title="Create Session" subtitle="Set class details, then capture photos" />

      <View style={{ marginTop: spacing.md }}>
        <Text style={shared.inputLabel}>Semester</Text>
        <PillToggle options={SEMESTERS} value={semester} onChange={setSemester} testID="semester-pills" />
      </View>
      <View style={{ marginTop: spacing.md }}>
        <Text style={shared.inputLabel}>Division</Text>
        <PillToggle options={DIVISIONS} value={division} onChange={setDivision} testID="division-pills" />
      </View>

      <View style={{ marginTop: spacing.md }}>
        <Text style={shared.inputLabel}>Course / Lecture</Text>
        {courses.length === 0 ? (
          <View style={s.emptyCourses}>
            <Text style={typography.small}>You haven't added any courses yet. Go to Dashboard → My Courses to add.</Text>
          </View>
        ) : (
          <View style={s.radios}>
            {courses.map((c) => (
              <TouchableOpacity key={c} testID={`lecture-${c}`}
                style={[s.radio, lecture === c && s.radioActive]}
                onPress={() => setLecture(c)}>
                <View style={[s.dot, lecture === c && s.dotActive]} />
                <Text style={[s.radioText, lecture === c && { color: colors.brand, fontFamily: "Manrope_600SemiBold" }]}>{c}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </View>

      <View style={{ flexDirection: "row", gap: 12 }}>
        <View style={{ flex: 1 }}>
          <Field label="Time From" value={from} onChangeText={setFrom}
            placeholder="HH:MM" testID="time-from-input" />
        </View>
        <View style={{ flex: 1 }}>
          <Field label="Time To" value={to} onChangeText={setTo}
            placeholder="HH:MM" testID="time-to-input" />
        </View>
      </View>

      <Text style={[typography.small, { marginTop: spacing.md }]}>Date will be auto-set to today.</Text>
      <ErrorText message={err} />

      <TouchableOpacity testID="create-session-submit"
        style={[shared.btnPrimary, { marginTop: spacing.lg }]}
        onPress={submit} disabled={loading || !courses.length}>
        {loading ? <ActivityIndicator color="#fff" /> :
          <Text style={shared.btnPrimaryText}>Create & Continue</Text>}
      </TouchableOpacity>
    </FormScreen>
  );
}

const s = StyleSheet.create({
  emptyCourses: { padding: 14, backgroundColor: "#FEF3C7", borderRadius: 10, marginTop: 8 },
  radios: { marginTop: 8, gap: 8 },
  radio: {
    flexDirection: "row", alignItems: "center", gap: 10,
    padding: 14, borderWidth: 1, borderColor: colors.borderStrong, borderRadius: 12,
    backgroundColor: "#fff",
  },
  radioActive: { borderColor: colors.brand, backgroundColor: "#EFF6FF" },
  dot: { width: 18, height: 18, borderRadius: 9, borderWidth: 2, borderColor: colors.borderStrong },
  dotActive: { borderColor: colors.brand, backgroundColor: colors.brand },
  radioText: { color: colors.text, fontSize: 15, fontFamily: "Manrope_500Medium" },
});
