import { describe, expect, it } from 'vitest';
import type { OperatorInstanceRow } from '$lib/operator/instances-client.js';
import {
	arrearsLabel,
	enforcementPosture,
	mergePage,
	registrationBlockText,
	reservedAtText
} from './instances-state.js';

function row(overrides: Partial<OperatorInstanceRow> = {}): OperatorInstanceRow {
	return {
		univocityInstanceId: 'eip155:84532:0x' + 'aa'.repeat(20),
		state: 'registered',
		holder: 'request:r-1',
		reservedAt: 1_753_000_000,
		...overrides
	};
}

describe('enforcementPosture', () => {
	it('never renders the marker alone as a frozen/active state', () => {
		// The marker is indexer-held only (canopy plan-2607-08): a manual ops
		// freeze reads marker=false, so without the kill-switch the state is
		// unknown, and marker=true only warrants an alarm prompt.
		expect(enforcementPosture(false, undefined).label).toBe('Kill-switch not loaded');
		expect(enforcementPosture(undefined, undefined).label).toBe('Kill-switch not loaded');
		const marked = enforcementPosture(true, undefined);
		expect(marked.alarming).toBe(true);
		expect(marked.label).toContain('load kill-switch');
	});

	it('discriminates manual vs arrears freezes once enabled is known', () => {
		expect(enforcementPosture(true, false)).toMatchObject({
			label: 'Frozen (arrears)',
			alarming: true
		});
		expect(enforcementPosture(false, false)).toMatchObject({
			label: 'Frozen (manual ops)',
			alarming: true
		});
		expect(enforcementPosture(false, true)).toMatchObject({
			label: 'Sealing enabled',
			alarming: false
		});
	});
});

describe('arrearsLabel', () => {
	it('is silent when current and tolerant of unknown states', () => {
		expect(arrearsLabel('current')).toBe('');
		expect(arrearsLabel(undefined)).toBe('');
		expect(arrearsLabel('in-arrears')).toBe('in arrears');
		expect(arrearsLabel('suspect')).toBe('arrears suspect');
		expect(arrearsLabel('weird-future-state')).toBe('arrears: weird-future-state');
	});
});

describe('mergePage', () => {
	it('replaces rows re-fetched for the same instance', () => {
		const a = row();
		const b = row({ univocityInstanceId: 'eip155:84532:0x' + 'bb'.repeat(20) });
		const aRefreshed = row({ holder: 'genesis' });
		const merged = mergePage([a, b], [aRefreshed]);
		expect(merged).toHaveLength(2);
		expect(merged.find((r) => r.univocityInstanceId === a.univocityInstanceId)?.holder).toBe(
			'genesis'
		);
	});
});

describe('registrationBlockText', () => {
	it('distinguishes pending repair (null) from legacy absence', () => {
		expect(registrationBlockText(row({ registrationBlock: null }))).toBe('pending repair');
		expect(registrationBlockText(row())).toBe('—');
		expect(registrationBlockText(row({ registrationBlock: 44_750_035 }))).toBe('44750035');
	});
});

describe('reservedAtText', () => {
	it('renders epoch seconds as a compact UTC stamp', () => {
		expect(reservedAtText(row({ reservedAt: 0 }))).toBe('—');
		expect(reservedAtText(row())).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}Z$/);
	});
});
