import { decodeCborDeterministic } from '@forestrie/encoding';

/** Longest detail string returned; problem bodies are short, this is a guard. */
const MAX_DETAIL = 500;

function readString(source: unknown, key: string): string | undefined {
	if (source instanceof Map) {
		const value = source.get(key);
		return typeof value === 'string' ? value : undefined;
	}
	if (typeof source === 'object' && source !== null) {
		const value = (source as Record<string, unknown>)[key];
		return typeof value === 'string' ? value : undefined;
	}
	return undefined;
}

function fromProblem(decoded: unknown): string | undefined {
	const detail = readString(decoded, 'detail');
	const title = readString(decoded, 'title');
	if (detail && title) return `${title}: ${detail}`;
	return detail ?? title;
}

/**
 * The human-readable reason a canopy or coordinator request was rejected.
 *
 * canopy-api answers with RFC 9457 problem details encoded as CBOR (served
 * as `application/cbor` on most routes and `application/problem+cbor` on
 * the SCRAPI ones); the coordinator uses `application/problem+json`.
 * Reading such a body with `response.text()` yields unreadable bytes, which
 * is how the 2026-09-20 `genesis POST failed: 400` outage hid its cause
 * (`Invalid CBOR body`) for four qualification runs (FOR-579). This decodes
 * whichever form arrived and falls back to the text body. It never throws
 * and never returns more than {@link MAX_DETAIL} characters.
 */
export async function responseProblemDetail(response: Response): Promise<string> {
	const contentType = (response.headers.get('content-type') ?? '').toLowerCase();
	let text = '';
	try {
		const bytes = new Uint8Array(await response.arrayBuffer());
		if (bytes.length === 0) return '';
		if (contentType.includes('cbor')) {
			const problem = fromProblem(decodeCborDeterministic(bytes));
			if (problem) return problem.slice(0, MAX_DETAIL);
		}
		text = new TextDecoder().decode(bytes);
		if (contentType.includes('json')) {
			const problem = fromProblem(JSON.parse(text));
			if (problem) return problem.slice(0, MAX_DETAIL);
		}
	} catch {
		// fall through to whatever text we have
	}
	return text.slice(0, MAX_DETAIL);
}
