import { useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { MainLayout } from '@/components/layout/MainLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { User, Shield, Bell, Database, Key } from 'lucide-react';

export default function Settings() {
  const { profile, role, user } = useAuth();
  const [fullName, setFullName] = useState(profile?.full_name || '');
  const [saving, setSaving] = useState(false);

  const handleUpdateProfile = async () => {
    if (!user) return;
    
    setSaving(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ full_name: fullName })
        .eq('id', user.id);

      if (error) throw error;
      toast.success('Profile updated successfully');
    } catch (error) {
      console.error('Error updating profile:', error);
      toast.error('Failed to update profile');
    } finally {
      setSaving(false);
    }
  };

  const getInitials = (name: string | null, email: string | null) => {
    if (name) {
      return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
    }
    if (email) {
      return email[0].toUpperCase();
    }
    return 'U';
  };

  return (
    <MainLayout>
      <div className="max-w-4xl mx-auto space-y-8">
        {/* Header */}
        <div className="animate-fade-in">
          <h1 className="text-3xl font-bold text-foreground">Settings</h1>
          <p className="text-muted-foreground mt-1">Manage your account and preferences</p>
        </div>

        {/* Profile Section */}
        <Card className="glass-card animate-slide-up">
          <CardHeader>
            <div className="flex items-center gap-2">
              <User className="h-5 w-5 text-primary" />
              <CardTitle className="text-foreground">Profile</CardTitle>
            </div>
            <CardDescription>Your personal information</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex items-center gap-6">
              <Avatar className="h-20 w-20 border-2 border-border">
                <AvatarFallback className="bg-secondary text-secondary-foreground text-xl">
                  {getInitials(profile?.full_name ?? null, profile?.email ?? null)}
                </AvatarFallback>
              </Avatar>
              <div>
                <h3 className="text-lg font-semibold text-foreground">{profile?.full_name || 'User'}</h3>
                <p className="text-muted-foreground">{profile?.email}</p>
                <div className="flex items-center gap-2 mt-2">
                  <Shield className="h-4 w-4 text-primary" />
                  <Badge variant="secondary" className="capitalize">{role || 'member'}</Badge>
                </div>
              </div>
            </div>

            <Separator className="bg-border" />

            <div className="grid gap-4 max-w-md">
              <div className="space-y-2">
                <Label htmlFor="fullName">Full Name</Label>
                <Input
                  id="fullName"
                  value={fullName}
                  onChange={e => setFullName(e.target.value)}
                  placeholder="Enter your full name"
                  className="input-enhanced"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  value={profile?.email || ''}
                  disabled
                  className="input-enhanced opacity-60"
                />
                <p className="text-xs text-muted-foreground">Email cannot be changed</p>
              </div>
              <Button
                onClick={handleUpdateProfile}
                disabled={saving}
                className="w-fit btn-glow"
              >
                {saving ? 'Saving...' : 'Save Changes'}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* System Info */}
        <Card className="glass-card animate-slide-up" style={{ animationDelay: '100ms' }}>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Database className="h-5 w-5 text-primary" />
              <CardTitle className="text-foreground">System Information</CardTitle>
            </div>
            <CardDescription>Platform details and integrations</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 text-sm">
              <div className="flex items-center justify-between p-4 rounded-lg bg-secondary/30">
                <div>
                  <p className="font-medium text-foreground">Database</p>
                  <p className="text-muted-foreground">Lovable Cloud (PostgreSQL)</p>
                </div>
                <Badge className="bg-success/20 text-success border-success/30">Connected</Badge>
              </div>
              <div className="flex items-center justify-between p-4 rounded-lg bg-secondary/30">
                <div>
                  <p className="font-medium text-foreground">Authentication</p>
                  <p className="text-muted-foreground">Email & Password</p>
                </div>
                <Badge className="bg-success/20 text-success border-success/30">Active</Badge>
              </div>
              <div className="flex items-center justify-between p-4 rounded-lg bg-secondary/30">
                <div>
                  <p className="font-medium text-foreground">API Integration</p>
                  <p className="text-muted-foreground">Ready for n8n webhooks</p>
                </div>
                <Badge className="bg-info/20 text-info border-info/30">Available</Badge>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* API Keys Info */}
        <Card className="glass-card animate-slide-up" style={{ animationDelay: '200ms' }}>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Key className="h-5 w-5 text-primary" />
              <CardTitle className="text-foreground">API Access</CardTitle>
            </div>
            <CardDescription>External integrations and webhooks</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="p-4 rounded-lg bg-secondary/30 border border-border">
              <p className="text-sm text-muted-foreground">
                HNS Hub is ready to receive data from external automation tools like n8n. 
                Contact your administrator to set up webhook endpoints for:
              </p>
              <ul className="mt-3 space-y-2 text-sm">
                <li className="flex items-center gap-2 text-foreground">
                  <div className="w-1.5 h-1.5 rounded-full bg-primary" />
                  Proposal status updates
                </li>
                <li className="flex items-center gap-2 text-foreground">
                  <div className="w-1.5 h-1.5 rounded-full bg-primary" />
                  Request creation from emails
                </li>
                <li className="flex items-center gap-2 text-foreground">
                  <div className="w-1.5 h-1.5 rounded-full bg-primary" />
                  Delivery notifications
                </li>
              </ul>
            </div>
          </CardContent>
        </Card>
      </div>
    </MainLayout>
  );
}
