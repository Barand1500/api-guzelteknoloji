import { useEffect, useState, type FormEvent } from "react";
import LiquidCarveButton from "../../components/LiquidCarveButton";
import { request } from "../../shared/api";
import { DEFAULT_LOGIN_SETTINGS, type LoginSettings } from "../../shared/types";
import { Logo } from "../../shared/ui";

export default function Login({ onLogin }: { onLogin: (v: string) => void }) {
  const [error, setError] = useState(""),
    [showPassword, setShowPassword] = useState(false),
    [busy, setBusy] = useState(false);
  const [email, setEmail] = useState("admin@guzelteknoloji.com"),
    [password, setPassword] = useState(""),
    [code, setCode] = useState(""),
    [mode, setMode] = useState<"choose" | "password" | "otp">("choose");
  const [settings, setSettings] = useState<LoginSettings>(
    DEFAULT_LOGIN_SETTINGS,
  );
  useEffect(() => {
    let cancelled = false;
    request<LoginSettings>("/login/settings", null)
      .then((value) => {
        if (!cancelled) setSettings({ ...DEFAULT_LOGIN_SETTINGS, ...value });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);
  function chooseMode(next: "choose" | "password" | "otp") {
    setMode(next);
    setError("");
    setPassword("");
    setCode("");
  }
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const path = mode === "otp" ? "/auth/verify-otp" : "/auth/login";
      const body = mode === "otp" ? { email, code } : { email, password };
      const data = await request<{ token: string }>(path, null, {
        method: "POST",
        body: JSON.stringify(body),
      });
      onLogin(data.token);
    } catch (x) {
      setError((x as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function requestCode() {
    if (busy) return;
    setError("");
    if (!/^\S+@\S+\.\S+$/.test(email)) {
      setError("Ge\u00e7erli bir e-posta adresi girin");
      return;
    }
    setBusy(true);
    try {
      await request("/auth/request-otp", null, {
        method: "POST",
        body: JSON.stringify({ email }),
      });
      chooseMode("otp");
    } catch (x) {
      setError((x as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const blueColors = {
    fill: "#2478ed",
    textColor: "#ffffff",
    border: "#1d6bd4",
  };
  const liquidBlob = { color: "#1455b7", size: 76, smoothness: 45 };
  return (
    <main className="login-page">
      <section className="login-shell">
        <div className="login-visual">
          <div className="visual-glow" />
          <img src={settings.imageUrl} alt="Giriş ekranı görseli" />
        </div>
        <div className="login-panel">
          <div className="login-brand">
            <Logo />
            <span>Y&#246;netim Merkezi</span>
          </div>
          <div className="login-heading">
            <h1>Ho&#351; geldiniz</h1>
            <p>
              {mode === "otp"
                ? "E-posta adresine g&#246;nderilen 6 haneli kodu gir."
                : mode === "choose"
                  ? "E-posta adresini yaz, giri&#351; y&#246;ntemini se&#231;."
                  : "E-posta adresin ve &#351;ifrenle giri&#351; yap."}
            </p>
          </div>
          <form className="login-form" onSubmit={submit}>
            <div className="auth-field">
              <input
                id="login-email"
                name="email"
                type="email"
                autoComplete="username"
                placeholder=" "
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                readOnly={mode === "otp"}
                required
              />
              <label htmlFor="login-email">E-posta</label>
            </div>
            {mode === "password" ? (
              <div className="auth-field password-wrap">
                <input
                  autoFocus
                  id="login-password"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  placeholder=" "
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
                <label htmlFor="login-password">&#350;ifre</label>
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={
                    showPassword
                      ? "\u015eifreyi gizle"
                      : "\u015eifreyi g\u00f6ster"
                  }
                >
                  {showPassword ? "Gizle" : "G\u00f6ster"}
                </button>
              </div>
            ) : mode === "otp" ? (
              <div className="auth-field">
                <input
                  autoFocus
                  id="login-code"
                  name="code"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  placeholder=" "
                  value={code}
                  onChange={(e) =>
                    setCode(e.target.value.replace(/\D/g, "").slice(0, 6))
                  }
                  required
                />
                <label htmlFor="login-code">E-posta do&#287;rulama kodu</label>
              </div>
            ) : null}
            <div className="login-error" role="alert">
              {error}
            </div>
            {mode === "choose" ? (
              <div className="login-mode-actions">
                {settings.quickLoginEnabled && (
                  <LiquidCarveButton
                    type="button"
                    label={"H\u0131zl\u0131 Giri\u015f"}
                    ariaLabel="Hizli Giris"
                    colors={blueColors}
                    blob={liquidBlob}
                    rounded={40}
                    padding="16px 24px"
                    className="login-liquid"
                    disabled={busy}
                    onClick={requestCode}
                  />
                )}
                <LiquidCarveButton
                  type="button"
                  label={"Giri\u015f Yap"}
                  ariaLabel="Giris Yap"
                  colors={blueColors}
                  blob={liquidBlob}
                  rounded={40}
                  padding="16px 24px"
                  className="login-liquid"
                  disabled={busy}
                  onClick={() => chooseMode("password")}
                />
              </div>
            ) : (
              <>
                <LiquidCarveButton
                  type="submit"
                  label={
                    busy
                      ? mode === "otp"
                        ? "Do\u011frulaniyor..."
                        : "Giris yapiliyor..."
                      : mode === "otp"
                        ? "Kodu dogrula"
                        : "Giris Yap"
                  }
                  ariaLabel={mode === "otp" ? "Kodu dogrula" : "Giris Yap"}
                  colors={blueColors}
                  blob={liquidBlob}
                  rounded={40}
                  padding="16px 24px"
                  className="login-liquid"
                  disabled={busy}
                />
                <button
                  className="login-back"
                  type="button"
                  onClick={() => chooseMode("choose")}
                  disabled={busy}
                >
                  Geri
                </button>
              </>
            )}
          </form>
          <div className="login-foot">
            <span className="secure-dot" />
            Yalnizca yetkili kullanicilar icindir
          </div>
        </div>
      </section>
    </main>
  );
}
