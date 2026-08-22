import { Routes, Route } from "react-router-dom";
import { AuthTokenBridge } from "@/components/auth/AuthTokenBridge";
import { ProtectedLayout } from "@/components/auth/ProtectedLayout";
import Landing from "@/pages/Landing";
import SignInPage from "@/pages/SignInPage";
import SignUpPage from "@/pages/SignUpPage";
import Home from "@/pages/Home";
import Chat from "@/pages/Chat";
import FindCare from "@/pages/FindCare";
import MyData from "@/pages/MyData";
import Profile from "@/pages/Profile";

export default function App() {
  return (
    <>
      <AuthTokenBridge />
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/sign-in/*" element={<SignInPage />} />
        <Route path="/sign-up/*" element={<SignUpPage />} />

        <Route element={<ProtectedLayout />}>
          <Route path="/dashboard" element={<Home />} />
          <Route path="/chat" element={<Chat />} />
          <Route path="/find-care" element={<FindCare />} />
          <Route path="/my-data" element={<MyData />} />
          <Route path="/profile" element={<Profile />} />
        </Route>
      </Routes>
    </>
  );
}
