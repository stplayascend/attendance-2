import { useState } from "react";
import { Text, TouchableOpacity, View, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import { api, formatApiError } from "../../src/api";
import { useAuth } from "../../src/AuthContext";
import { Header, Field, FormScreen, ErrorText, PillToggle } from "../../src/ui";
import { shared, spacing } from "../../src/theme";

const SEMESTERS = ["1", "2", "3", "4", "5", "6", "7", "8"];
const DIVISIONS = ["A", "B", "C", "D"];
const BRANCHES = ["CSE", "ISE", "ECE", "EEE", "ME", "CV", "AIDS", "AIML"];

export default function StudentRegister() {
  const router = useRouter();
  const { setAuth } = useAuth();
  const [name, setName] = useState("");
  const [usn, setUsn] = useState("");
  const [roll, setRoll] = useState("");
  const [branch, setBranch] = useState("CSE");
  const [sem, setSem] = useState("5");
  const [div, setDiv] = useState("A");
  const [pw, setPw] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    setErr(null);
    if (!name || !usn || !roll || !pw) { setErr("Please fill required fields"); return; }
    if (pw.length < 6) { setErr("Password must be 6+ characters"); return; }
    setLoading(true);
    try {
      const { data } = await api.post("/auth/register-student", {
        name, usn, roll_number: roll, branch, semester: sem, division: div, password: pw,
      });
      await setAuth(data.token, data.user);
      router.replace("/student/face-capture");
    } catch (e) { setErr(formatApiError(e)); }
    finally { setLoading(false); }
  };

  return (
    <FormScreen>
      <Header title="Student Sign Up" subtitle="We'll register your face next" />
      <Field label="Full Name" value={name} onChangeText={setName}
        autoCapitalize="words" testID="student-name-input" />
      <Field label="USN" value={usn} onChangeText={(t) => setUsn(t.toUpperCase())}
        placeholder="e.g. 1AB20CS001" autoCapitalize="characters" testID="student-usn-input" />
      <Field label="Roll Number" value={roll} onChangeText={setRoll}
        keyboardType="numeric" testID="student-roll-input" />

      <View style={{ marginTop: spacing.md }}>
        <Text style={shared.inputLabel}>Branch</Text>
        <PillToggle options={BRANCHES} value={branch} onChange={setBranch} testID="student-branch-pills" />
      </View>
      <View style={{ marginTop: spacing.md }}>
        <Text style={shared.inputLabel}>Semester</Text>
        <PillToggle options={SEMESTERS} value={sem} onChange={setSem} testID="student-sem-pills" />
      </View>
      <View style={{ marginTop: spacing.md }}>
        <Text style={shared.inputLabel}>Division</Text>
        <PillToggle options={DIVISIONS} value={div} onChange={setDiv} testID="student-div-pills" />
      </View>

      <Field label="Password" value={pw} onChangeText={setPw} secureTextEntry testID="student-password-input" />
      <ErrorText message={err} />
      <TouchableOpacity
        testID="student-register-submit"
        style={[shared.btnPrimary, { marginTop: spacing.lg }]}
        onPress={submit} disabled={loading}
      >
        {loading ? <ActivityIndicator color="#fff" /> :
          <Text style={shared.btnPrimaryText}>Continue to Face Capture</Text>}
      </TouchableOpacity>
    </FormScreen>
  );
}
