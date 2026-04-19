import { useState } from "react";
import {
  View, Text, TouchableOpacity, StyleSheet, Image, ActivityIndicator, Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import { Feather } from "@expo/vector-icons";
import { api, formatApiError } from "../../src/api";
import { useAuth } from "../../src/AuthContext";
import { Header } from "../../src/ui";
import { colors, spacing, typography, shared } from "../../src/theme";

export default function FaceCapture() {
  const router = useRouter();
  const { refresh } = useAuth();
  const [img, setImg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [count, setCount] = useState(0);

  const takeSelfie = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Camera permission required");
      return;
    }
    const res = await ImagePicker.launchCameraAsync({
      base64: true, quality: 0.8, cameraType: ImagePicker.CameraType.front,
    });
    if (res.canceled) return;
    setImg(res.assets[0].base64 ?? null);
  };

  const pickFromGallery = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Photos permission required");
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({
      base64: true, quality: 0.8, mediaTypes: ImagePicker.MediaTypeOptions.Images,
    });
    if (res.canceled) return;
    setImg(res.assets[0].base64 ?? null);
  };

  const submit = async () => {
    if (!img) { Alert.alert("Please take a photo first"); return; }
    setLoading(true);
    try {
      const { data } = await api.post("/upload-face", { image_base64: img });
      setCount(data.embeddings_count);
      setImg(null);
      await refresh();
      Alert.alert(
        "Face registered",
        `Saved embedding #${data.embeddings_count}. Add more angles for better accuracy, or continue.`,
      );
    } catch (e) { Alert.alert("Failed", formatApiError(e)); }
    finally { setLoading(false); }
  };

  const done = async () => {
    await refresh();
    router.replace("/student/dashboard");
  };

  return (
    <SafeAreaView style={shared.screen}>
      <View style={{ paddingHorizontal: spacing.lg }}>
        <Header title="Face Registration" subtitle="Take a clear front-facing selfie" />
      </View>

      <View style={s.previewWrap}>
        {img ? (
          <Image source={{ uri: `data:image/jpeg;base64,${img}` }} style={s.preview} />
        ) : (
          <View style={s.placeholder}>
            <Feather name="user" size={72} color={colors.borderStrong} />
            <Text style={[typography.small, { marginTop: 8 }]}>
              Center your face · Good lighting · No mask
            </Text>
          </View>
        )}
      </View>

      {count > 0 && (
        <Text style={[typography.small, { textAlign: "center", color: colors.present }]}>
          <Feather name="check-circle" size={14} color={colors.present} />
          {"  "}{count} face sample{count > 1 ? "s" : ""} registered
        </Text>
      )}

      <View style={{ paddingHorizontal: spacing.lg, paddingBottom: spacing.lg, gap: 10 }}>
        <View style={{ flexDirection: "row", gap: 10 }}>
          <TouchableOpacity testID="face-camera-btn" style={[shared.btnSecondary, { flex: 1 }]} onPress={takeSelfie}>
            <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
              <Feather name="camera" size={18} color={colors.text} />
              <Text style={shared.btnSecondaryText}>Camera</Text>
            </View>
          </TouchableOpacity>
          <TouchableOpacity testID="face-gallery-btn" style={[shared.btnSecondary, { flex: 1 }]} onPress={pickFromGallery}>
            <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
              <Feather name="image" size={18} color={colors.text} />
              <Text style={shared.btnSecondaryText}>Gallery</Text>
            </View>
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          testID="face-upload-btn"
          style={[shared.btnPrimary, { opacity: img ? 1 : 0.5 }]}
          disabled={!img || loading}
          onPress={submit}
        >
          {loading ? <ActivityIndicator color="#fff" /> :
            <Text style={shared.btnPrimaryText}>Register This Photo</Text>}
        </TouchableOpacity>

        {count > 0 && (
          <TouchableOpacity testID="face-done-btn" onPress={done} style={{ alignItems: "center", paddingTop: 6 }}>
            <Text style={{ color: colors.brand, fontFamily: "Manrope_600SemiBold" }}>
              Done — Go to Dashboard
            </Text>
          </TouchableOpacity>
        )}
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  previewWrap: {
    flex: 1, alignItems: "center", justifyContent: "center",
    paddingHorizontal: spacing.lg, marginVertical: spacing.md,
  },
  preview: { width: 260, height: 320, borderRadius: 24, backgroundColor: "#EEE" },
  placeholder: {
    width: 260, height: 320, borderRadius: 24, backgroundColor: colors.bgSecondary,
    borderWidth: 2, borderColor: colors.border, borderStyle: "dashed",
    alignItems: "center", justifyContent: "center", padding: 16,
  },
});
