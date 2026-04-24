import { useState } from "react";
import {
  View, Text, TouchableOpacity, ActivityIndicator, Image, StyleSheet,
} from "react-native";
import { useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { api, formatApiError } from "../src/api";
import { useAuth } from "../src/AuthContext";
import { Field, FormScreen, ErrorText } from "../src/ui";
import { shared, spacing, typography, colors } from "../src/theme";

const HERO = "https://static.prod-images.emergentagent.com/jobs/09880b46-2e59-486f-86df-a17b3b81cf29/images/4ec27b0585566d48c63e9f72a5226b9267ea8bd67a7d47e05ae6cbf7c346c3e5.png";

export default function Login() {
  const router = useRouter();
  const { setAuth } = useAuth();
  const [identifier, setIdentifier] = useState("");
  const [pw, setPw] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    setErr(null);
    if (!identifier || !pw) { setErr("Enter your ID and password"); return; }
    setLoading(true);
    try {
      const { data } = await api.post("/auth/login", { identifier: identifier.trim(), password: pw });
      await setAuth(data.token, data.user);
      if (data.user.role === "admin") router.replace("/admin/dashboard");
      else if (data.user.role === "teacher") {
        if (data.user.must_change_password) router.replace("/change-password");
        else router.replace("/teacher/dashboard");
      } else {
        if (!data.user.face_registered) router.replace("/student/face-capture");
        else router.replace("/student/dashboard");
      }
    } catch (e) { setErr(formatApiError(e)); }
    finally { setLoading(false); }
  };

  return (
    <FormScreen>
      <View style={s.heroWrap}>
        <Image source={{ uri: HERO }} style={s.hero} resizeMode="contain" />
      </View>
      <Text style={typography.label}>AI Attendance</Text>
      <Text style={[typography.h1, { marginTop: 4 }]}>Sign in</Text>
      <Text style={[typography.bodyMuted, { marginTop: 6 }]}>
        USN (student) · Employee ID (teacher) · adminpannel (admin)
      </Text>

      <Field label="USN / Employee ID" value={identifier} onChangeText={setIdentifier}
        placeholder="e.g. 1AB20CS001" autoCapitalize="characters" testID="login-id-input" />
      <Field label="Password" value={pw} onChangeText={setPw} secureTextEntry testID="login-password-input" />

      <TouchableOpacity testID="link-forgot" onPress={() => router.push("/forgot-password")}
        style={{ alignSelf: "flex-end", marginTop: 4 }}>
        <Text style={s.linkSmall}>Forgot password?</Text>
      </TouchableOpacity>

      <ErrorText message={err} />

      <TouchableOpacity testID="login-submit"
        style={[shared.btnPrimary, { marginTop: spacing.lg }]} onPress={submit} disabled={loading}
      >
        {loading ? <ActivityIndicator color="#fff" /> : <Text style={shared.btnPrimaryText}>Log In</Text>}
      </TouchableOpacity>

      <View style={s.linkRow}>
        <TouchableOpacity testID="link-student-register" onPress={() => router.push("/student/register")}>
          <Text style={s.link}><Feather name="user-plus" size={14} color={colors.brand} /> Student Sign Up</Text>
        </TouchableOpacity>
        <TouchableOpacity testID="link-teacher-register" onPress={() => router.push("/teacher-register")}>
          <Text style={s.link}><Feather name="briefcase" size={14} color={colors.brand} /> Register as Teacher</Text>
        </TouchableOpacity>
      </View>
    </FormScreen>
  );
}

const s = StyleSheet.create({
  heroWrap: { alignItems: "center", marginTop: spacing.md },
  hero: { width: "75%", height: 160 },
  linkRow: { flexDirection: "row", justifyContent: "space-between", marginTop: spacing.xl, paddingHorizontal: 8 },
  link: { color: colors.brand, fontFamily: "Manrope_600SemiBold", fontSize: 14 },
  linkSmall: { color: colors.brand, fontFamily: "Manrope_500Medium", fontSize: 13 },
});
