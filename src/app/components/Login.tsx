"use client";

import { useState } from "react";
import { supabase } from "@/lib/supaBaseClient";


export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<"magic" | "password">("magic");
  const handleMagicLink = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signInWithOtp({ email });
    if (error) alert(error.message);
    else alert("Kirjautumislinkki lähetetty sähköpostiisi");
    setLoading(false);
  };

  const handlePasswordLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      alert("Virhe kirjautumisessa: " + error.message);
    } else {
      alert("Kirjautuminen onnistui!");
      // Päivitetään sivu -> ClientLayout hakee roolin ja ohjaa oikeaan näkymään
      window.location.reload();
    }
    setLoading(false);
  };

  return (
    <div className="flex h-screen items-center justify-center bg-gray-50">
      <div className="bg-white p-8 rounded-2xl shadow-md w-full max-w-md">
        <h1 className="text-2xl font-bold mb-4 text-center">Kirjaudu sisään</h1>
        <div className="flex justify-center mb-6 space-x-4">
          <button
            onClick={() => setMode("magic")}
            className={`px-4 py-2 rounded-lg ${mode === "magic" ? "bg-black text-white" : "bg-gray-200"}`}
          >
            Magic link
          </button>
          <button
            onClick={() => setMode("password")}
            className={`px-4 py-2 rounded-lg ${mode === "password" ? "bg-black text-white" : "bg-gray-200"}`}
          >
            Salasana
          </button>
        </div>
        {mode === "magic" ? (
          <form onSubmit={handleMagicLink} className="space-y-4">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="sähköposti@esimerkki.com"
              className="w-full px-4 py-2 border rounded-lg"
              required
            />
            <button
              type="submit"
              className="w-full bg-black text-white py-2 rounded-lg disabled:opacity-50"
              disabled={loading}
            >
              {loading ? "Lähetetään..." : "Lähetä linkki"}
            </button>
          </form>
        ) : (
          <form onSubmit={handlePasswordLogin} className="space-y-4">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="sähköposti@esimerkki.com"
              className="w-full px-4 py-2 border rounded-lg"
              required
            />
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Salasana"
              className="w-full px-4 py-2 border rounded-lg"
              required
            />
            <button
              type="submit"
              className="w-full bg-black text-white py-2 rounded-lg disabled:opacity-50"
              disabled={loading}
            >
              {loading ? "Kirjaudutaan..." : "Kirjaudu sisään"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}