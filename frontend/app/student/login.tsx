import { useState } from "react";
import { Text, TouchableOpacity, View, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import { api, formatApiError } from "../../src/api";
import { useAuth } from "../../src/AuthContext";
import { Header, Field, FormScreen, ErrorText } from "../../src/ui";
import { shared, spacing, typography, colors } from "../../src/theme";

export default function StudentLogin() {
  const router = useRouter();
  const { setAuth } = useAuth();
  const [usn, setUsn] = useState("");
  const [pw, setPw] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    setErr(null);
    if (!usn || !pw) { setErr("Enter USN and password"); return; }
    setLoading(true);
    try {
      const { data } = await api.post("/auth/login-student", { usn, password: pw });
      await setAuth(data.token, data.user);
      if (!data.user.face_registered) router.replace("/student/face-capture");
      else router.replace("/student/dashboard");
    } catch (e) { setErr(formatApiError(e)); }
    finally { setLoading(false); }
  };

  return (
    <FormScreen>
      <Header title="Student Login" subtitle="Sign in with your USN" />
      <Field label="USN" value={usn} onChangeText={(t) => setUsn(t.toUpperCase())}
        placeholder="e.g. 1AB20CS001" autoCapitalize="characters" testID="student-usn-input" />
      <Field label="Password" value={pw} onChangeText={setPw} secureTextEntry testID="student-password-input" />
      <ErrorText message={err} />
      <TouchableOpacity
        testID="student-login-submit"
        style={[shared.btnPrimary, { marginTop: spacing.lg }]}
        onPress={submit} disabled={loading}
      >
        {loading ? <ActivityIndicator color="#fff" /> : <Text style={shared.btnPrimaryText}>Log In</Text>}
      </TouchableOpacity>
      <TouchableOpacity
        testID="student-register-link"
        style={{ alignItems: "center", marginTop: spacing.lg }}
        onPress={() => router.push("/student/register")}
      >
        <Text style={typography.bodyMuted}>
          New student? <Text style={{ color: colors.brand, fontFamily: "Manrope_600SemiBold" }}>Register</Text>
        </Text>
      </TouchableOpacity>
    </FormScreen>
  );
}
