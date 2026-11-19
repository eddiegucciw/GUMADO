import { supabase, unwrap } from './db';
import type { DashboardSummary } from './types';

export function dashboardSummary(from: string, to: string): Promise<DashboardSummary> {
  return unwrap<DashboardSummary>(supabase.rpc('dashboard_summary', { p_from: from, p_to: to }));
}

export interface LocationRow { county: string; estate: string; sales_count: number; sales_value: number; collected: number; outstanding: number }
export interface CollectionRow { month: string; method_name: string; payments_count: number; amount: number }
export interface AgentRow { agent_id: string; agent_name: string; sales_count: number; sales_value: number; collected_in_period: number; outstanding: number }

export function salesByLocation(from: string, to: string): Promise<LocationRow[]> {
  return unwrap<LocationRow[]>(supabase.rpc('report_sales_by_location', { p_from: from, p_to: to }));
}

export function collections(from: string, to: string): Promise<CollectionRow[]> {
  return unwrap<CollectionRow[]>(supabase.rpc('report_collections', { p_from: from, p_to: to }));
}

export function agentPerformance(from: string, to: string): Promise<AgentRow[]> {
  return unwrap<AgentRow[]>(supabase.rpc('report_agent_performance', { p_from: from, p_to: to }));
}
