import { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { FileText, Target, Inbox, Activity, Clock, User, ArrowRight } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { MainLayout } from '@/components/layout/MainLayout';
import { MetricCard } from '@/components/ui/metric-card';
import { StatusBadge } from '@/components/ui/status-badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { AuditLog, Proposal, Request as RequestType, Objective } from '@/types/database';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';

export default function Dashboard() {
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [requests, setRequests] = useState<RequestType[]>([]);
  const [objectives, setObjectives] = useState<Objective[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    try {
      const [proposalsRes, requestsRes, objectivesRes, logsRes] = await Promise.all([
        supabase.from('proposals').select('*').order('created_at', { ascending: false }),
        supabase.from('requests').select('*').order('created_at', { ascending: false }),
        supabase.from('objectives').select('*').order('created_at', { ascending: false }),
        supabase.from('audit_logs').select('*').order('created_at', { ascending: false }).limit(10),
      ]);

      if (proposalsRes.data) setProposals(proposalsRes.data as Proposal[]);
      if (requestsRes.data) setRequests(requestsRes.data as RequestType[]);
      if (objectivesRes.data) setObjectives(objectivesRes.data as Objective[]);
      if (logsRes.data) setAuditLogs(logsRes.data as AuditLog[]);
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  // Calculate metrics
  const proposalsInPipeline = proposals.filter(p => !['delivered', 'cancelled'].includes(p.status)).length;
  const pendingRequests = requests.filter(r => r.status === 'pending').length;
  const avgOkrProgress = objectives.length > 0
    ? Math.round(objectives.reduce((sum, o) => sum + o.progress, 0) / objectives.length)
    : 0;

  // Chart data
  const proposalStatusData = [
    { name: 'New', value: proposals.filter(p => p.status === 'new').length, color: 'hsl(199, 89%, 48%)' },
    { name: 'Understanding', value: proposals.filter(p => p.status === 'understanding').length, color: 'hsl(280, 68%, 60%)' },
    { name: 'Construction', value: proposals.filter(p => p.status === 'construction').length, color: 'hsl(38, 92%, 50%)' },
    { name: 'Delivered', value: proposals.filter(p => p.status === 'delivered').length, color: 'hsl(142, 76%, 36%)' },
    { name: 'Cancelled', value: proposals.filter(p => p.status === 'cancelled').length, color: 'hsl(0, 84%, 60%)' },
  ].filter(d => d.value > 0);

  const requestsByPriority = [
    { name: 'Low', count: requests.filter(r => r.priority === 'low').length },
    { name: 'Medium', count: requests.filter(r => r.priority === 'medium').length },
    { name: 'High', count: requests.filter(r => r.priority === 'high').length },
  ];

  const formatAction = (action: string) => {
    return action.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  };

  const formatEntityType = (type: string) => {
    return type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  };

  if (loading) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center h-96">
          <div className="animate-spin rounded-full h-8 w-8 border-2 border-primary border-t-transparent" />
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="space-y-8">
        {/* Header */}
        <div className="animate-fade-in">
          <h1 className="text-3xl font-bold text-foreground">Dashboard</h1>
          <p className="text-muted-foreground mt-1">Overview of your team's performance</p>
        </div>

        {/* Metrics */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <MetricCard
            title="Proposals in Pipeline"
            value={proposalsInPipeline}
            subtitle={`${proposals.length} total proposals`}
            icon={FileText}
          />
          <MetricCard
            title="Pending Requests"
            value={pendingRequests}
            subtitle={`${requests.filter(r => r.status === 'in_progress').length} in progress`}
            icon={Inbox}
          />
          <MetricCard
            title="OKR Progress"
            value={`${avgOkrProgress}%`}
            subtitle={`${objectives.length} active objectives`}
            icon={Target}
          />
          <MetricCard
            title="Total Activities"
            value={auditLogs.length}
            subtitle="Last 10 actions"
            icon={Activity}
          />
        </div>

        {/* Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Proposal Status Distribution */}
          <Card className="glass-card">
            <CardHeader>
              <CardTitle className="text-lg font-semibold text-foreground">Proposal Status Distribution</CardTitle>
            </CardHeader>
            <CardContent>
              {proposalStatusData.length > 0 ? (
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={proposalStatusData}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={90}
                        paddingAngle={2}
                        dataKey="value"
                      >
                        {proposalStatusData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{
                          backgroundColor: 'hsl(222, 47%, 13%)',
                          border: '1px solid hsl(215, 28%, 20%)',
                          borderRadius: '8px',
                          color: 'hsl(210, 40%, 98%)',
                        }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="flex flex-wrap justify-center gap-4 mt-4">
                    {proposalStatusData.map((entry) => (
                      <div key={entry.name} className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: entry.color }} />
                        <span className="text-sm text-muted-foreground">{entry.name} ({entry.value})</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="h-64 flex items-center justify-center text-muted-foreground">
                  No proposals yet
                </div>
              )}
            </CardContent>
          </Card>

          {/* Requests by Priority */}
          <Card className="glass-card">
            <CardHeader>
              <CardTitle className="text-lg font-semibold text-foreground">Requests by Priority</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={requestsByPriority} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(215, 28%, 20%)" />
                    <XAxis type="number" stroke="hsl(215, 20%, 65%)" />
                    <YAxis dataKey="name" type="category" stroke="hsl(215, 20%, 65%)" />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: 'hsl(222, 47%, 13%)',
                        border: '1px solid hsl(215, 28%, 20%)',
                        borderRadius: '8px',
                        color: 'hsl(210, 40%, 98%)',
                      }}
                    />
                    <Bar dataKey="count" fill="hsl(217, 91%, 60%)" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Recent Activity */}
        <Card className="glass-card">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-lg font-semibold text-foreground">Recent Activity</CardTitle>
            <Activity className="h-5 w-5 text-primary" />
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-80">
              {auditLogs.length > 0 ? (
                <div className="space-y-4">
                  {auditLogs.map((log, index) => (
                    <div
                      key={log.id}
                      className="flex items-start gap-4 p-4 rounded-lg bg-secondary/30 hover:bg-secondary/50 transition-colors animate-slide-up"
                      style={{ animationDelay: `${index * 50}ms` }}
                    >
                      <div className="p-2 rounded-lg bg-primary/10">
                        <Activity className="h-4 w-4 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-foreground">{formatAction(log.action)}</span>
                          <span className="text-muted-foreground">on</span>
                          <span className="text-primary">{formatEntityType(log.entity_type)}</span>
                        </div>
                        <div className="flex items-center gap-4 mt-1 text-sm text-muted-foreground">
                          <div className="flex items-center gap-1">
                            <User className="h-3.5 w-3.5" />
                            <span>{log.user_email || 'System'}</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <Clock className="h-3.5 w-3.5" />
                            <span>{format(new Date(log.created_at), 'MMM d, h:mm a')}</span>
                          </div>
                        </div>
                        {(log.previous_status || log.new_status) && (
                          <div className="flex items-center gap-2 mt-2">
                            {log.previous_status && (
                              <StatusBadge status={log.previous_status as any} className="opacity-60" />
                            )}
                            {log.previous_status && log.new_status && (
                              <ArrowRight className="h-4 w-4 text-muted-foreground" />
                            )}
                            {log.new_status && (
                              <StatusBadge status={log.new_status as any} />
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center h-full text-center py-12">
                  <Activity className="h-12 w-12 text-muted-foreground/50 mb-4" />
                  <p className="text-muted-foreground">No recent activity</p>
                </div>
              )}
            </ScrollArea>
          </CardContent>
        </Card>
      </div>
    </MainLayout>
  );
}
