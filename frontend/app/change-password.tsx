import { useState } from "react";
import { View, Text, TouchableOpacity, ActivityIndicator, Alert } from "react-native";
import { useRouter } from "expo-router";
import { api, formatApiError } from "../src/api";
import { useAuth } from "../src/AuthContext";
import { Header, Field, FormScreen, ErrorText } from "../src/ui";
import { shared, spacing, typography } from "../src/theme";

export default function ChangePassword() {
  const router = useRouter();
  const { refresh, user } = useAuth();
  const [current, setCurrent] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirm, setConfirm] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const first = !!user?.must_change_password;

  const submit = async () => {
    setErr(null);
    if (!current || !newPw) { setErr("Fill all fields"); return; }
    if (newPw.length < 6) { setErr("New password must be 6+ characters"); return; }
    if (newPw !== confirm) { setErr("Passwords don't match"); return; }
    setLoading(true);
    try {
      await api.post("/auth/change-password", { current_password: current, new_password: newPw });
      await refresh();
      Alert.alert("Password changed", "Your password has been updated.", [
        { text: "OK", onPress: () => router.replace(user?.role === "teacher" ? "/teacher/dashboard" : user?.role === "student" ? "/student/dashboard" : "/") },
      ]);
    } catch (e) { setErr(formatApiError(e)); }
    finally { setLoading(false); }
  };

  return (
    <FormScreen>
      <Header title="Change Password" back={!first}
        subtitle={first ? "First-time login: please set a new password" : "Update your account password"} />
      <Field label="Current Password" value={current} onChangeText={setCurrent} secureTextEntry testID="change-current" />
      <Field label="New Password" value={newPw} onChangeText={setNewPw} secureTextEntry testID="change-new" />
      <Field label="Confirm New" value={confirm} onChangeText={setConfirm} secureTextEntry testID="change-confirm" />
      <ErrorText message={err} />
      <TouchableOpacity
        testID="change-submit"
        style={[shared.btnPrimary, { marginTop: spacing.lg }]} onPress={submit} disabled={loading}
      >
        {loading ? <ActivityIndicator color="#fff" /> : <Text style={shared.btnPrimaryText}>Update Password</Text>}
      </TouchableOpacity>
    </FormScreen>
  );
}
