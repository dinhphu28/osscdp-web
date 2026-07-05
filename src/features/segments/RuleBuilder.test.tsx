import { describe, it, expect, vi } from 'vitest';
import { useState } from 'react';
import { screen } from '@testing-library/react';
import type { Rule } from '@/lib/api/generated/model';
import { renderWithProviders } from '@/test/renderWithProviders';
import { RuleBuilder, createDefaultRule, validateRule } from './RuleBuilder';

/** Controlled wrapper so interactions see the latest value. */
function ControlledRuleBuilder({
  initial,
  onChange,
}: {
  initial: Rule;
  onChange: (rule: Rule) => void;
}) {
  const [rule, setRule] = useState<Rule>(initial);
  return (
    <RuleBuilder
      value={rule}
      onChange={(next) => {
        setRule(next);
        onChange(next);
      }}
    />
  );
}

describe('createDefaultRule', () => {
  it('returns an AND group with a single empty leaf', () => {
    expect(createDefaultRule()).toEqual({
      operator: 'and',
      conditions: [{ field: '', op: 'eq', value: '' }],
    });
  });
});

describe('validateRule', () => {
  it('returns a message for a leaf with an empty field', () => {
    const rule: Rule = {
      operator: 'and',
      conditions: [{ field: '', op: 'eq', value: 'x' }],
    };
    expect(validateRule(rule)).not.toBeNull();
  });

  it('returns null for a valid single leaf group', () => {
    const rule: Rule = {
      operator: 'and',
      conditions: [{ field: 'profile.canonical_user_id', op: 'eq', value: 'x' }],
    };
    expect(validateRule(rule)).toBeNull();
  });
});

describe('RuleBuilder', () => {
  it('drives a leaf into a JSON payload via onChange', async () => {
    const onChange = vi.fn<(rule: Rule) => void>();
    const { user } = renderWithProviders(
      <ControlledRuleBuilder initial={createDefaultRule()} onChange={onChange} />,
    );

    // Pick a non-wildcard field so no Key/suffix input appears.
    await user.click(screen.getByRole('combobox', { name: 'Field' }));
    await user.click(screen.getByRole('option', { name: 'profile.canonical_user_id' }));

    // Operator stays at 'eq'; type a scalar value.
    await user.type(screen.getByRole('textbox', { name: 'Value' }), 'x');

    expect(onChange.mock.calls.at(-1)?.[0]).toEqual({
      operator: 'and',
      conditions: [{ field: 'profile.canonical_user_id', op: 'eq', value: 'x' }],
    });
  });

  it('adds a second condition on "Add condition"', async () => {
    const onChange = vi.fn<(rule: Rule) => void>();
    const { user } = renderWithProviders(
      <ControlledRuleBuilder initial={createDefaultRule()} onChange={onChange} />,
    );

    await user.click(screen.getByRole('button', { name: 'Add condition' }));

    const latest = onChange.mock.calls.at(-1)?.[0] as { conditions?: unknown[] } | undefined;
    expect(latest?.conditions).toHaveLength(2);
  });
});
