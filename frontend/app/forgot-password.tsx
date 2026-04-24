import { useState } from "react";
import { View, Text, TouchableOpacity, ActivityIndicator, Alert } from "react-native";
import { useRouter } from "expo-router";
import { api, formatApiError } from "../src/api";
import { Header, Field, FormScreen, ErrorText } from "../src/ui";
import { shared, spacing, typography, colors } from "../src/theme";

export default function ForgotPassword() {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2>(1);
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [pw, setPw] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const sendOtp = async () => {
    setErr(null);
    if (!email) { setErr("Enter your email"); return; }
    setLoading(true);
    try {
      await api.post("/auth/forgot-password", { email });
      setStep(2);
    } catch (e) { setErr(formatApiError(e)); }
    finally { setLoading(false); }
  };

  const reset = async () => {
    setErr(null);
    if (!otp || otp.length < 6) { setErr("Enter the 6-digit code"); return; }
    if (pw.length < 6) { setErr("Password must be 6+ characters"); return; }
    setLoading(true);
    try {
      await api.post("/auth/reset-password", { email, otp, new_password: pw });
      Alert.alert("Password reset", "You can now log in with the new password.", [
        { text: "OK", onPress: () => router.replace("/login") },
      ]);
    } catch (e) { setErr(formatApiError(e)); }
    finally { setLoading(false); }
  };

  return (
    <FormScreen>
      <Header title={step === 1 ? "Forgot Password" : "Reset Password"}
        subtitle={step === 1 ? "Enter the email you registered with"
          : "Check your email for a 6-digit code"} />

      {step === 1 ? (
        <>
          <Field label="Email" value={email} onChangeText={setEmail}
            keyboardType="email-address" testID="forgot-email-input" />
          <ErrorText message={err} />
          <TouchableOpacity
            testID="forgot-send-otp"
            style={[shared.btnPrimary, { marginTop: spacing.lg }]} onPress={sendOtp} disabled={loading}
          >
            {loading ? <ActivityIndicator color="#fff" /> :
              <Text style={shared.btnPrimaryText}>Send Code</Text>}
          </TouchableOpacity>
        </>
      ) : (
        <>
          <Text style={[typography.small, { marginTop: spacing.md }]}>
            Code sent to <Text style={{ color: colors.text, fontFamily: "Manrope_600SemiBold" }}>{email}</Text>
          </Text>
          <Field label="6-digit code" value={otp} onChangeText={setOtp}
            keyboardType="number-pad" testID="forgot-otp-input" />
          <Field label="New Password" value={pw} onChangeText={setPw} secureTextEntry testID="forgot-new-password" />
          <ErrorText message={err} />
          <TouchableOpacity
            testID="forgot-reset-submit"
            style={[shared.btnPrimary, { marginTop: spacing.lg }]} onPress={reset} disabled={loading}
          >
            {loading ? <ActivityIndicator color="#fff" /> :
              <Text style={shared.btnPrimaryText}>Reset Password</Text>}
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setStep(1)} style={{ alignItems: "center", marginTop: spacing.md }}>
            <Text style={{ color: colors.textSecondary }}>Didn't get it? Resend</Text>
          </TouchableOpacity>
        </>
      )}
    </FormScreen>
  );
}
