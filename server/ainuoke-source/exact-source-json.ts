import { SourceError } from "./contract.js";

/** Preserve upstream JSON number lexemes, including integers beyond IEEE754.
 * Call the runtime probe before a process receives credentials. */
export function parseExactSourceJson(text: string, runtimeCode = "source_exact_runtime_required"): unknown {
  const parser = JSON.parse as (text: string, reviver: (key: string, value: unknown, context?: { source?: string }) => unknown) => unknown;
  return parser(text, (_key, value, context) => {
    if (typeof value !== "number") return value;
    if (typeof context?.source !== "string") throw new SourceError(runtimeCode);
    return context.source;
  });
}
export function assertExactSourceJsonRuntime(code = "source_exact_runtime_required") {
  if (parseExactSourceJson("9007199254740993", code) !== "9007199254740993") throw new SourceError(code);
}

/** JSON.parse checks the grammar; this second lexical walk rejects duplicate
 * decoded keys at every nesting level. It does not parse numbers a second time. */
export function strictExactSourceJson(text: string, code = "source_exact_json_invalid"): unknown {
  try {
    const value = parseExactSourceJson(text);
    const tokens = /\s*("(?:[^"\\\u0000-\u001f]|\\["\\/bfnrt]|\\u[0-9a-fA-F]{4})*"|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?|true|false|null|[{}\[\]:,])/gy;
    const stack: Array<{ object: boolean; key: boolean; seen: Set<string> }> = [];
    let end = 0, match: RegExpExecArray | null;
    while ((match = tokens.exec(text))) {
      end = tokens.lastIndex;
      const token = match[1], top = stack.at(-1);
      if (token === "{" || token === "[") {
        stack.push({ object: token === "{", key: token === "{", seen: new Set() });
        if (stack.length > 64) throw new Error();
      } else if (token === "}" || token === "]") stack.pop();
      else if (token === "," && top?.object) top.key = true;
      else if (token.startsWith('"') && top?.object && top.key) {
        const key = JSON.parse(token) as string;
        if (top.seen.has(key)) throw new Error();
        top.seen.add(key); top.key = false;
      }
    }
    if (stack.length || text.slice(end).trim()) throw new Error();
    return value;
  } catch { throw new SourceError(code); }
}
