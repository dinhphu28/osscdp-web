/* eslint-disable react-refresh/only-export-components -- rule helpers are co-located with the builder */
import { useState } from 'react';
import {
  Box,
  Button,
  IconButton,
  MenuItem,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/AddOutlined';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutlineOutlined';
import { z } from 'zod';
import { RuleOp, RuleOperator, type Rule } from '@/lib/api/generated/model';

/**
 * RuleBuilder — a controlled editor for the recursive `Rule` tree.
 *
 * A node groups children under a logical operator (`{ operator, conditions[] }`);
 * a leaf is a single comparison (`{ field, op, value }`). Groups nest arbitrarily
 * deep. See docs/screens/06-segments-and-rule-builder.md.
 *
 * The stateful/behavioral "behavior" leaf (time-window rules) is intentionally out
 * of scope here — it is feature-flagged/beta and the backend has no time-window
 * rules yet (see docs/10-backend-gaps-and-caveats.md).
 */

interface FieldNamespace {
  value: string;
  label: string;
  /** wildcard namespaces (ending in `.`) accept a free-text key suffix. */
  wildcard: boolean;
  timestamp?: boolean;
}

const FIELD_NAMESPACES: FieldNamespace[] = [
  { value: 'profile.traits.', label: 'profile.traits.*', wildcard: true },
  { value: 'profile.computed_attributes.', label: 'profile.computed_attributes.*', wildcard: true },
  { value: 'profile.canonical_user_id', label: 'profile.canonical_user_id', wildcard: false },
  {
    value: 'profile.first_seen_at',
    label: 'profile.first_seen_at',
    wildcard: false,
    timestamp: true,
  },
  {
    value: 'profile.last_seen_at',
    label: 'profile.last_seen_at',
    wildcard: false,
    timestamp: true,
  },
  { value: 'event.event_name', label: 'event.event_name', wildcard: false },
  { value: 'event.type', label: 'event.type', wildcard: false },
  { value: 'event.properties.', label: 'event.properties.*', wildcard: true },
  { value: 'event.context.', label: 'event.context.*', wildcard: true },
];

const ALL_OPS = Object.values(RuleOp);
const TIMESTAMP_OPS: RuleOp[] = [
  RuleOp.eq,
  RuleOp.neq,
  RuleOp.gt,
  RuleOp.gte,
  RuleOp.lt,
  RuleOp.lte,
  RuleOp.exists,
  RuleOp.not_exists,
];
const OPERATORS = Object.values(RuleOperator);

export function createDefaultRule(): Rule {
  return { operator: RuleOperator.and, conditions: [createLeaf()] };
}

function createLeaf(): Rule {
  return { field: '', op: RuleOp.eq, value: '' };
}

function createGroup(): Rule {
  return { operator: RuleOperator.and, conditions: [createLeaf()] };
}

function isNode(rule: Rule): boolean {
  return rule.operator !== undefined && Array.isArray(rule.conditions);
}

function splitField(field: string): { ns: string; suffix: string } {
  const exact = FIELD_NAMESPACES.find((n) => !n.wildcard && n.value === field);
  if (exact) return { ns: exact.value, suffix: '' };
  const wildcard = FIELD_NAMESPACES.find(
    (n) => n.wildcard && field.startsWith(n.value) && field.length > n.value.length,
  );
  if (wildcard) return { ns: wildcard.value, suffix: field.slice(wildcard.value.length) };
  if (field === '') return { ns: FIELD_NAMESPACES[0].value, suffix: '' };
  return { ns: FIELD_NAMESPACES[0].value, suffix: field };
}

function opsForField(field: string): RuleOp[] {
  const ns = FIELD_NAMESPACES.find((n) =>
    n.wildcard ? field.startsWith(n.value) : n.value === field,
  );
  return ns?.timestamp ? TIMESTAMP_OPS : ALL_OPS;
}

// ---------------------------------------------------------------------------
// Client-side validation (Zod) — validates the whole tree before submit.
// ---------------------------------------------------------------------------

const leafSchema = z
  .object({
    field: z.string().min(1, 'Every condition needs a field'),
    op: z.enum([
      'eq',
      'neq',
      'gt',
      'gte',
      'lt',
      'lte',
      'contains',
      'not_contains',
      'in',
      'not_in',
      'exists',
      'not_exists',
    ]),
    value: z.unknown().optional(),
  })
  .refine(
    (l) =>
      l.op === 'exists' || l.op === 'not_exists'
        ? l.value === undefined
        : l.op === 'in' || l.op === 'not_in'
          ? Array.isArray(l.value) && l.value.length > 0
          : l.value !== undefined && l.value !== '' && !Array.isArray(l.value),
    { message: 'A condition value does not match its operator' },
  );

export const ruleSchema: z.ZodType = z.lazy(() =>
  z.union([
    z.object({
      operator: z.enum(['and', 'or', 'not']),
      conditions: z.array(ruleSchema).min(1, 'A group needs at least one condition'),
    }),
    leafSchema,
  ]),
);

/** Returns a human-readable message for the first problem, or null if valid. */
export function validateRule(rule: Rule): string | null {
  const result = ruleSchema.safeParse(rule);
  if (result.success) return null;
  return result.error.issues[0]?.message ?? 'The rule is invalid';
}

// ---------------------------------------------------------------------------
// Components
// ---------------------------------------------------------------------------

export function RuleBuilder({
  value,
  onChange,
  disabled = false,
}: {
  value: Rule;
  onChange: (rule: Rule) => void;
  disabled?: boolean;
}) {
  return (
    <Box>
      {isNode(value) ? (
        <GroupEditor value={value} onChange={onChange} disabled={disabled} depth={0} />
      ) : (
        <LeafEditor value={value} onChange={onChange} disabled={disabled} />
      )}
    </Box>
  );
}

function GroupEditor({
  value,
  onChange,
  onRemove,
  disabled,
  depth,
}: {
  value: Rule;
  onChange: (rule: Rule) => void;
  onRemove?: () => void;
  disabled?: boolean;
  depth: number;
}) {
  const operator = value.operator ?? RuleOperator.and;
  const conditions = value.conditions ?? [];
  const isNot = operator === RuleOperator.not;
  const canAdd = !isNot || conditions.length < 1;

  const setChild = (idx: number, child: Rule) =>
    onChange({ ...value, conditions: conditions.map((c, i) => (i === idx ? child : c)) });
  const removeChild = (idx: number) =>
    onChange({ ...value, conditions: conditions.filter((_, i) => i !== idx) });
  const addLeaf = () => onChange({ ...value, conditions: [...conditions, createLeaf()] });
  const addGroup = () => onChange({ ...value, conditions: [...conditions, createGroup()] });

  return (
    <Box
      sx={{
        border: 1,
        borderColor: 'divider',
        borderRadius: 1,
        p: 1.5,
        bgcolor: depth % 2 === 1 ? 'action.hover' : 'background.paper',
      }}
    >
      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
        <TextField
          select
          size="small"
          label="Operator"
          value={operator}
          disabled={disabled}
          onChange={(e) => {
            const nextOp = e.target.value as RuleOperator;
            const nextConditions =
              nextOp === RuleOperator.not && conditions.length > 1
                ? conditions.slice(0, 1)
                : conditions;
            onChange({ ...value, operator: nextOp, conditions: nextConditions });
          }}
          sx={{ minWidth: 110 }}
        >
          {OPERATORS.map((o) => (
            <MenuItem key={o} value={o}>
              {o.toUpperCase()}
            </MenuItem>
          ))}
        </TextField>
        <Typography variant="caption" color="text.secondary" sx={{ flexGrow: 1 }}>
          {isNot
            ? 'Negates a single nested condition or group.'
            : `Matches when ${operator.toUpperCase()} of the conditions hold.`}
        </Typography>
        {onRemove && (
          <Tooltip title="Remove group">
            <span>
              <IconButton size="small" onClick={onRemove} disabled={disabled}>
                <DeleteOutlineIcon fontSize="small" />
              </IconButton>
            </span>
          </Tooltip>
        )}
      </Stack>

      <Stack spacing={1.5} sx={{ pl: 1.5, borderLeft: 2, borderColor: 'divider' }}>
        {conditions.map((child, idx) =>
          isNode(child) ? (
            <GroupEditor
              key={idx}
              value={child}
              onChange={(c) => setChild(idx, c)}
              onRemove={() => removeChild(idx)}
              disabled={disabled}
              depth={depth + 1}
            />
          ) : (
            <LeafEditor
              key={idx}
              value={child}
              onChange={(c) => setChild(idx, c)}
              onRemove={() => removeChild(idx)}
              disabled={disabled}
            />
          ),
        )}
        {conditions.length === 0 && (
          <Typography variant="caption" color="error">
            Add at least one condition.
          </Typography>
        )}
      </Stack>

      <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 1.5 }}>
        <Button
          size="small"
          startIcon={<AddIcon />}
          onClick={addLeaf}
          disabled={disabled || !canAdd}
        >
          Add condition
        </Button>
        <Button
          size="small"
          startIcon={<AddIcon />}
          onClick={addGroup}
          disabled={disabled || !canAdd}
        >
          Add group
        </Button>
        {isNot && !canAdd && (
          <Typography variant="caption" color="text.secondary">
            NOT groups take a single child.
          </Typography>
        )}
      </Stack>
    </Box>
  );
}

