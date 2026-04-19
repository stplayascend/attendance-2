import { useState } from "react";
import { View, Text, TouchableOpacity, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import { api, formatApiError } from "../../src/api";
import { useAuth } from "../../src/AuthContext";
import { Header, Field, FormScreen, ErrorText } from "../../src/ui";
import { shared, spacing } from "../../src/theme";

export default function TeacherRegister() {
  const router = useRouter();
  const { setAuth } = useAuth();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [subject, setSubject] = useState("");
  const [pw, setPw] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    setErr(null);
    if (!name || !email || !pw) { setErr("Please fill required fields"); return; }
    if (pw.length < 6) { setErr("Password must be 6+ characters"); return; }
    setLoading(true);
    try {
      const { data } = await api.post("/auth/register-teacher",
        { name, email, password: pw, subject });
      await setAuth(data.token, data.user);
      router.replace("/teacher/dashboard");
    } catch (e) { setErr(formatApiError(e)); }
    finally { setLoading(false); }
  };

  return (
    <FormScreen>
      <Header title="Teacher Sign Up" subtitle="Create your teaching account" />
      <Field label="Full Name" value={name} onChangeText={setName}
        autoCapitalize="words" testID="teacher-name-input" />
      <Field label="Email" value={email} onChangeText={setEmail}
        keyboardType="email-address" testID="teacher-email-input" />
      <Field label="Subject (optional)" value={subject} onChangeText={setSubject}
        autoCapitalize="words" testID="teacher-subject-input" />
      <Field label="Password" value={pw} onChangeText={setPw} secureTextEntry testID="teacher-password-input" />
      <ErrorText message={err} />
      <TouchableOpacity
        testID="teacher-register-submit"
        style={[shared.btnPrimary, { marginTop: spacing.lg }]}
        onPress={submit} disabled={loading}
      >
        {loading ? <ActivityIndicator color="#fff" /> : <Text style={shared.btnPrimaryText}>Create Account</Text>}
      </TouchableOpacity>
    </FormScreen>
  );
}
