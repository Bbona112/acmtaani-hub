import { useEffect, useMemo, useRef, useState } from 'react';
import { z } from 'zod';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { Megaphone, Play, Square, Save, Trash2 } from 'lucide-react';

const presetMessages = [
  { label: 'Closing in 15 min', text: 'Attention please. The American Space will be closing in fifteen minutes. Kindly start wrapping up your activities. Thank you.' },
  { label: 'Closing in 5 min', text: 'Attention please. We will be closing in five minutes. Please pack up and return any borrowed devices to the front desk.' },
  { label: 'Workshop starting', text: 'The workshop is about to begin. Please make your way to the main hall.' },
  { label: 'Quiet please', text: 'Kindly keep your voices down. There is a session in progress. Thank you.' },
  { label: 'Lost & found', text: 'A lost item has been handed in at the front desk. If you are missing something, please come and identify it.' },
];

const messageSchema = z.string().trim().min(1, 'Message cannot be empty').max(500, 'Message must be under 500 characters');

export default function Announcements() {
  const { toast } = useToast();
  const supported = typeof window !== 'undefined' && 'speechSynthesis' in window;
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [voiceUri, setVoiceUri] = useState<string>('');
  const [rate, setRate] = useState(1);
  const [pitch, setPitch] = useState(1);
  const [volume, setVolume] = useState(1);
  const [text, setText] = useState('');
  const [speaking, setSpeaking] = useState(false);
  const [saved, setSaved] = useState<{ name: string; text: string }[]>(() => {
    try { return JSON.parse(localStorage.getItem('announcements_saved') || '[]'); } catch { return []; }
  });
  const [savedName, setSavedName] = useState('');
  const utterRef = useRef<SpeechSynthesisUtterance | null>(null);

  useEffect(() => {
    if (!supported) return;
    const load = () => {
      const v = window.speechSynthesis.getVoices();
      setVoices(v);
      if (!voiceUri && v.length) {
        const en = v.find((x) => x.lang?.toLowerCase().startsWith('en')) || v[0];
        setVoiceUri(en.voiceURI);
      }
    };
    load();
    window.speechSynthesis.onvoiceschanged = load;
    return () => { window.speechSynthesis.onvoiceschanged = null; };
  }, [supported]);

  const selectedVoice = useMemo(() => voices.find((v) => v.voiceURI === voiceUri), [voices, voiceUri]);

  const speak = (msg?: string) => {
    if (!supported) {
      toast({ title: 'Not supported', description: 'This browser does not support speech synthesis.', variant: 'destructive' });
      return;
    }
    const parsed = messageSchema.safeParse(msg ?? text);
    if (!parsed.success) {
      toast({ title: 'Invalid message', description: parsed.error.errors[0].message, variant: 'destructive' });
      return;
    }
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(parsed.data);
    if (selectedVoice) u.voice = selectedVoice;
    u.rate = rate; u.pitch = pitch; u.volume = volume;
    u.onstart = () => setSpeaking(true);
    u.onend = () => setSpeaking(false);
    u.onerror = () => setSpeaking(false);
    utterRef.current = u;
    window.speechSynthesis.speak(u);
  };

  const stop = () => { window.speechSynthesis.cancel(); setSpeaking(false); };

  const saveCurrent = () => {
    const name = savedName.trim();
    const parsed = messageSchema.safeParse(text);
    if (!name) { toast({ title: 'Name required', variant: 'destructive' }); return; }
    if (!parsed.success) { toast({ title: parsed.error.errors[0].message, variant: 'destructive' }); return; }
    const next = [...saved.filter((s) => s.name !== name), { name, text: parsed.data }];
    setSaved(next);
    localStorage.setItem('announcements_saved', JSON.stringify(next));
    setSavedName('');
    toast({ title: 'Saved' });
  };

  const remove = (name: string) => {
    const next = saved.filter((s) => s.name !== name);
    setSaved(next);
    localStorage.setItem('announcements_saved', JSON.stringify(next));
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Megaphone className="h-6 w-6" /> Announcements</h1>
          <p className="text-muted-foreground mt-1">Broadcast text-to-speech announcements through this device's speakers.</p>
        </div>
        <Badge variant={supported ? 'secondary' : 'destructive'}>{supported ? 'Speech ready' : 'Not supported'}</Badge>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Compose announcement</CardTitle>
            <CardDescription>Type your message, pick a voice, then play through the connected speaker.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="e.g. Attention please, the workshop will start in 5 minutes..." rows={5} maxLength={500} />
            <div className="flex flex-wrap gap-2">
              {presetMessages.map((p) => (
                <Button key={p.label} variant="outline" size="sm" onClick={() => { setText(p.text); speak(p.text); }}>
                  {p.label}
                </Button>
              ))}
            </div>
            <div className="flex gap-2">
              <Button onClick={() => speak()} disabled={!supported || speaking}>
                <Play className="h-4 w-4 mr-2" /> {speaking ? 'Speaking...' : 'Play announcement'}
              </Button>
              <Button variant="outline" onClick={stop} disabled={!speaking}>
                <Square className="h-4 w-4 mr-2" /> Stop
              </Button>
            </div>

            <div className="border-t pt-4 space-y-3">
              <Label>Save current message</Label>
              <div className="flex gap-2">
                <Input placeholder="Name (e.g. Closing soon)" value={savedName} onChange={(e) => setSavedName(e.target.value)} maxLength={50} />
                <Button variant="secondary" onClick={saveCurrent}><Save className="h-4 w-4 mr-2" />Save</Button>
              </div>
              {saved.length > 0 && (
                <div className="space-y-1">
                  {saved.map((s) => (
                    <div key={s.name} className="flex items-center gap-2 text-sm border rounded-md p-2">
                      <div className="flex-1 min-w-0">
                        <div className="font-medium truncate">{s.name}</div>
                        <div className="text-muted-foreground text-xs truncate">{s.text}</div>
                      </div>
                      <Button size="sm" variant="ghost" onClick={() => speak(s.text)}><Play className="h-3.5 w-3.5" /></Button>
                      <Button size="sm" variant="ghost" onClick={() => { setText(s.text); }}>Load</Button>
                      <Button size="sm" variant="ghost" onClick={() => remove(s.name)}><Trash2 className="h-3.5 w-3.5" /></Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Voice settings</CardTitle>
            <CardDescription>Audio plays through the speakers connected to the device running this page.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Voice</Label>
              <Select value={voiceUri} onValueChange={setVoiceUri}>
                <SelectTrigger><SelectValue placeholder="Select a voice" /></SelectTrigger>
                <SelectContent className="max-h-64">
                  {voices.map((v) => (
                    <SelectItem key={v.voiceURI} value={v.voiceURI}>{v.name} ({v.lang})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Rate: {rate.toFixed(2)}</Label>
              <Slider min={0.5} max={2} step={0.05} value={[rate]} onValueChange={(v) => setRate(v[0])} />
            </div>
            <div className="space-y-2">
              <Label>Pitch: {pitch.toFixed(2)}</Label>
              <Slider min={0} max={2} step={0.05} value={[pitch]} onValueChange={(v) => setPitch(v[0])} />
            </div>
            <div className="space-y-2">
              <Label>Volume: {Math.round(volume * 100)}%</Label>
              <Slider min={0} max={1} step={0.05} value={[volume]} onValueChange={(v) => setVolume(v[0])} />
            </div>
            <p className="text-xs text-muted-foreground border-t pt-3">Tip: Open this page on the device wired to the venue speakers, then keep the tab focused. No external API or API key is needed.</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
