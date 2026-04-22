import { useEffect, useState, useMemo } from 'react';
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { Plus, Package, ArrowRightLeft, Pencil, Trash2, BarChart3, Layers } from 'lucide-react';
import { format } from 'date-fns';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts';
import { useTablePagination } from '@/hooks/useTablePagination';
import { TablePaginationControls } from '@/components/TablePaginationControls';
import { getAppSettings } from '@/lib/appSettings';

const CHART_COLORS = ['hsl(230,65%,55%)', 'hsl(152,60%,42%)', 'hsl(38,92%,50%)', 'hsl(0,72%,51%)', 'hsl(280,60%,50%)', 'hsl(200,70%,50%)'];

export default function Inventory() {
  const { user, role } = useAuth();
  const { toast } = useToast();
  const [items, setItems] = useState<any[]>([]);
  const [checkouts, setCheckouts] = useState<any[]>([]);
  const [profiles, setProfiles] = useState<Record<string, string>>({});
  const [addOpen, setAddOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<any>(null);
  const [editItem, setEditItem] = useState<any>(null);
  const [newItem, setNewItem] = useState({ name: '', description: '', category: '', quantity: 1, location: '', requires_checkout: false });
  const [checkoutQty, setCheckoutQty] = useState(1);
  const [checkoutNotes, setCheckoutNotes] = useState('');
  const [checkoutLocation, setCheckoutLocation] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [rowsPerPageDefault, setRowsPerPageDefault] = useState(10);

  const loadItems = async () => {
    const { data } = await supabase.from('inventory').select('*').order('name');
    if (data) setItems(data);
  };

  const loadCheckouts = async () => {
    if (!user) return;
    const query = role === 'admin'
      ? supabase.from('inventory_checkouts').select('*, inventory(name)').is('returned_at', null).order('checked_out_at', { ascending: false })
      : supabase.from('inventory_checkouts').select('*, inventory(name)').eq('user_id', user.id).is('returned_at', null).order('checked_out_at', { ascending: false });
    const { data } = await query;
    if (data) setCheckouts(data);
  };

  const loadProfiles = async () => {
    const { data } = await (supabase as any).from('directory_profiles').select('user_id, full_name');
    if (data) { const m: Record<string, string> = {}; data.forEach((p: any) => m[p.user_id] = p.full_name); setProfiles(m); }
  };

  useEffect(() => {
    loadItems(); loadCheckouts(); loadProfiles();
    const channel = supabase.channel('inventory-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'inventory' }, () => loadItems())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'inventory_checkouts' }, () => loadCheckouts())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user, role]);

  const categories = useMemo(() => {
    const cats = new Set(items.map(i => i.category).filter(Boolean));
    return Array.from(cats).sort();
  }, [items]);

  const filteredItems = categoryFilter === 'all' ? items : items.filter(i => i.category === categoryFilter);
  const allItemsPagination = useTablePagination(items, rowsPerPageDefault);
  const filteredItemsPagination = useTablePagination(filteredItems, rowsPerPageDefault);
  const checkoutsPagination = useTablePagination(checkouts, rowsPerPageDefault);

  useEffect(() => {
    getAppSettings().then((s) => {
      setRowsPerPageDefault(s.rows_per_page);
      allItemsPagination.setRowsPerPage(s.rows_per_page);
      filteredItemsPagination.setRowsPerPage(s.rows_per_page);
      checkoutsPagination.setRowsPerPage(s.rows_per_page);
      setCheckoutLocation(s.default_checkout_location || '');
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Dashboard data
  const totalItems = items.length;
  const totalQty = items.reduce((s, i) => s + i.quantity, 0);
  const checkedOutCount = checkouts.length;
  const categoryData = useMemo(() => {
    const m: Record<string, number> = {};
    items.forEach(i => { const c = i.category || 'Uncategorized'; m[c] = (m[c] || 0) + i.quantity; });
    return Object.entries(m).map(([name, value]) => ({ name, value }));
  }, [items]);
  const availabilityData = useMemo(() => {
    return items.slice(0, 10).map(i => ({ name: i.name.slice(0, 15), total: i.quantity, available: i.available_quantity }));
  }, [items]);

  const addItemFn = async () => {
    if (!newItem.name.trim()) return;
    const { error } = await supabase.from('inventory').insert({ ...newItem, available_quantity: newItem.quantity });
    if (error) toast({ title: 'Error', description: error.message, variant: 'destructive' });
    else { toast({ title: 'Item added' }); setAddOpen(false); setNewItem({ name: '', description: '', category: '', quantity: 1, location: '', requires_checkout: false }); }
  };

  const updateItem = async () => {
    if (!editItem) return;
    const { error } = await supabase.from('inventory').update({
      name: editItem.name, description: editItem.description, category: editItem.category,
      quantity: editItem.quantity, available_quantity: editItem.available_quantity,
      location: editItem.location, requires_checkout: editItem.requires_checkout,
    }).eq('id', editItem.id);
    if (error) toast({ title: 'Error', description: error.message, variant: 'destructive' });
    else { toast({ title: 'Item updated' }); setEditOpen(false); setEditItem(null); }
  };

  const deleteItem = async (id: string) => {
    if (!confirm('Delete this item?')) return;
    const { error } = await supabase.from('inventory').delete().eq('id', id);
    if (error) toast({ title: 'Error', description: error.message, variant: 'destructive' });
    else toast({ title: 'Item deleted' });
  };

  const checkoutItem = async () => {
    if (!selectedItem || !user) return;
    const { error } = await supabase.from('inventory_checkouts').insert({
      inventory_item_id: selectedItem.id, user_id: user.id, quantity: checkoutQty, notes: checkoutNotes, checkout_location: checkoutLocation,
    } as any);
    if (error) { toast({ title: 'Error', description: error.message, variant: 'destructive' }); return; }
    await supabase.from('inventory').update({ available_quantity: selectedItem.available_quantity - checkoutQty }).eq('id', selectedItem.id);
    toast({ title: 'Item checked out' }); setCheckoutOpen(false); setSelectedItem(null); setCheckoutQty(1); setCheckoutNotes('');
  };

  const returnItem = async (checkout: any) => {
    const { error } = await supabase.from('inventory_checkouts').update({ returned_at: new Date().toISOString() }).eq('id', checkout.id);
    if (error) { toast({ title: 'Error', description: error.message, variant: 'destructive' }); return; }
    const item = items.find(i => i.id === checkout.inventory_item_id);
    if (item) await supabase.from('inventory').update({ available_quantity: item.available_quantity + checkout.quantity }).eq('id', item.id);
    toast({ title: 'Item returned' });
  };

  const renderItemsTable = (itemsList: any[]) => (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Asset ID</TableHead><TableHead>Name</TableHead><TableHead>Category</TableHead><TableHead>Location</TableHead><TableHead>Total</TableHead><TableHead>Available</TableHead><TableHead>Type</TableHead><TableHead></TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {itemsList.map(item => (
          <TableRow key={item.id}>
            <TableCell className="font-mono text-xs text-muted-foreground">{item.asset_id || '—'}</TableCell>
            <TableCell className="font-medium">{item.name}</TableCell>
            <TableCell>{item.category || '—'}</TableCell>
            <TableCell>{item.location || '—'}</TableCell>
            <TableCell>{item.quantity}</TableCell>
            <TableCell><Badge variant={item.available_quantity > 0 ? 'secondary' : 'destructive'}>{item.available_quantity}</Badge></TableCell>
            <TableCell>{item.requires_checkout && <Badge variant="outline">Checkout</Badge>}</TableCell>
            <TableCell>
              <div className="flex gap-1">
                {item.requires_checkout && item.available_quantity > 0 && (
                  <Dialog open={checkoutOpen && selectedItem?.id === item.id} onOpenChange={open => { setCheckoutOpen(open); if (open) setSelectedItem(item); }}>
                    <DialogTrigger asChild><Button size="sm" variant="outline">Check Out</Button></DialogTrigger>
                    <DialogContent>
                      <DialogHeader><DialogTitle>Check Out: {item.name}</DialogTitle></DialogHeader>
                      <div className="space-y-4 mt-2">
                        <div className="space-y-1"><Label>Quantity (max {item.available_quantity})</Label><Input type="number" min={1} max={item.available_quantity} value={checkoutQty} onChange={e => setCheckoutQty(parseInt(e.target.value) || 1)} /></div>
                        <div className="space-y-1"><Label>Notes</Label><Input value={checkoutNotes} onChange={e => setCheckoutNotes(e.target.value)} /></div>
                        <div className="space-y-1"><Label>Location</Label><Input value={checkoutLocation} onChange={e => setCheckoutLocation(e.target.value)} placeholder="Where this item is being used" /></div>
                        <Button onClick={checkoutItem} className="w-full">Confirm Check Out</Button>
                      </div>
                    </DialogContent>
                  </Dialog>
                )}
                {role === 'admin' && (
                  <>
                    <Button size="sm" variant="ghost" onClick={() => { setEditItem({ ...item }); setEditOpen(true); }}><Pencil className="h-3.5 w-3.5" /></Button>
                    <Button size="sm" variant="ghost" className="text-destructive" onClick={() => deleteItem(item.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                  </>
                )}
              </div>
            </TableCell>
          </TableRow>
        ))}
        {itemsList.length === 0 && <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">No items</TableCell></TableRow>}
      </TableBody>
    </Table>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Inventory</h1>
          <p className="text-muted-foreground mt-1">Track items and manage check-outs</p>
        </div>
        {role === 'admin' && (
          <Dialog open={addOpen} onOpenChange={setAddOpen}>
            <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-2" /> Add Item</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Add Inventory Item</DialogTitle></DialogHeader>
              <div className="space-y-4 mt-2">
                <Input placeholder="Item name" value={newItem.name} onChange={e => setNewItem({ ...newItem, name: e.target.value })} />
                <Textarea placeholder="Description" value={newItem.description} onChange={e => setNewItem({ ...newItem, description: e.target.value })} />
                <Input placeholder="Category" value={newItem.category} onChange={e => setNewItem({ ...newItem, category: e.target.value })} />
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1"><Label>Quantity</Label><Input type="number" min={1} value={newItem.quantity} onChange={e => setNewItem({ ...newItem, quantity: parseInt(e.target.value) || 1 })} /></div>
                  <div className="space-y-1"><Label>Location</Label><Input placeholder="e.g. Room A" value={newItem.location} onChange={e => setNewItem({ ...newItem, location: e.target.value })} /></div>
                </div>
                <div className="flex items-center gap-2">
                  <Switch checked={newItem.requires_checkout} onCheckedChange={v => setNewItem({ ...newItem, requires_checkout: v })} />
                  <Label>Requires check-out for outdoor activities</Label>
                </div>
                <Button onClick={addItemFn} className="w-full">Add Item</Button>
              </div>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {/* Edit Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Edit Item</DialogTitle></DialogHeader>
          {editItem && (
            <div className="space-y-4 mt-2">
              <div><Label>Asset ID</Label><Input value={editItem.asset_id || ''} disabled className="bg-muted" /></div>
              <Input placeholder="Item name" value={editItem.name} onChange={e => setEditItem({ ...editItem, name: e.target.value })} />
              <Textarea placeholder="Description" value={editItem.description || ''} onChange={e => setEditItem({ ...editItem, description: e.target.value })} />
              <Input placeholder="Category" value={editItem.category || ''} onChange={e => setEditItem({ ...editItem, category: e.target.value })} />
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1"><Label>Total Qty</Label><Input type="number" min={1} value={editItem.quantity} onChange={e => setEditItem({ ...editItem, quantity: parseInt(e.target.value) || 1 })} /></div>
                <div className="space-y-1"><Label>Available Qty</Label><Input type="number" min={0} value={editItem.available_quantity} onChange={e => setEditItem({ ...editItem, available_quantity: parseInt(e.target.value) || 0 })} /></div>
              </div>
              <Input placeholder="Location" value={editItem.location || ''} onChange={e => setEditItem({ ...editItem, location: e.target.value })} />
              <div className="flex items-center gap-2">
                <Switch checked={editItem.requires_checkout} onCheckedChange={v => setEditItem({ ...editItem, requires_checkout: v })} />
                <Label>Requires check-out</Label>
              </div>
              <Button onClick={updateItem} className="w-full">Save Changes</Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Tabs defaultValue="dashboard">
        <TabsList>
          <TabsTrigger value="dashboard"><BarChart3 className="h-4 w-4 mr-1" /> Dashboard</TabsTrigger>
          <TabsTrigger value="all"><Package className="h-4 w-4 mr-1" /> All Items</TabsTrigger>
          <TabsTrigger value="categories"><Layers className="h-4 w-4 mr-1" /> By Category</TabsTrigger>
          <TabsTrigger value="checkouts"><ArrowRightLeft className="h-4 w-4 mr-1" /> Checkouts</TabsTrigger>
        </TabsList>

        <TabsContent value="dashboard" className="mt-4 space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <Card className="border-border/50"><CardContent className="pt-4 text-center"><p className="text-3xl font-bold">{totalItems}</p><p className="text-sm text-muted-foreground">Total Items</p></CardContent></Card>
            <Card className="border-border/50"><CardContent className="pt-4 text-center"><p className="text-3xl font-bold">{totalQty}</p><p className="text-sm text-muted-foreground">Total Quantity</p></CardContent></Card>
            <Card className="border-border/50"><CardContent className="pt-4 text-center"><p className="text-3xl font-bold text-destructive">{checkedOutCount}</p><p className="text-sm text-muted-foreground">Active Checkouts</p></CardContent></Card>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <Card className="border-border/50">
              <CardHeader><CardTitle className="text-lg">Items by Category</CardTitle></CardHeader>
              <CardContent>
                {categoryData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={250}>
                    <PieChart>
                      <Pie data={categoryData} cx="50%" cy="50%" innerRadius={50} outerRadius={90} dataKey="value" label={({ name, value }) => `${name}: ${value}`}>
                        {categoryData.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                ) : <p className="text-muted-foreground text-center py-12">No data</p>}
              </CardContent>
            </Card>
            <Card className="border-border/50">
              <CardHeader><CardTitle className="text-lg">Availability</CardTitle></CardHeader>
              <CardContent>
                {availabilityData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={250}>
                    <BarChart data={availabilityData}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                      <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                      <YAxis />
                      <Tooltip />
                      <Bar dataKey="total" fill="hsl(230,65%,55%)" radius={[4,4,0,0]} name="Total" />
                      <Bar dataKey="available" fill="hsl(152,60%,42%)" radius={[4,4,0,0]} name="Available" />
                    </BarChart>
                  </ResponsiveContainer>
                ) : <p className="text-muted-foreground text-center py-12">No data</p>}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="all" className="mt-4">
          <Card className="border-border/50">
            <CardHeader><CardTitle className="text-lg flex items-center gap-2"><Package className="h-5 w-5" /> All Items ({items.length})</CardTitle></CardHeader>
            <CardContent>
              {renderItemsTable(allItemsPagination.pagedRows)}
              <TablePaginationControls
                page={allItemsPagination.page}
                totalPages={allItemsPagination.totalPages}
                rowsPerPage={allItemsPagination.rowsPerPage}
                onPageChange={allItemsPagination.setPage}
                onRowsPerPageChange={allItemsPagination.setRowsPerPage}
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="categories" className="mt-4 space-y-4">
          <div className="flex gap-2 flex-wrap">
            <Button variant={categoryFilter === 'all' ? 'default' : 'outline'} size="sm" onClick={() => setCategoryFilter('all')}>All</Button>
            {categories.map(c => (
              <Button key={c} variant={categoryFilter === c ? 'default' : 'outline'} size="sm" onClick={() => setCategoryFilter(c)}>{c}</Button>
            ))}
          </div>
          <Card className="border-border/50">
            <CardContent className="pt-4">
              {renderItemsTable(filteredItemsPagination.pagedRows)}
              <TablePaginationControls
                page={filteredItemsPagination.page}
                totalPages={filteredItemsPagination.totalPages}
                rowsPerPage={filteredItemsPagination.rowsPerPage}
                onPageChange={filteredItemsPagination.setPage}
                onRowsPerPageChange={filteredItemsPagination.setRowsPerPage}
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="checkouts" className="mt-4">
          <Card className="border-border/50">
            <CardHeader><CardTitle className="text-lg flex items-center gap-2"><ArrowRightLeft className="h-5 w-5" /> Active Checkouts ({checkouts.length})</CardTitle></CardHeader>
            <CardContent>
              <Table>
                <TableHeader><TableRow><TableHead>Item</TableHead><TableHead>Checked Out By</TableHead><TableHead>Qty</TableHead><TableHead>Checked Out At</TableHead><TableHead>Location</TableHead><TableHead>Notes</TableHead><TableHead></TableHead></TableRow></TableHeader>
                <TableBody>
                  {checkoutsPagination.pagedRows.map(c => (
                    <TableRow key={c.id}>
                      <TableCell className="font-medium">{(c as any).inventory?.name || '—'}</TableCell>
                      <TableCell>{profiles[c.user_id] || '—'}</TableCell>
                      <TableCell>{c.quantity}</TableCell>
                      <TableCell>{format(new Date(c.checked_out_at), 'MMM d, h:mm a')}</TableCell>
                      <TableCell>{c.checkout_location || '—'}</TableCell>
                      <TableCell className="text-muted-foreground text-sm">{c.notes || '—'}</TableCell>
                      <TableCell><Button size="sm" variant="outline" onClick={() => returnItem(c)}>Return</Button></TableCell>
                    </TableRow>
                  ))}
                  {checkouts.length === 0 && <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">No active checkouts</TableCell></TableRow>}
                </TableBody>
              </Table>
              <TablePaginationControls
                page={checkoutsPagination.page}
                totalPages={checkoutsPagination.totalPages}
                rowsPerPage={checkoutsPagination.rowsPerPage}
                onPageChange={checkoutsPagination.setPage}
                onRowsPerPageChange={checkoutsPagination.setRowsPerPage}
              />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
