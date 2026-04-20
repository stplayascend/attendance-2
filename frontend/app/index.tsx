import { useEffect } from "react";
import { View, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import { useAuth } from "../src/AuthContext";
import { colors, shared } from "../src/theme";

export default function Index() {
  const router = useRouter();
  const { user, loading } = useAuth();

  useEffect(() => {
    if (loading) return;
    if (!user) router.replace("/login");
    else if (user.role === "admin") router.replace("/admin/dashboard");
    else if (user.role === "teacher") router.replace("/teacher/dashboard");
    else if (user.role === "student") router.replace("/student/dashboard");
  }, [user, loading]);

  return (
    <View style={[shared.screen, { alignItems: "center", justifyContent: "center" }]}>
      <ActivityIndicator size="large" color={colors.brand} />
    </View>
  );
}
