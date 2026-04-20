import { useState } from "react";
import {
  View, Text, TouchableOpacity, ActivityIndicator, StyleSheet, Image, Alert,
} from "react-native";
import { useRouter } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import { Feather } from "@expo/vector-icons";
import { api, formatApiError } from "../src/api";
import { Header, Field, FormScreen, ErrorText } from "../src/ui";
import { shared, spacing, typography, colors } from "../src/theme";

export default function TeacherRegister() {
  const router = useRouter();
  const [empId, setEmpId] = useState("");
  const [name, setName] = useState("");
  const [photo, setPhoto] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const pickPhoto = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") { Alert.alert("Photos permission required"); return; }
    const res = await ImagePicker.launchImageLibraryAsync({
      base64: true, quality: 0.6, mediaTypes: ImagePicker.MediaTypeOptions.Images,
    });
    if (res.canceled) return;
    setPhoto(res.assets[0].base64 ?? null);
  };

  const takePhoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== "granted") { Alert.alert("Camera permission required"); return; }
    const res = await ImagePicker.launchCameraAsync({ base64: true, quality: 0.6 });
    if (res.canceled) return;
    setPhoto(res.assets[0].base64 ?? null);
  };

  const submit = async () => {
    setErr(null);
    if (!empId || !name || !photo) { setErr("All fields including ID photo are required"); return; }
    setLoading(true);
    try {
      await api.post("/auth/register-teacher-request", {
        employee_id: empId, name, id_photo_base64: photo,
      });
      setDone(true);
    } catch (e) { setErr(formatApiError(e)); }
    finally { setLoading(false); }
  };

  if (done) {
    return (
      <FormScreen>
        <Header title="Submitted" />
        <View style={s.doneBox}>
          <Feather name="check-circle" size={56} color={colors.present} />
          <Text style={[typography.h2, { marginTop: 12 }]}>Request submitted</Text>
          <Text style={[typography.bodyMuted, { textAlign: "center", marginTop: 8 }]}>
            Your teacher registration is pending admin approval. You'll be able to log in
            with your Employee ID and assigned password once approved.
          </Text>
          <TouchableOpacity
            testID="go-login"
            style={[shared.btnPrimary, { marginTop: spacing.xl, alignSelf: "stretch" }]}
            onPress={() => router.replace("/login")}
          >
            <Text style={shared.btnPrimaryText}>Back to Login</Text>
          </TouchableOpacity>
        </View>
      </FormScreen>
    );
  }

  return (
    <FormScreen>
      <Header title="Register as Teacher" subtitle="Admin will approve your account" />

      <Field label="Employee ID" value={empId} onChangeText={(t) => setEmpId(t.toUpperCase())}
        placeholder="e.g. EMP-2025-001" autoCapitalize="characters" testID="teacher-empid-input" />
      <Field label="Full Name" value={name} onChangeText={setName}
        autoCapitalize="words" testID="teacher-name-input" />

      <View style={{ marginTop: spacing.md }}>
        <Text style={shared.inputLabel}>ID Card Photo (proof)</Text>
        {photo ? (
          <Image source={{ uri: `data:image/jpeg;base64,${photo}` }} style={s.photo} />
        ) : (
          <View style={s.photoPlaceholder}>
            <Feather name="credit-card" size={48} color={colors.borderStrong} />
            <Text style={[typography.small, { marginTop: 8, textAlign: "center" }]}>
              Upload a clear photo of your Employee ID card
            </Text>
          </View>
        )}
        <View style={{ flexDirection: "row", gap: 10, marginTop: 10 }}>
          <TouchableOpacity testID="teacher-idcard-camera" style={[shared.btnSecondary, { flex: 1 }]} onPress={takePhoto}>
            <View style={{ flexDirection: "row", gap: 6, alignItems: "center" }}>
              <Feather name="camera" size={16} color={colors.text} />
              <Text style={shared.btnSecondaryText}>Camera</Text>
            </View>
          </TouchableOpacity>
          <TouchableOpacity testID="teacher-idcard-gallery" style={[shared.btnSecondary, { flex: 1 }]} onPress={pickPhoto}>
            <View style={{ flexDirection: "row", gap: 6, alignItems: "center" }}>
              <Feather name="image" size={16} color={colors.text} />
              <Text style={shared.btnSecondaryText}>Gallery</Text>
            </View>
          </TouchableOpacity>
        </View>
      </View>

      <ErrorText message={err} />

      <TouchableOpacity
        testID="teacher-register-submit"
        style={[shared.btnPrimary, { marginTop: spacing.lg }]}
        onPress={submit} disabled={loading}
      >
        {loading ? <ActivityIndicator color="#fff" /> :
          <Text style={shared.btnPrimaryText}>Submit for Approval</Text>}
      </TouchableOpacity>
    </FormScreen>
  );
}

const s = StyleSheet.create({
  photo: {
    width: "100%", height: 220, borderRadius: 12, backgroundColor: "#EEE",
    resizeMode: "cover",
  },
  photoPlaceholder: {
    height: 220, borderRadius: 12, backgroundColor: colors.bgSecondary,
    borderWidth: 2, borderColor: colors.border, borderStyle: "dashed",
    alignItems: "center", justifyContent: "center", padding: 16,
  },
  doneBox: {
    flex: 1, paddingTop: spacing.xxl, alignItems: "center", paddingHorizontal: spacing.md,
  },
});
