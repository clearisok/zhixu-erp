/** Passwords are used verbatim; bcrypt accepts at most 72 UTF-8 bytes. */
export function passwordValidationMessage(value: unknown): string | null {
  if (typeof value !== "string" || Array.from(value).length < 6) return "密码至少6个字符，不要求字符组合。";
  if (value.includes("\0")) return "密码不能包含空字符。";
  if (new TextEncoder().encode(value).length > 72) return "密码过长，请使用不超过72字节的内容。";
  return null;
}

