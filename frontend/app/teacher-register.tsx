import { useState } from "react";
import {
  View, Text, TouchableOpacity, ActivityIndicator, StyleSheet, Image, Alert, TextInput,
} from "react-native";
import { useRouter } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import { Feather } from "@expo/vector-icons";
import { api, formatApiError } from "../src/api";
import { Header, Field, FormScreen, ErrorText } from "../src/ui";
import { shared, spacing, typography, colors } from "../src/theme";

export default function TeacherRegister() {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2 | 3>(1);

  // step 1 — basic
  const [empId, setEmpId] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");

  // step 2 — courses
  const [numCourses, setNumCourses] = useState("3");
  const [courses, setCourses] = useState<string[]>(["", "", ""]);

  // step 3 — photo
  const [photo, setPhoto] = useState<string | null>(null);

  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const next1 = () => {
    setErr(null);
    if (!empId || !name || !email) { setErr("Fill all fields"); return; }
    setStep(2);
  };

  const applyNumCourses = (val: string) => {
    setNumCourses(val);
    const n = parseInt(val, 10);
    if (!isNaN(n) && n >= 1 && n <= 20) {
      setCourses((prev) => {
        const arr = Array.from({ length: n }, (_, i) => prev[i] ?? "");
        return arr;
      });
    }
  };

  const next2 = () => {
    setErr(null);
    const filled = courses.filter((c) => c.trim()).length;
    if (filled === 0) { setErr("Enter at least one course"); return; }
    setStep(3);
  };

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
    if (!photo) { setErr("ID photo is required"); return; }
    setLoading(true);
    try {
      await api.post("/auth/register-teacher-request", {
        employee_id: empId, name, email,
        courses: courses.filter((c) => c.trim()),
        id_photo_base64: photo,
      });
      setDone(true);
    } catch (e) { setErr(formatApiError(e)); }
    finally { setLoading(false); }
  };

  if (done) {
    return (
      <FormScreen>
        <Header title="Submitted" back={false} />
        <View style={s.doneBox}>
          <Feather name="check-circle" size={56} color={colors.present} />
          <Text style={[typography.h2, { marginTop: 12 }]}>Request submitted</Text>
          <Text style={[typography.bodyMuted, { textAlign: "center", marginTop: 8 }]}>
            Your registration is pending admin approval. You'll receive an email at
            {"\n"}{email}{"\n"}when approved, with your default password (Teacher@123).
            You'll be asked to change it on first login.
          </Text>
          <TouchableOpacity
            testID="go-login" style={[shared.btnPrimary, { marginTop: spacing.xl, alignSelf: "stretch" }]}
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
      <Header title={`Teacher Registration · Step ${step} of 3`} subtitle={
        step === 1 ? "Basic info" : step === 2 ? "Courses you teach" : "ID proof"
      } />

      {step === 1 && (
        <>
          <Field label="Employee ID" value={empId}
            onChangeText={(t) => setEmpId(t.toUpperCase())}
            autoCapitalize="characters" testID="teacher-empid-input" />
          <Field label="Full Name" value={name} onChangeText={setName} autoCapitalize="words" testID="teacher-name-input" />
          <Field label="Email" value={email} onChangeText={setEmail}
            placeholder="you@kletech.ac.in" keyboardType="email-address" testID="teacher-email-input" />
          <ErrorText message={err} />
          <TouchableOpacity testID="teacher-next1" style={[shared.btnPrimary, { marginTop: spacing.lg }]} onPress={next1}>
            <Text style={shared.btnPrimaryText}>Next · Courses</Text>
          </TouchableOpacity>
        </>
      )}

      {step === 2 && (
        <>
          <Field label="Number of Courses" value={numCourses} onChangeText={applyNumCourses}
            keyboardType="numeric" placeholder="e.g. 3" testID="teacher-numcourses" />
          {courses.map((c, i) => (
            <View key={i} style={{ marginTop: spacing.md }}>
              <Text style={shared.inputLabel}>Course {i + 1}</Text>
              <TextInput
                testID={`teacher-course-${i}`}
                style={shared.input} value={c}
                onChangeText={(t) => setCourses((prev) => prev.map((x, j) => j === i ? t : x))}
                placeholder={`e.g. Machine Learning`}
              />
            </View>
          ))}
          <ErrorText message={err} />
          <View style={{ flexDirection: "row", gap: 10, marginTop: spacing.lg }}>
            <TouchableOpacity style={[shared.btnSecondary, { flex: 1 }]} onPress={() => setStep(1)}>
              <Text style={shared.btnSecondaryText}>Back</Text>
            </TouchableOpacity>
            <TouchableOpacity testID="teacher-next2" style={[shared.btnPrimary, { flex: 1 }]} onPress={next2}>
              <Text style={shared.btnPrimaryText}>Next · ID Proof</Text>
            </TouchableOpacity>
          </View>
        </>
      )}

      {step === 3 && (
        <>
          <Text style={[shared.inputLabel, { marginTop: spacing.md }]}>ID Card Photo (proof)</Text>
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
          <ErrorText message={err} />
          <View style={{ flexDirection: "row", gap: 10, marginTop: spacing.lg }}>
            <TouchableOpacity style={[shared.btnSecondary, { flex: 1 }]} onPress={() => setStep(2)}>
              <Text style={shared.btnSecondaryText}>Back</Text>
            </TouchableOpacity>
            <TouchableOpacity testID="teacher-register-submit" style={[shared.btnPrimary, { flex: 1 }]} onPress={submit} disabled={loading}>
              {loading ? <ActivityIndicator color="#fff" /> :
                <Text style={shared.btnPrimaryText}>Submit</Text>}
            </TouchableOpacity>
          </View>
        </>
      )}
    </FormScreen>
  );
}

const s = StyleSheet.create({
  photo: { width: "100%", height: 220, borderRadius: 12, backgroundColor: "#EEE", resizeMode: "cover", marginTop: 8 },
  photoPlaceholder: {
    height: 220, borderRadius: 12, backgroundColor: colors.bgSecondary,
    borderWidth: 2, borderColor: colors.border, borderStyle: "dashed",
    alignItems: "center", justifyContent: "center", padding: 16, marginTop: 8,
  },
  doneBox: { flex: 1, paddingTop: spacing.xxl, alignItems: "center", paddingHorizontal: spacing.md },
});
