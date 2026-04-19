import { useState } from "react";
import { Text, TouchableOpacity, View, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import { api, formatApiError } from "../../src/api";
import { Header, Field, FormScreen, ErrorText, PillToggle } from "../../src/ui";
import { shared, spacing, typography } from "../../src/theme";

const SEMESTERS = ["1", "2", "3", "4", "5", "6", "7", "8"];
const DIVISIONS = ["A", "B", "C", "D"];

export default function CreateSession() {
  const router = useRouter();
  const [semester, setSemester] = useState("5");
  const [division, setDivision] = useState("A");
  const [lecture, setLecture] = useState("");
  const [from, setFrom] = useState("10:00");
  const [to, setTo] = useState("11:00");
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    setErr(null);
    if (!lecture) { setErr("Lecture name required"); return; }
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

      <Field label="Lecture / Subject" value={lecture} onChangeText={setLecture}
        placeholder="e.g. Machine Learning" autoCapitalize="words" testID="lecture-input" />

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

      <Text style={[typography.small, { marginTop: spacing.md }]}>
        Date will be auto-set to today.
      </Text>

      <ErrorText message={err} />

      <TouchableOpacity
        testID="create-session-submit"
        style={[shared.btnPrimary, { marginTop: spacing.lg }]}
        onPress={submit} disabled={loading}
      >
        {loading ? <ActivityIndicator color="#fff" /> :
          <Text style={shared.btnPrimaryText}>Create & Continue</Text>}
      </TouchableOpacity>
    </FormScreen>
  );
}
