import { useEffect, useState } from 'react';
import { useAuth } from './useAuth';
import { supabase } from '@/integrations/supabase/client';

export function useModuleAccess() {
  const { role, user } = useAuth();
  const [keys, setKeys] = useState<string[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let active = true;
    if (!user) { setKeys([]); setLoaded(true); return; }
    if (role === 'admin') { setKeys(['*']); setLoaded(true); return; }
    (async () => {
      const { data } = await (supabase as any).rpc('my_module_keys');
      if (!active) return;
      setKeys(Array.isArray(data) ? data.map((r: any) => r.module_key) : []);
      setLoaded(true);
    })();
    return () => { active = false; };
  }, [user?.id, role]);

  const can = (mod: string) => role === 'admin' || keys.includes(mod);
  return { can, keys, loaded, role };
}
