import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { lovable } from '@/integrations/lovable/index';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';

export default function Auth() {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    const { data } = supabase.storage.from('site-assets').getPublicUrl('logo.png');
    fetch(data.publicUrl, { method: 'HEAD' }).then(r => { if (r.ok) setLogoUrl(data.publicUrl + '?t=' + Date.now()); }).catch(() => {});
  }, []);

  const handleGoogleSignIn = async () => {
    setGoogleLoading(true);
    const result = await lovable.auth.signInWithOAuth('google', { redirect_uri: window.location.origin });
    if (result.error) toast({ title: 'Google sign-in failed', description: String(result.error), variant: 'destructive' });
    setGoogleLoading(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    if (isLogin) {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) toast({ title: 'Login failed', description: error.message, variant: 'destructive' });
    } else {
      const { error } = await supabase.auth.signUp({
        email, password,
        options: { data: { full_name: fullName }, emailRedirectTo: window.location.origin },
      });
      if (error) toast({ title: 'Sign up failed', description: error.message, variant: 'destructive' });
      else toast({ title: 'Check your email', description: 'We sent you a confirmation link.' });
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md shadow-lg border-border/50">
        <CardHeader className="text-center space-y-2">
          <div className="mx-auto mb-2">
            {logoUrl ? (
              <img src={logoUrl} alt="ACMtaani Hub" className="w-16 h-16 rounded-xl object-contain mx-auto" />
            ) : (
              <div className="w-16 h-16 rounded-xl bg-primary flex items-center justify-center mx-auto">
                <span className="text-primary-foreground text-2xl font-bold">A</span>
              </div>
            )}
          </div>
          <CardTitle className="text-2xl font-bold">{isLogin ? 'Welcome back' : 'Create account'}</CardTitle>
          <CardDescription>{isLogin ? 'Sign in to ACMtaani Hub' : 'Get started with ACMtaani Hub'}</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {!isLogin && <Input placeholder="Full name" value={fullName} onChange={e => setFullName(e.target.value)} required />}
            <Input type="email" placeholder="Email address" value={email} onChange={e => setEmail(e.target.value)} required />
            <Input type="password" placeholder="Password" value={password} onChange={e => setPassword(e.target.value)} required minLength={6} />
            <Button type="submit" className="w-full" disabled={loading}>{loading ? 'Please wait...' : isLogin ? 'Sign in' : 'Sign up'}</Button>
          </form>
          <div className="relative my-4">
            <div className="absolute inset-0 flex items-center"><span className="w-full border-t" /></div>
            <div className="relative flex justify-center text-xs uppercase"><span className="bg-card px-2 text-muted-foreground">Or</span></div>
          </div>
          <Button variant="outline" className="w-full" onClick={handleGoogleSignIn} disabled={googleLoading}>
            <svg className="mr-2 h-4 w-4" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
            {googleLoading ? 'Please wait...' : 'Continue with Google'}
          </Button>
          <p className="mt-4 text-center text-sm text-muted-foreground">
            {isLogin ? "Don't have an account?" : 'Already have an account?'}{' '}
            <button onClick={() => setIsLogin(!isLogin)} className="text-primary font-medium hover:underline">{isLogin ? 'Sign up' : 'Sign in'}</button>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
