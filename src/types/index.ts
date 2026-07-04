/**
 * Canonical hand-written types mirroring osscdp backend entities.
 * These supplement the Orval-generated types (src/lib/api/generated) where the
 * OpenAPI spec is incomplete. Use these exact names across features.
 * Source of truth: docs/07-data-model-and-types.md.
 */

// ---- Enums ----
export type AdminRole =
  'SUPER_ADMIN' | 'TENANT_ADMIN' | 'MARKETER' | 'ANALYST' | 'OPERATOR' | 'VIEWER';

export type Permission =
  | 'source:read'
  | 'source:write'
  | 'event:read'
  | 'event:replay'
  | 'profile:read'
  | 'profile:delete'
  | 'segment:read'
  | 'segment:write'
  | 'destination:read'
  | 'destination:write'
  | 'activation:read'
  | 'dlq:read'
  | 'dlq:retry'
  | 'audit:read'
  | 'consent:write'
  | 'pii:read'
  | 'admin:write';

export type ConsentChannel = 'email' | 'sms' | 'push' | 'ads' | 'webhook';
export type ConsentPurpose = 'marketing' | 'analytics' | 'personalization' | 'transactional';
export type ConsentStatus = 'granted' | 'denied' | 'unknown';

export type DestinationType = 'webhook' | 'kafka' | 'push' | 'email' | 'crm' | 'ads' | 'warehouse';
export type ActivationTaskStatus =
  'pending' | 'sending' | 'succeeded' | 'failed_retryable' | 'failed_permanent' | 'dlq' | 'skipped';
export type DlqStatus = 'open' | 'retried' | 'discarded';
export type EventType = 'track' | 'identify' | 'alias';
export type RuleOp =
  | 'eq'
  | 'neq'
  | 'gt'
  | 'gte'
  | 'lt'
  | 'lte'
  | 'contains'
  | 'not_contains'
  | 'in'
  | 'not_in'
  | 'exists'
  | 'not_exists';
export type LogicalOp = 'and' | 'or' | 'not';

// ---- Entities ----
export interface Tenant {
  id: string;
  name: string;
  status: 'active';
  created_at: string;
  updated_at: string;
}

export interface Source {
  id: string;
  tenant_id: string;
  name: string;
  type: string; // e.g. "server"
  status: 'active' | 'disabled';
  config_json?: Record<string, unknown>;
  rate_limit?: number;
  allowed_event_types?: string[];
  created_at: string;
  updated_at: string;
}
export interface SourceKeyOnce {
  api_key: string; // shown once on create/rotate (prefix cdp_)
}

export interface AdminToken {
  id: string;
  name: string;
  role: AdminRole;
  tenant_id: string | null;
  status: 'active';
  created_at?: string;
}
export interface AdminTokenOnce {
  api_token: string; // plaintext once (prefix cdpadm_)
  role: AdminRole;
}

export interface CustomerProfile {
  canonical_user_id: string;
  identity_cluster_id: string;
  // email, phone, name, country (PII-masked unless pii:read)
  traits_json: Record<string, unknown>;
  // total_events, total_orders, last_event_name, last_source_id, last_page_url, last_product_viewed, last_order_at
  computed_attributes_json: Record<string, unknown>;
  first_seen_at: string;
  last_seen_at: string;
  version: number;
  status?: string;
}

export interface IdentityNode {
  namespace: string;
  value_hash: string;
  value_encrypted?: string | null;
}
export interface IdentityCluster {
  canonical_user_id: string;
  status: string;
  nodes?: IdentityNode[];
}
export interface MergeHistoryEntry {
  from_cluster_id: string;
  to_cluster_id: string;
  reason: string;
  event_id?: string;
  created_at: string;
}

export interface RawEvent {
  id: string;
  tenant_id: string;
  event_id: string;
  source_id: string;
  type: EventType | 'batch';
  event_name?: string;
  identifier_key?: string;
  payload_json: Record<string, unknown>;
  payload_hash?: string;
  timestamp: string;
  received_at: string;
  processing_status: string;
  error_reason?: string;
}

// Segment rule tree (recursive)
export type Rule = RuleNode | RuleLeaf;
export interface RuleNode {
  operator: LogicalOp;
  conditions: Rule[];
}
export interface RuleLeaf {
  field: string;
  op: RuleOp;
  value?: unknown | unknown[];
}
// Stateful (advanced/feature-flagged) leaf variant, mutually exclusive with field/op/value:
export interface BehaviorLeaf {
  behavior: {
    kind: 'count' | 'frequency' | 'recency' | 'absence' | 'sequence';
    event_name?: string;
    window?: string; // "7d","24h","30m"
    op?: 'gte' | 'gt' | 'lte' | 'lt' | 'eq';
    value?: number;
    value_prop?: string;
    where?: RuleLeaf;
    steps?: Array<{ event_name: string; where?: RuleLeaf }>;
    within?: string;
    anchor?: object;
    exact?: boolean;
  };
}

export interface Segment {
  id: string;
  name: string;
  description?: string;
  status: string;
  current_version_id?: string;
}
export interface SegmentVersion {
  version: number;
  rule_json: Rule;
  status: string;
}
export interface SegmentMembership {
  customer_profile_id: string;
  status: 'member' | string;
  entered_at?: string;
  exited_at?: string | null;
  last_evaluated_at?: string;
  version?: number;
  transition_seq?: number;
}

export interface Destination {
  id: string;
  tenant_id: string;
  type: DestinationType;
  name: string;
  status: 'active' | 'disabled' | string;
  config_json: Record<string, unknown>;
  channel?: ConsentChannel;
  purpose?: ConsentPurpose;
  // secret_ref never returned
}
export interface WebhookConfig {
  url: string;
  method?: 'POST' | 'PUT';
  headers?: Record<string, string>;
  timeout_ms?: number;
  max_retries?: number;
}
export interface KafkaConfig {
  topic: string;
}
export interface Subscription {
  id: string;
  destination_id: string;
  trigger_type: 'segment_membership';
  segment_id: string;
  status: string;
}
export interface DeliveryLog {
  id?: string;
  status: ActivationTaskStatus | string;
  http_status?: number;
  response_body_hash?: string;
  error_message?: string;
  attempt_count: number;
  sent_at?: string;
}

export interface ConsentRecord {
  channel: ConsentChannel;
  purpose: ConsentPurpose;
  status: ConsentStatus;
  source?: string;
  updated_at?: string;
}

export interface DlqEvent {
  id: string;
  tenant_id: string;
  event_id: string;
  source_id?: string;
  component: string;
  error_code: string;
  error_message: string;
  original_payload: Record<string, unknown>;
  retry_count: number;
  status: DlqStatus;
  failed_at: string;
}

export interface AuditLogEntry {
  id: string;
  tenant_id: string;
  actor_id?: string;
  actor_type: string;
  action: string;
  resource_type: string;
  resource_id: string;
  before_json?: unknown;
  after_json?: unknown;
  ip_address?: string;
  user_agent?: string;
  created_at: string;
}

export interface ApiError {
  error: { code: string; message: string };
}
export interface KeysetPage<T> {
  events: T[];
  next_cursor: string;
}
