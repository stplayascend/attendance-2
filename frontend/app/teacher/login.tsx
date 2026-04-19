import { useState } from "react";
import { View, Text, TouchableOpacity, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import { api, formatApiError } from "../../src/api";
import { useAuth } from "../../src/AuthContext";
import { Header, Field, FormScreen, ErrorText } from "../../src/ui";
import { shared, spacing, typography, colors } from "../../src/theme";

export default function TeacherLogin() {
  const router = useRouter();
  const { setAuth } = useAuth();
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    setErr(null);
    if (!email || !pw) { setErr("Enter email and password"); return; }
    setLoading(true);
    try {
      const { data } = await api.post("/auth/login-teacher", { email, password: pw });
      await setAuth(data.token, data.user);
      router.replace("/teacher/dashboard");
    } catch (e) { setErr(formatApiError(e)); }
    finally { setLoading(false); }
  };

  return (
    <FormScreen>
      <Header title="Teacher Login" subtitle="Sign in to manage attendance" />
      <Field label="Email" value={email} onChangeText={setEmail} placeholder="you@school.edu"
        keyboardType="email-address" testID="teacher-email-input" />
      <Field label="Password" value={pw} onChangeText={setPw} secureTextEntry testID="teacher-password-input" />
      <ErrorText message={err} />
      <TouchableOpacity
        testID="teacher-login-submit"
        style={[shared.btnPrimary, { marginTop: spacing.lg }]}
        onPress={submit} disabled={loading}
      >
        {loading ? <ActivityIndicator color="#fff" /> : <Text style={shared.btnPrimaryText}>Log In</Text>}
      </TouchableOpacity>
      <TouchableOpacity
        testID="teacher-register-link"
        style={{ alignItems: "center", marginTop: spacing.lg }}
        onPress={() => router.push("/teacher/register")}
      >
        <Text style={typography.bodyMuted}>
          New teacher? <Text style={{ color: colors.brand, fontFamily: "Manrope_600SemiBold" }}>Create account</Text>
        </Text>
      </TouchableOpacity>
    </FormScreen>
  );
}
