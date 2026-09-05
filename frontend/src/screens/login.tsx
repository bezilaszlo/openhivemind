import { useState, type FormEvent } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { authRoutes, routes } from "@openhivemind/shared";
import { api } from "../api";
import { Logo } from "../components/brand";
import { ErrorState } from "../components/states";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
export function Login() {
  const [register, setRegister] = useState(false);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [invite, setInvite] = useState("");
  const client = useQueryClient();
  const navigate = useNavigate();
  const providers = useQuery({ queryKey: ["providers"], queryFn: () => api(routes.providers) });
  const login = useMutation({
    mutationFn: () =>
      register
        ? api(authRoutes.register, {
            body: { name, email, password },
            headers: invite ? { "x-openhivemind-invite": invite } : {},
          })
        : api(authRoutes.login, { body: { email, password } }),
    onSuccess: () => {
      setPassword("");
      void client.invalidateQueries();
      void navigate({ to: "/" });
    },
  });
  const oidc = useMutation({
    mutationFn: () =>
      api(authRoutes.oidc, {
        body: { provider: "oidc", callbackURL: window.location.origin + "/" },
      }),
    onSuccess: (result) => {
      window.location.assign(result.url);
    },
  });
  return (
    <main className="mx-auto w-full max-w-[26rem] px-5 py-16 md:py-24">
      <Logo className="h-7 text-foreground" />
      <p className="mt-3 text-sm text-muted">One memory. Every session.</p>
      <h1 className="mt-10 text-2xl font-semibold tracking-tight">
        {register ? "Join your workspace" : "Welcome back"}
      </h1>
      <form
        className="mt-6 grid gap-4"
        onSubmit={(event: FormEvent) => {
          event.preventDefault();
          login.mutate();
        }}
      >
        {register && (
          <div className="grid gap-1.5">
            <Label htmlFor="login-name">Name</Label>
            <Input
              id="login-name"
              required
              value={name}
              onChange={(event) => setName(event.target.value)}
              autoComplete="name"
            />
          </div>
        )}
        <div className="grid gap-1.5">
          <Label htmlFor="login-email">Email</Label>
          <Input
            id="login-email"
            type="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            autoComplete="email"
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="login-password">Password</Label>
          <Input
            id="login-password"
            type="password"
            required
            minLength={register ? 12 : 1}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete={register ? "new-password" : "current-password"}
          />
        </div>
        {register && (
          <div className="grid gap-1.5">
            <Label htmlFor="login-invite">
              Invite token{" "}
              <span className="font-normal">(not needed for the first administrator)</span>
            </Label>
            <Input
              id="login-invite"
              value={invite}
              onChange={(event) => setInvite(event.target.value)}
              autoComplete="off"
            />
          </div>
        )}
        {login.isError && <ErrorState error={login.error} />}
        <Button type="submit" variant="solid" className="mt-1" disabled={login.isPending}>
          {login.isPending ? "Signing in…" : register ? "Create account" : "Sign in"}
        </Button>
      </form>
      {providers.data?.providers.includes("oidc") && (
        <Button className="mt-3 w-full" onClick={() => oidc.mutate()} disabled={oidc.isPending}>
          Continue with SSO
        </Button>
      )}
      {oidc.isError && <ErrorState error={oidc.error} />}
      <Button variant="link" size="none" className="mt-6" onClick={() => setRegister(!register)}>
        {register ? "Already have an account? Sign in" : "New here? Create an account"}
      </Button>
    </main>
  );
}
