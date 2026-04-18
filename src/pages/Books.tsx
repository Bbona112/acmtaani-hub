import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { BookOpen, Plus, Trash2, Pencil, Download, Search } from 'lucide-react';
import { format } from 'date-fns';

export default function Books() {
  const { role } = useAuth();
  const { toast } = useToast();
  const [books, setBooks] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [addOpen, setAddOpen] = useState(false);
  const [edit, setEdit] = useState<any>(null);
  const [form, setForm] = useState({ title: '', authors: '', isbn: '', publisher: '', year: '', copies_total: 1 });

  const load = async () => {
    const { data } = await supabase.from('books').select('*').order('title');
    if (data) setBooks(data);
  };
  useEffect(() => { load(); }, []);

  const add = async () => {
    if (!form.title.trim()) { toast({ title: 'Title required', variant: 'destructive' }); return; }
    const payload = { ...form, year: form.year ? parseInt(form.year) : null, copies_available: form.copies_total };
    const { error } = await supabase.from('books').insert(payload);
    if (error) toast({ title: 'Error', description: error.message, variant: 'destructive' });
    else { toast({ title: 'Book added' }); setForm({ title: '', authors: '', isbn: '', publisher: '', year: '', copies_total: 1 }); setAddOpen(false); load(); }
  };
  const update = async () => {
    const { id, book_id, created_at, updated_at, ...rest } = edit;
    await supabase.from('books').update(rest).eq('id', id);
    setEdit(null); load();
  };
  const remove = async (id: string) => {
    if (!confirm('Delete book?')) return;
    await supabase.from('books').delete().eq('id', id);
    load();
  };

  const exportCSV = () => {
    const rows = [['Book ID', 'Title', 'Authors', 'ISBN', 'Publisher', 'Year', 'Copies']];
    books.forEach(b => rows.push([b.book_id, b.title, b.authors, b.isbn, b.publisher, b.year, `${b.copies_available}/${b.copies_total}`]));
    const csv = rows.map(r => r.map(c => `"${(c ?? '').toString().replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `books-${format(new Date(), 'yyyy-MM-dd')}.csv`; a.click();
  };

  const filtered = books.filter(b =>
    !search.trim() || b.title.toLowerCase().includes(search.toLowerCase()) ||
    b.authors?.toLowerCase().includes(search.toLowerCase()) ||
    b.book_id.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><BookOpen className="h-6 w-6" />Library</h1>
          <p className="text-muted-foreground mt-1">Books in the space</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={exportCSV}><Download className="h-4 w-4 mr-2" />Export</Button>
          {role === 'admin' && (
            <Dialog open={addOpen} onOpenChange={setAddOpen}>
              <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-2" />Add Book</Button></DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>New Book</DialogTitle></DialogHeader>
                <div className="space-y-3">
                  <div><Label>Title *</Label><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></div>
                  <div><Label>Author(s)</Label><Input value={form.authors} onChange={(e) => setForm({ ...form, authors: e.target.value })} placeholder="Comma-separated" /></div>
                  <div className="grid grid-cols-2 gap-2">
                    <div><Label>ISBN</Label><Input value={form.isbn} onChange={(e) => setForm({ ...form, isbn: e.target.value })} /></div>
                    <div><Label>Year</Label><Input type="number" value={form.year} onChange={(e) => setForm({ ...form, year: e.target.value })} /></div>
                  </div>
                  <div><Label>Publisher</Label><Input value={form.publisher} onChange={(e) => setForm({ ...form, publisher: e.target.value })} /></div>
                  <div><Label>Copies</Label><Input type="number" min={1} value={form.copies_total} onChange={(e) => setForm({ ...form, copies_total: parseInt(e.target.value) || 1 })} /></div>
                  <Button onClick={add} className="w-full">Add Book</Button>
                </div>
              </DialogContent>
            </Dialog>
          )}
        </div>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div><CardTitle>Catalog</CardTitle><CardDescription>{books.length} title{books.length !== 1 && 's'}</CardDescription></div>
            <div className="relative w-72">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Search..." className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader><TableRow>
              <TableHead>Book ID</TableHead><TableHead>Title</TableHead><TableHead>Author(s)</TableHead>
              <TableHead>ISBN</TableHead><TableHead>Publisher</TableHead><TableHead>Year</TableHead>
              <TableHead>Copies</TableHead><TableHead></TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {filtered.map(b => (
                <TableRow key={b.id}>
                  <TableCell className="font-mono text-xs">{b.book_id}</TableCell>
                  <TableCell className="font-medium">{b.title}</TableCell>
                  <TableCell>{b.authors || '—'}</TableCell>
                  <TableCell className="font-mono text-xs">{b.isbn || '—'}</TableCell>
                  <TableCell>{b.publisher || '—'}</TableCell>
                  <TableCell>{b.year || '—'}</TableCell>
                  <TableCell><Badge variant={b.copies_available > 0 ? 'secondary' : 'outline'}>{b.copies_available}/{b.copies_total}</Badge></TableCell>
                  <TableCell>
                    {role === 'admin' && (
                      <div className="flex gap-1">
                        <Button size="sm" variant="ghost" onClick={() => setEdit(b)}><Pencil className="h-3 w-3" /></Button>
                        <Button size="sm" variant="ghost" onClick={() => remove(b.id)}><Trash2 className="h-3 w-3" /></Button>
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {filtered.length === 0 && <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">No books</TableCell></TableRow>}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={!!edit} onOpenChange={(o) => !o && setEdit(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Edit Book</DialogTitle></DialogHeader>
          {edit && (
            <div className="space-y-3">
              <div><Label>Title</Label><Input value={edit.title} onChange={(e) => setEdit({ ...edit, title: e.target.value })} /></div>
              <div><Label>Authors</Label><Input value={edit.authors || ''} onChange={(e) => setEdit({ ...edit, authors: e.target.value })} /></div>
              <div className="grid grid-cols-2 gap-2">
                <div><Label>ISBN</Label><Input value={edit.isbn || ''} onChange={(e) => setEdit({ ...edit, isbn: e.target.value })} /></div>
                <div><Label>Year</Label><Input type="number" value={edit.year || ''} onChange={(e) => setEdit({ ...edit, year: e.target.value ? parseInt(e.target.value) : null })} /></div>
              </div>
              <div><Label>Publisher</Label><Input value={edit.publisher || ''} onChange={(e) => setEdit({ ...edit, publisher: e.target.value })} /></div>
              <div className="grid grid-cols-2 gap-2">
                <div><Label>Total Copies</Label><Input type="number" value={edit.copies_total} onChange={(e) => setEdit({ ...edit, copies_total: parseInt(e.target.value) || 1 })} /></div>
                <div><Label>Available</Label><Input type="number" value={edit.copies_available} onChange={(e) => setEdit({ ...edit, copies_available: parseInt(e.target.value) || 0 })} /></div>
              </div>
              <Button onClick={update} className="w-full">Save</Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
