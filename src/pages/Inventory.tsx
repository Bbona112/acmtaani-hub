import { useEffect, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Plus, Package, ArrowRightLeft } from 'lucide-react';

export default function Inventory() {
  const { user, role } = useAuth();
  const { toast } = useToast();
  const [items, setItems] = useState<any[]>([]);
  const [checkouts, setCheckouts] = useState<any[]>([]);
  const [addOpen, setAddOpen] = useState(false);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<any>(null);
  const [newItem, setNewItem] = useState({ name: '', description: '', category: '', quantity: 1, location: '', requires_checkout: false });
  const [checkoutQty, setCheckoutQty] = useState(1);
  const [checkoutNotes, setCheckoutNotes] = useState('');

  const loadItems = async () => {
    const { data } = await supabase.from('inventory').select('*').order('name');
    if (data) setItems(data);
  };

  const loadCheckouts = async () => {
    if (!user) return;
    const query = role === 'admin'
      ? supabase.from('inventory_checkouts').select('*, inventory(name), profiles!inventory_checkouts_user_id_fkey(full_name)').is('returned_at', null).order('checked_out_at', { ascending: false })
      : supabase.from('inventory_checkouts').select('*, inventory(name)').eq('user_id', user.id).is('returned_at', null).order('checked_out_at', { ascending: false });
    const { data } = await query;
    if (data) setCheckouts(data);
  };

  useEffect(() => {
    loadItems();
    loadCheckouts();
  }, [user, role]);

  const addItem = async () => {
    if (!newItem.name.trim()) return;
    const { error } = await supabase.from('inventory').insert({
      ...newItem,
      available_quantity: newItem.quantity,
    });
    if (error) toast({ title: 'Error', description: error.message, variant: 'destructive' });
    else {
      toast({ title: 'Item added' });
      setAddOpen(false);
      setNewItem({ name: '', description: '', category: '', quantity: 1, location: '', requires_checkout: false });
      loadItems();
    }
  };

  const checkoutItem = async () => {
    if (!selectedItem || !user) return;
    const { error } = await supabase.from('inventory_checkouts').insert({
      inventory_item_id: selectedItem.id,
      user_id: user.id,
      quantity: checkoutQty,
      notes: checkoutNotes,
    });
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
      return;
    }
    // Update available quantity
    await supabase.from('inventory').update({
      available_quantity: selectedItem.available_quantity - checkoutQty,
    }).eq('id', selectedItem.id);

    toast({ title: 'Item checked out' });
    setCheckoutOpen(false);
    setSelectedItem(null);
    setCheckoutQty(1);
    setCheckoutNotes('');
    loadItems();
    loadCheckouts();
  };

  const returnItem = async (checkout: any) => {
    const { error } = await supabase.from('inventory_checkouts').update({
      returned_at: new Date().toISOString(),
    }).eq('id', checkout.id);
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
      return;
    }
    // Restore available quantity
    const item = items.find(i => i.id === checkout.inventory_item_id);
    if (item) {
      await supabase.from('inventory').update({
        available_quantity: item.available_quantity + checkout.quantity,
      }).eq('id', item.id);
    }
    toast({ title: 'Item returned' });
    loadItems();
    loadCheckouts();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Inventory</h1>
          <p className="text-muted-foreground mt-1">Track items and manage check-outs for activities</p>
        </div>
        {role === 'admin' && (
          <Dialog open={addOpen} onOpenChange={setAddOpen}>
            <DialogTrigger asChild>
              <Button><Plus className="h-4 w-4 mr-2" /> Add Item</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Add Inventory Item</DialogTitle></DialogHeader>
              <div className="space-y-4 mt-2">
                <Input placeholder="Item name" value={newItem.name} onChange={(e) => setNewItem({ ...newItem, name: e.target.value })} />
                <Textarea placeholder="Description" value={newItem.description} onChange={(e) => setNewItem({ ...newItem, description: e.target.value })} />
                <Input placeholder="Category" value={newItem.category} onChange={(e) => setNewItem({ ...newItem, category: e.target.value })} />
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label>Quantity</Label>
                    <Input type="number" min={1} value={newItem.quantity} onChange={(e) => setNewItem({ ...newItem, quantity: parseInt(e.target.value) || 1 })} />
                  </div>
                  <div className="space-y-1">
                    <Label>Location</Label>
                    <Input placeholder="e.g. Room A" value={newItem.location} onChange={(e) => setNewItem({ ...newItem, location: e.target.value })} />
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Switch checked={newItem.requires_checkout} onCheckedChange={(v) => setNewItem({ ...newItem, requires_checkout: v })} />
                  <Label>Requires check-out for outdoor activities</Label>
                </div>
                <Button onClick={addItem} className="w-full">Add Item</Button>
              </div>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {/* Active checkouts */}
      {checkouts.length > 0 && (
        <Card className="border-[hsl(var(--warning))]/30 bg-[hsl(var(--warning))]/5">
          <CardHeader><CardTitle className="text-lg flex items-center gap-2"><ArrowRightLeft className="h-5 w-5" /> Active Checkouts</CardTitle></CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Item</TableHead>
                  {role === 'admin' && <TableHead>Person</TableHead>}
                  <TableHead>Qty</TableHead>
                  <TableHead>Notes</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {checkouts.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium">{(c as any).inventory?.name || '—'}</TableCell>
                    {role === 'admin' && <TableCell>{(c as any).profiles?.full_name || '—'}</TableCell>}
                    <TableCell>{c.quantity}</TableCell>
                    <TableCell className="text-muted-foreground text-sm">{c.notes || '—'}</TableCell>
                    <TableCell>
                      <Button size="sm" variant="outline" onClick={() => returnItem(c)}>Return</Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Inventory list */}
      <Card className="border-border/50">
        <CardHeader><CardTitle className="text-lg flex items-center gap-2"><Package className="h-5 w-5" /> All Items</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Location</TableHead>
                <TableHead>Total</TableHead>
                <TableHead>Available</TableHead>
                <TableHead>Type</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="font-medium">{item.name}</TableCell>
                  <TableCell>{item.category || '—'}</TableCell>
                  <TableCell>{item.location || '—'}</TableCell>
                  <TableCell>{item.quantity}</TableCell>
                  <TableCell>
                    <Badge variant={item.available_quantity > 0 ? 'secondary' : 'destructive'}>
                      {item.available_quantity}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {item.requires_checkout && <Badge variant="outline">Checkout</Badge>}
                  </TableCell>
                  <TableCell>
                    {item.requires_checkout && item.available_quantity > 0 && (
                      <Dialog open={checkoutOpen && selectedItem?.id === item.id} onOpenChange={(open) => {
                        setCheckoutOpen(open);
                        if (open) setSelectedItem(item);
                      }}>
                        <DialogTrigger asChild>
                          <Button size="sm" variant="outline">Check Out</Button>
                        </DialogTrigger>
                        <DialogContent>
                          <DialogHeader><DialogTitle>Check Out: {item.name}</DialogTitle></DialogHeader>
                          <div className="space-y-4 mt-2">
                            <div className="space-y-1">
                              <Label>Quantity (max {item.available_quantity})</Label>
                              <Input type="number" min={1} max={item.available_quantity} value={checkoutQty} onChange={(e) => setCheckoutQty(parseInt(e.target.value) || 1)} />
                            </div>
                            <div className="space-y-1">
                              <Label>Notes (e.g. activity name)</Label>
                              <Input value={checkoutNotes} onChange={(e) => setCheckoutNotes(e.target.value)} />
                            </div>
                            <Button onClick={checkoutItem} className="w-full">Confirm Check Out</Button>
                          </div>
                        </DialogContent>
                      </Dialog>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {items.length === 0 && (
                <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">No inventory items yet</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