function LeafEditor({
  value,
  onChange,
  onRemove,
  disabled,
}: {
  value: Rule;
  onChange: (leaf: Rule) => void;
  onRemove?: () => void;
  disabled?: boolean;
}) {
  const field = value.field ?? '';
  const { ns, suffix } = splitField(field);
  const namespace = FIELD_NAMESPACES.find((n) => n.value === ns) ?? FIELD_NAMESPACES[0];
  const op = value.op ?? RuleOp.eq;
  const ops = opsForField(field);
  const noValue = op === RuleOp.exists || op === RuleOp.not_exists;
  const arrayValue = op === RuleOp.in || op === RuleOp.not_in;

  const [arrText, setArrText] = useState(() =>
    Array.isArray(value.value) ? value.value.map(String).join(', ') : '',
  );

  const setNamespace = (nsValue: string) => {
    const nsDef = FIELD_NAMESPACES.find((n) => n.value === nsValue) ?? FIELD_NAMESPACES[0];
    const newField = nsDef.wildcard ? nsDef.value + suffix : nsDef.value;
    const validOps = opsForField(newField);
    const nextOp = validOps.includes(op) ? op : validOps[0];
    onChange({ ...value, field: newField, op: nextOp });
  };

  const setSuffix = (s: string) => onChange({ ...value, field: namespace.value + s });

  const setOp = (newOp: RuleOp) => {
    let newValue: unknown = value.value;
    if (newOp === RuleOp.exists || newOp === RuleOp.not_exists) {
      newValue = undefined;
    } else if (newOp === RuleOp.in || newOp === RuleOp.not_in) {
      if (!Array.isArray(newValue)) {
        const seed = typeof value.value === 'string' && value.value ? [value.value] : [];
        newValue = seed;
        setArrText(seed.join(', '));
      }
    } else if (Array.isArray(newValue)) {
      newValue = newValue.map(String).join(', ');
    } else if (newValue === undefined) {
      newValue = '';
    }
    onChange({ ...value, op: newOp, value: newValue });
  };

  const setScalar = (v: string) => onChange({ ...value, value: v });

  const setArray = (text: string) => {
    setArrText(text);
    const arr = text
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    onChange({ ...value, value: arr });
  };

  const scalarDisplay =
    typeof value.value === 'string'
      ? value.value
      : value.value === undefined || value.value === null
        ? ''
        : String(value.value);

  return (
    <Box sx={{ border: 1, borderColor: 'divider', borderRadius: 1, p: 1.5 }}>
      <Stack direction={{ xs: 'column', md: 'row' }} spacing={1} alignItems={{ md: 'center' }}>
        <TextField
          select
          size="small"
          label="Field"
          value={namespace.value}
          disabled={disabled}
          onChange={(e) => setNamespace(e.target.value)}
          sx={{ minWidth: 230 }}
        >
          {FIELD_NAMESPACES.map((n) => (
            <MenuItem key={n.value} value={n.value}>
              {n.label}
            </MenuItem>
          ))}
        </TextField>
        {namespace.wildcard && (
          <TextField
            size="small"
            label="Key"
            placeholder="e.g. email"
            value={suffix}
            disabled={disabled}
            onChange={(e) => setSuffix(e.target.value)}
            sx={{ minWidth: 160 }}
          />
        )}
        <TextField
          select
          size="small"
          label="Operator"
          value={op}
          disabled={disabled}
          onChange={(e) => setOp(e.target.value as RuleOp)}
          sx={{ minWidth: 150 }}
        >
          {ops.map((o) => (
            <MenuItem key={o} value={o}>
              {o}
            </MenuItem>
          ))}
        </TextField>
        {!noValue && !arrayValue && (
          <TextField
            size="small"
            label="Value"
            value={scalarDisplay}
            disabled={disabled}
            onChange={(e) => setScalar(e.target.value)}
            sx={{ minWidth: 180 }}
          />
        )}
        {arrayValue && (
          <TextField
            size="small"
            label="Values (comma-separated)"
            placeholder="a, b, c"
            value={arrText}
            disabled={disabled}
            onChange={(e) => setArray(e.target.value)}
            sx={{ minWidth: 220 }}
          />
        )}
        {noValue && (
          <Typography variant="caption" color="text.secondary" sx={{ alignSelf: 'center' }}>
            No value needed
          </Typography>
        )}
        <Box sx={{ flexGrow: 1 }} />
        {onRemove && (
          <Tooltip title="Remove condition">
            <span>
              <IconButton size="small" onClick={onRemove} disabled={disabled}>
                <DeleteOutlineIcon fontSize="small" />
              </IconButton>
            </span>
          </Tooltip>
        )}
      </Stack>
    </Box>
  );
}
